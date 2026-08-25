from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status as http_status

from apps.accounts.models import User
from apps.assets.models import ATM
from apps.assets.views import record_atm_status_change
from apps.audit.models import AuditLog
from apps.common.permissions import (
    ScopedQuerysetMixin, IsSupervisor, IsTechnician, is_supervisor, is_technician, require,
)
from apps.notifications.views import notify
from .models import Incident, TroubleshootingAction, Escalation, Resolution, Verification
from .serializers import IncidentSerializer, TroubleshootingActionSerializer, EscalationSerializer, ResolutionSerializer, VerificationSerializer

SUPERVISOR_STATUSES = {Incident.Status.ACKNOWLEDGED, Incident.Status.VERIFIED, Incident.Status.CLOSED}


def district_supervisors(incident):
    from django.db.models import Q
    district_id = incident.atm.branch.district_id
    return User.objects.filter(is_active=True).filter(
        Q(district_id=district_id, role="SUPERVISOR") | Q(role="ADMINISTRATOR")
    )


class IncidentViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset=Incident.objects.select_related("atm","atm__branch","atm__branch__district").prefetch_related("actions","escalations").order_by("-created_at"); serializer_class=IncidentSerializer; search_fields=["title","description","error_message","atm__reference"]; filterset_fields=["status","priority","category","atm","assigned_to","atm__branch__district"]; ordering_fields=["created_at","priority","status"]
    def scope_queryset(self,qs):
        u=self.request.user
        if u.is_staff or not u.district_id:return qs
        return qs.filter(atm__branch__district_id=u.district_id, **({"atm__branch_id":u.branch_id} if u.branch_id else {}))
    def _audit(self, action_name, incident, new_value=None):
        AuditLog.objects.create(user=self.request.user,action=action_name,entity="Incident",entity_id=incident.incident_id,new_value=new_value or {"status":incident.status})
    def perform_create(self,serializer):
        incident=serializer.save(reported_by=self.request.user); self._audit("INCIDENT_CREATED",incident,{"status":incident.status,"priority":incident.priority})
        if incident.priority==Incident.Priority.CRITICAL:
            notify(set(district_supervisors(incident))|{incident.assigned_to},title=f"Critical incident {incident.incident_id}",body=incident.title,kind="CRITICAL_INCIDENT",incident=incident)
    @action(detail=True,methods=["post"])
    @transaction.atomic
    def assign(self,request,pk=None):
        require(is_supervisor(request.user),"Only supervisors may assign incidents.")
        incident=self.get_object(); assignee_id=request.data.get("assigned_to")
        if not assignee_id:return Response({"assigned_to":["This field is required."]},status=http_status.HTTP_400_BAD_REQUEST)
        incident.assigned_to_id=assignee_id; incident.status=Incident.Status.ASSIGNED; incident.save(update_fields=["assigned_to","status","updated_at"]); self._audit("INCIDENT_ASSIGNED",incident,{"assigned_to":assignee_id,"status":incident.status})
        assignee=User.objects.filter(id=assignee_id).first()
        notify({assignee},title=f"Incident {incident.incident_id} assigned to you",body=incident.title,kind="INCIDENT_ASSIGNED",incident=incident)
        return Response(self.get_serializer(incident).data)
    @action(detail=True,methods=["post"])
    @transaction.atomic
    def status(self,request,pk=None):
        incident=self.get_object(); next_status=request.data.get("status")
        allowed={
            Incident.Status.REPORTED:[Incident.Status.ACKNOWLEDGED],
            Incident.Status.ACKNOWLEDGED:[Incident.Status.ASSIGNED,Incident.Status.INVESTIGATING],
            Incident.Status.ASSIGNED:[Incident.Status.INVESTIGATING],
            Incident.Status.INVESTIGATING:[Incident.Status.TROUBLESHOOTING,Incident.Status.WAITING,Incident.Status.ESCALATED],
            Incident.Status.TROUBLESHOOTING:[Incident.Status.WAITING,Incident.Status.ESCALATED],
            Incident.Status.WAITING:[Incident.Status.INVESTIGATING,Incident.Status.TROUBLESHOOTING,Incident.Status.ESCALATED],
            Incident.Status.ESCALATED:[Incident.Status.INVESTIGATING,Incident.Status.TROUBLESHOOTING],
            Incident.Status.RESOLVED:[Incident.Status.VERIFIED],
            Incident.Status.VERIFIED:[Incident.Status.CLOSED,Incident.Status.TROUBLESHOOTING],
        }
        if next_status not in allowed.get(incident.status,[]):return Response({"detail":f"Invalid transition from {incident.status} to {next_status}."},status=http_status.HTTP_400_BAD_REQUEST)
        if next_status in SUPERVISOR_STATUSES:
            require(is_supervisor(request.user),f"Only supervisors may move an incident to {next_status}.")
        else:
            require(is_technician(request.user),f"Only technicians may move an incident to {next_status}.")
        incident.status=next_status
        if next_status==Incident.Status.RESOLVED:incident.resolved_at=timezone.now()
        if next_status==Incident.Status.CLOSED:incident.closed_at=timezone.now()
        incident.save(); self._audit("INCIDENT_STATUS_CHANGED",incident,{"status":next_status})
        if next_status==Incident.Status.CLOSED:
            notify({incident.reported_by,incident.assigned_to},title=f"Incident {incident.incident_id} closed",body=incident.title,kind="INCIDENT_CLOSED",incident=incident)
        return Response(self.get_serializer(incident).data)
    @action(detail=True,methods=["get","post"],url_path="troubleshooting")
    def troubleshooting(self,request,pk=None):
        incident=self.get_object()
        if request.method=="GET":return Response(TroubleshootingActionSerializer(incident.actions.all(),many=True).data)
        require(is_technician(request.user),"Only technicians may add troubleshooting records.")
        serializer=TroubleshootingActionSerializer(data={**request.data,"incident":incident.id,"technician":request.user.id}); serializer.is_valid(raise_exception=True); action_record=serializer.save()
        if incident.status in [Incident.Status.INVESTIGATING,Incident.Status.ASSIGNED]:incident.status=Incident.Status.TROUBLESHOOTING; incident.save(update_fields=["status","updated_at"])
        self._audit("TROUBLESHOOTING_ADDED",incident,{"action_id":action_record.id}); return Response(TroubleshootingActionSerializer(action_record).data,status=http_status.HTTP_201_CREATED)
    @action(detail=True,methods=["post"])
    @transaction.atomic
    def escalate(self,request,pk=None):
        require(is_technician(request.user),"Only technicians may escalate incidents.")
        incident=self.get_object()
        allowed_from = {
            Incident.Status.INVESTIGATING,
            Incident.Status.TROUBLESHOOTING,
            Incident.Status.WAITING,
        }
        if incident.status not in allowed_from:
            return Response(
                {"detail": f"Cannot escalate an incident in {incident.status}."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not (request.data.get("reason") or "").strip():
            return Response({"reason": ["Escalation reason is required."]}, status=http_status.HTTP_400_BAD_REQUEST)
        summary="\n".join(f"{row.created_at:%Y-%m-%d %H:%M} - {row.action}: {row.result or row.observation}" for row in incident.actions.order_by("created_at"))
        serializer=EscalationSerializer(data={**request.data,"incident":incident.id,"escalated_by":request.user.id,"troubleshooting_summary":request.data.get("troubleshooting_summary") or summary,"priority":request.data.get("priority") or incident.priority}); serializer.is_valid(raise_exception=True); record=serializer.save(); incident.status=Incident.Status.ESCALATED; incident.escalation_status="ESCALATED"; incident.save(update_fields=["status","escalation_status","updated_at"]); self._audit("INCIDENT_ESCALATED",incident,{"escalation_id":record.id})
        notify(set(district_supervisors(incident))|{incident.assigned_to},title=f"Incident {incident.incident_id} escalated",body=record.reason,kind="INCIDENT_ESCALATED",incident=incident)
        return Response(EscalationSerializer(record).data,status=http_status.HTTP_201_CREATED)
    @action(detail=True,methods=["post"])
    @transaction.atomic
    def resolve(self,request,pk=None):
        require(is_technician(request.user),"Only technicians may resolve incidents.")
        incident=self.get_object()
        allowed_from = {
            Incident.Status.INVESTIGATING,
            Incident.Status.TROUBLESHOOTING,
            Incident.Status.WAITING,
            Incident.Status.ESCALATED,
        }
        if incident.status not in allowed_from:
            return Response(
                {"detail": f"Cannot resolve an incident in {incident.status}. Complete investigation and troubleshooting first."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not (request.data.get("final_result") or request.data.get("final_status")):
            return Response({"final_result": ["A final result is required before resolving."]}, status=http_status.HTTP_400_BAD_REQUEST)
        defaults={"description":request.data.get("description",""),"action_performed":request.data.get("action_performed",""),"final_status":request.data.get("final_status",""),"technician":request.user,"resolved_at":timezone.now()}
        resolution,_=Resolution.objects.update_or_create(incident=incident,defaults=defaults)
        incident.status=Incident.Status.RESOLVED; incident.resolved_at=timezone.now(); incident.final_result=request.data.get("final_result") or defaults["final_status"]; incident.save(update_fields=["status","resolved_at","final_result","updated_at"])
        self._audit("INCIDENT_RESOLVED",incident,{"resolution_id":resolution.id})
        notify(district_supervisors(incident),title=f"Incident {incident.incident_id} resolved — verification required",body=resolution.description,kind="INCIDENT_RESOLVED",incident=incident)
        return Response(ResolutionSerializer(resolution).data,status=http_status.HTTP_201_CREATED)
    @action(detail=True,methods=["post"])
    @transaction.atomic
    def verify(self,request,pk=None):
        require(is_supervisor(request.user),"Only supervisors may verify resolutions.")
        incident=self.get_object()
        if not hasattr(incident,"resolution"):return Response({"detail":"A resolution is required before verification."},status=http_status.HTTP_400_BAD_REQUEST)
        defaults={"verified_by":request.user,"atm_available":bool(request.data.get("atm_available")),"issue_cleared":bool(request.data.get("issue_cleared")),"communication_working":bool(request.data.get("communication_working")),"approved_test_completed":bool(request.data.get("approved_test_completed")),"notes":request.data.get("notes","")}
        record,_=Verification.objects.update_or_create(resolution=incident.resolution,defaults=defaults)
        if all(defaults[k] for k in ["atm_available","issue_cleared","communication_working","approved_test_completed"]):
            incident.status=Incident.Status.VERIFIED
            if incident.atm.status in [ATM.Status.OFFLINE, ATM.Status.FAULT, ATM.Status.COMMUNICATION_PROBLEM, ATM.Status.ERROR, ATM.Status.UNAVAILABLE]:
                record_atm_status_change(incident.atm, ATM.Status.OPERATIONAL, request.user, "Incident verification confirmed restored service.")
        else:
            incident.status=Incident.Status.TROUBLESHOOTING
        incident.save(update_fields=["status","updated_at"]); self._audit("INCIDENT_VERIFIED",incident,{"verification_id":record.id,"status":incident.status})
        return Response(VerificationSerializer(record).data,status=http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def retest(self, request, pk=None):
        require(is_technician(request.user), "Only technicians may retest incidents.")
        incident = self.get_object()
        allowed_from = {
            Incident.Status.INVESTIGATING,
            Incident.Status.TROUBLESHOOTING,
            Incident.Status.WAITING,
            Incident.Status.ESCALATED,
        }
        if incident.status not in allowed_from:
            return Response(
                {"detail": f"Cannot retest an incident in {incident.status}."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        outcome = request.data.get("outcome")
        notes = request.data.get("notes", "")
        if outcome not in {"PROBLEM_REMAINS", "SERVICE_RESTORED"}:
            return Response({"outcome": ["Select either PROBLEM_REMAINS or SERVICE_RESTORED."]}, status=http_status.HTTP_400_BAD_REQUEST)
        action = TroubleshootingAction.objects.create(
            incident=incident,
            technician=request.user,
            action_type=TroubleshootingAction.ActionType.RETEST_ATM,
            action="Retest ATM",
            observation=notes,
            result="Problem remains" if outcome == "PROBLEM_REMAINS" else "Service restored",
            remarks=notes,
        )
        if outcome == "PROBLEM_REMAINS":
            incident.status = Incident.Status.TROUBLESHOOTING
            incident.save(update_fields=["status", "updated_at"])
        else:
            resolution, _ = Resolution.objects.update_or_create(
                incident=incident,
                defaults={
                    "description": request.data.get("description") or "Service restored after retest.",
                    "action_performed": request.data.get("action_performed") or "ATM retested and confirmed operational.",
                    "final_status": request.data.get("final_status") or "Service restored",
                    "technician": request.user,
                    "resolved_at": timezone.now(),
                },
            )
            incident.status = Incident.Status.RESOLVED
            incident.resolved_at = timezone.now()
            incident.final_result = request.data.get("final_result") or "Service restored"
            incident.save(update_fields=["status", "resolved_at", "final_result", "updated_at"])
            record_atm_status_change(incident.atm, ATM.Status.OPERATIONAL, request.user, "Technician confirmed service restored during retest.")
            self._audit("INCIDENT_RESOLVED", incident, {"resolution_id": resolution.id})
        self._audit("INCIDENT_RETESTED", incident, {"action_id": action.id, "outcome": outcome})
        return Response({"incident": IncidentSerializer(incident).data, "action": TroubleshootingActionSerializer(action).data})

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def close(self, request, pk=None):
        require(is_supervisor(request.user), "Only supervisors may close incidents.")
        incident = self.get_object()
        if incident.status != Incident.Status.VERIFIED:
            return Response({"detail": "Only verified incidents can be closed."}, status=http_status.HTTP_400_BAD_REQUEST)
        if not incident.final_result:
            return Response({"detail": "A final result is required before closure."}, status=http_status.HTTP_400_BAD_REQUEST)
        incident.status = Incident.Status.CLOSED
        incident.closed_at = timezone.now()
        incident.save(update_fields=["status", "closed_at", "updated_at"])
        self._audit("INCIDENT_CLOSED", incident, {"status": incident.status})
        notify({incident.reported_by, incident.assigned_to}, title=f"Incident {incident.incident_id} closed", body=incident.title, kind="INCIDENT_CLOSED", incident=incident)
        return Response(self.get_serializer(incident).data)

    @action(detail=True, methods=["get"])
    def timeline(self, request, pk=None):
        incident = self.get_object()
        rows = [
            {
                "time": incident.created_at,
                "type": "INCIDENT_REPORTED",
                "actor": incident.reported_by.full_name or incident.reported_by.username,
                "summary": "Incident reported",
                "details": incident.description,
            }
        ]
        for action in incident.actions.select_related("technician").order_by("created_at"):
            rows.append(
                {
                    "time": action.created_at,
                    "type": action.action_type,
                    "actor": action.technician.full_name or action.technician.username,
                    "summary": action.action,
                    "details": action.result or action.observation,
                }
            )
        for escalation in incident.escalations.select_related("escalated_by").order_by("created_at"):
            rows.append(
                {
                    "time": escalation.created_at,
                    "type": "INCIDENT_ESCALATED",
                    "actor": escalation.escalated_by.full_name or escalation.escalated_by.username,
                    "summary": f"Escalated to {escalation.required_team}",
                    "details": escalation.reason,
                }
            )
        if hasattr(incident, "resolution"):
            rows.append(
                {
                    "time": incident.resolution.resolved_at,
                    "type": "INCIDENT_RESOLVED",
                    "actor": incident.resolution.technician.full_name or incident.resolution.technician.username,
                    "summary": "Resolution recorded",
                    "details": incident.resolution.description,
                }
            )
            if hasattr(incident.resolution, "verification"):
                verification = incident.resolution.verification
                rows.append(
                    {
                        "time": verification.created_at,
                        "type": "INCIDENT_VERIFIED",
                        "actor": verification.verified_by.full_name or verification.verified_by.username,
                        "summary": "Resolution verification completed",
                        "details": verification.notes,
                    }
                )
        rows.sort(key=lambda item: item["time"])
        return Response(rows)
