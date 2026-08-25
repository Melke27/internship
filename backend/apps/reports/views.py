from django.db.models import Avg, Count, DurationField, F, Q
from django.db.models.functions import Cast
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.assets.models import ATM, ATMStatusHistory, Maintenance
from apps.incidents.models import Incident, TroubleshootingAction
from apps.organization.models import Branch, District


def scoped(user):
    districts = District.objects.all()
    branches = Branch.objects.all()
    atms = ATM.objects.select_related("branch", "branch__district")
    incidents = Incident.objects.select_related("atm", "atm__branch", "assigned_to")
    if not user.is_staff and user.district_id:
        districts = districts.filter(id=user.district_id)
        branches = branches.filter(district_id=user.district_id)
        atms = atms.filter(branch__district_id=user.district_id)
        incidents = incidents.filter(atm__branch__district_id=user.district_id)
        if user.branch_id:
            branches = branches.filter(id=user.branch_id)
            atms = atms.filter(branch_id=user.branch_id)
            incidents = incidents.filter(atm__branch_id=user.branch_id)
    return districts, branches, atms, incidents


class DashboardSummaryView(APIView):
    def get(self, request):
        user = request.user
        districts, branches, atms, incidents = scoped(user)
        open_incidents = incidents.exclude(status=Incident.Status.CLOSED)
        today = timezone.now().date()
        attention = atms.exclude(status__in=[ATM.Status.OPERATIONAL, ATM.Status.AVAILABLE]).order_by("reference")[:8]
        district = districts.first()
        recent_incidents = open_incidents.order_by("-created_at")[:8]
        recent_actions = TroubleshootingAction.objects.filter(incident__in=incidents).select_related(
            "incident", "technician", "incident__atm"
        ).order_by("-created_at")[:8]
        recent_status_changes = ATMStatusHistory.objects.filter(atm__in=atms).select_related("atm", "changed_by").order_by(
            "-created_at"
        )[:8]
        technicians = User.objects.filter(assigned_incidents__in=open_incidents).distinct()
        attention_rows = []
        for atm in attention:
            active = atm.incidents.exclude(status=Incident.Status.CLOSED).order_by("-created_at").first()
            attention_rows.append(
                {
                    "id": atm.id,
                    "reference": atm.reference,
                    "name": atm.name,
                    "status": atm.status,
                    "health": atm.health,
                    "branch": atm.branch.name,
                    "network_status": atm.network_status,
                    "hardware_status": atm.hardware_status,
                    "last_checked": atm.last_checked,
                    "active_incident": active.incident_id if active else None,
                    "active_incident_id": active.id if active else None,
                }
            )
        return Response(
            {
                "scope": {"district": user.district_id, "branch": user.branch_id},
                "district_name": district.name if district else "District",
                "last_updated": timezone.now(),
                "districts": districts.count(),
                "branches": branches.count(),
                "atms": atms.count(),
                "atm_status": {status: atms.filter(status=status).count() for status, _ in ATM.Status.choices},
                "atm_health": {status: atms.filter(health=status).count() for status, _ in ATM.Health.choices},
                "open_incidents": open_incidents.count(),
                "critical_incidents": open_incidents.filter(priority=Incident.Priority.CRITICAL).count(),
                "escalated_incidents": open_incidents.filter(status=Incident.Status.ESCALATED).count(),
                "maintenance_count": Maintenance.objects.filter(atm__in=atms).exclude(status=Maintenance.Status.VERIFIED).count(),
                "resolved_today": incidents.filter(resolved_at__date=today).count(),
                "incidents_by_priority": dict(open_incidents.values_list("priority").annotate(total=Count("id"))),
                "attention_atms": attention_rows,
                "recent_incidents": [
                    {
                        "id": incident.id,
                        "incident_id": incident.incident_id,
                        "title": incident.title,
                        "status": incident.status,
                        "priority": incident.priority,
                        "atm_reference": incident.atm.reference,
                        "assigned_to_name": incident.assigned_to.full_name if incident.assigned_to else None,
                        "created_at": incident.created_at,
                    }
                    for incident in recent_incidents
                ],
                "recent_actions": [
                    {
                        "id": action.id,
                        "action": action.action,
                        "result": action.result,
                        "technician": action.technician.full_name or action.technician.username,
                        "incident_id": action.incident.incident_id,
                        "atm": action.incident.atm.reference,
                        "created_at": action.created_at,
                    }
                    for action in recent_actions
                ],
                "recent_status_changes": [
                    {
                        "id": row.id,
                        "atm_reference": row.atm.reference,
                        "old_status": row.old_status,
                        "new_status": row.new_status,
                        "reason": row.reason,
                        "changed_by_name": row.changed_by.full_name if row.changed_by else None,
                        "created_at": row.created_at,
                    }
                    for row in recent_status_changes
                ],
                "technician_workload": [
                    {
                        "id": tech.id,
                        "name": tech.full_name or tech.username,
                        "assigned_incidents": open_incidents.filter(assigned_to=tech).count(),
                        "critical_incidents": open_incidents.filter(assigned_to=tech, priority=Incident.Priority.CRITICAL).count(),
                    }
                    for tech in technicians
                ],
            }
        )


class DistrictReportView(APIView):
    def get(self, request):
        districts, _, _, incidents = scoped(request.user)
        rows = []
        for district in districts:
            district_atms = ATM.objects.filter(branch__district=district)
            district_incidents = incidents.filter(atm__branch__district=district)
            operational = district_atms.filter(status__in=[ATM.Status.OPERATIONAL, ATM.Status.AVAILABLE]).count()
            rows.append(
                {
                    "district": district.name,
                    "code": district.code,
                    "branches": Branch.objects.filter(district=district).count(),
                    "atms": district_atms.count(),
                    "atm_availability": round(operational / district_atms.count() * 100) if district_atms.count() else 0,
                    "incidents": district_incidents.count(),
                    "open_incidents": district_incidents.exclude(status=Incident.Status.CLOSED).count(),
                    "escalations": district_incidents.filter(status=Incident.Status.ESCALATED).count(),
                    "resolved": district_incidents.filter(
                        status__in=[Incident.Status.RESOLVED, Incident.Status.VERIFIED, Incident.Status.CLOSED]
                    ).count(),
                }
            )
        return Response(rows)


class BranchReportView(APIView):
    def get(self, request):
        _, branches, _, incidents = scoped(request.user)
        rows = []
        for branch in branches.select_related("district"):
            branch_incidents = incidents.filter(atm__branch=branch)
            top_categories = list(branch_incidents.values("category").annotate(total=Count("id")).order_by("-total")[:5])
            rows.append(
                {
                    "branch": branch.name,
                    "district": branch.district.name,
                    "code": branch.code,
                    "atms": ATM.objects.filter(branch=branch).count(),
                    "atm_status": {status: ATM.objects.filter(branch=branch, status=status).count() for status, _ in ATM.Status.choices},
                    "incidents": branch_incidents.count(),
                    "common_categories": [{"category": c["category"] or "Uncategorised", "count": c["total"]} for c in top_categories],
                    "resolved": branch_incidents.filter(
                        status__in=[Incident.Status.RESOLVED, Incident.Status.VERIFIED, Incident.Status.CLOSED]
                    ).count(),
                }
            )
        return Response(rows)


class TechnicianReportView(APIView):
    def get(self, request):
        _, _, _, incidents = scoped(request.user)
        technicians = User.objects.filter(assigned_incidents__isnull=False).distinct()
        if request.user.district_id:
            technicians = technicians.filter(district_id=request.user.district_id)
        rows = []
        resolved_duration = Cast(F("resolved_at") - F("created_at"), output_field=DurationField())
        for tech in technicians:
            assigned = incidents.filter(assigned_to=tech)
            resolved = assigned.filter(resolved_at__isnull=False)
            avg_seconds = resolved.aggregate(avg=Avg(resolved_duration))["avg"]
            rows.append(
                {
                    "technician": tech.full_name or tech.username,
                    "assigned": assigned.count(),
                    "pending": assigned.exclude(status__in=[Incident.Status.VERIFIED, Incident.Status.CLOSED]).count(),
                    "resolved": resolved.count(),
                    "escalations": assigned.filter(status=Incident.Status.ESCALATED).count(),
                    "avg_resolution_hours": round(avg_seconds.total_seconds() / 3600, 1) if avg_seconds else None,
                }
            )
        return Response(rows)


class ATMReportView(APIView):
    def get(self, request, pk):
        atm = scoped(request.user)[2].filter(pk=pk).first()
        if not atm:
            return Response({"detail": "Not found within your organizational scope."}, status=404)
        incidents = Incident.objects.filter(atm=atm).order_by("-created_at")
        return Response(
            {
                "atm": {
                    "reference": atm.reference,
                    "name": atm.name,
                    "status": atm.status,
                    "health": atm.health,
                    "branch": atm.branch.name,
                    "district": atm.branch.district.name,
                    "atm_type": atm.atm_type,
                    "installation_date": atm.installation_date,
                    "created_at": atm.created_at,
                    "manufacturer": atm.manufacturer,
                    "model": atm.model,
                    "serial_number": atm.serial_number,
                    "location": atm.location,
                    "address": atm.address,
                    "ip_address": atm.ip_address,
                },
                "incident_count": incidents.count(),
                "by_status": dict(incidents.values_list("status").annotate(total=Count("id"))),
                "recent_incidents": [
                    {
                        "incident_id": incident.incident_id,
                        "title": incident.title,
                        "status": incident.status,
                        "priority": incident.priority,
                        "created_at": incident.created_at,
                    }
                    for incident in incidents[:10]
                ],
            }
        )


class GlobalSearchView(APIView):
    def get(self, request):
        term = (request.query_params.get("q") or "").strip()
        if not term:
            return Response({"atms": [], "incidents": [], "branches": [], "technicians": []})
        _, branches, atms, incidents = scoped(request.user)
        users = User.objects.all()
        if request.user.district_id:
            users = users.filter(district_id=request.user.district_id)
        return Response(
            {
                "atms": [
                    {
                        "id": atm.id,
                        "reference": atm.reference,
                        "name": atm.name,
                        "branch": atm.branch.name,
                        "status": atm.status,
                    }
                    for atm in atms.filter(
                        Q(reference__icontains=term)
                        | Q(name__icontains=term)
                        | Q(serial_number__icontains=term)
                        | Q(branch__name__icontains=term)
                    )[:8]
                ],
                "incidents": [
                    {
                        "id": incident.id,
                        "incident_number": incident.incident_id,
                        "title": incident.title,
                        "atm_reference": incident.atm.reference,
                        "status": incident.status,
                        "priority": incident.priority,
                        "assigned_to_name": incident.assigned_to.full_name if incident.assigned_to else None,
                    }
                    for incident in incidents.filter(
                        Q(title__icontains=term)
                        | Q(error_message__icontains=term)
                        | Q(description__icontains=term)
                        | Q(atm__reference__icontains=term)
                    )[:8]
                ],
                "branches": [{"id": branch.id, "name": branch.name, "code": branch.code} for branch in branches.filter(Q(name__icontains=term) | Q(code__icontains=term))[:8]],
                "technicians": [
                    {"id": tech.id, "name": tech.full_name or tech.username, "username": tech.username}
                    for tech in users.filter(Q(full_name__icontains=term) | Q(username__icontains=term), role="TECHNICIAN")[:8]
                ],
            }
        )
