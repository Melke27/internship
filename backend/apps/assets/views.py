from django.db import transaction
from django.utils import timezone
from rest_framework import status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.models import AuditLog
from apps.common.audit import AuditMixin
from apps.common.permissions import (
    CanManageATMs,
    ScopedQuerysetMixin,
    can_manage_organization,
    is_operations,
    is_supervisor,
    is_technician,
    require,
)
from apps.notifications.views import notify

from .models import ATM, ATMStatusHistory, Maintenance
from .serializers import ATMSerializer, ATMStatusHistorySerializer, MaintenanceSerializer


def record_atm_status_change(atm, new_status, user=None, reason=""):
    old_status = atm.status
    if old_status == new_status:
        return False
    atm.status = new_status
    atm.last_status_change = timezone.now()
    # Keep health roughly aligned with technical status for dashboards
    health_map = {
        ATM.Status.OPERATIONAL: ATM.Health.HEALTHY,
        ATM.Status.WARNING: ATM.Health.WARNING,
        ATM.Status.DEGRADED: ATM.Health.DEGRADED,
        ATM.Status.FAULT: ATM.Health.DEGRADED,
        ATM.Status.OFFLINE: ATM.Health.OFFLINE,
        ATM.Status.CRITICAL: ATM.Health.CRITICAL,
        ATM.Status.MAINTENANCE: ATM.Health.MAINTENANCE,
        ATM.Status.UNDER_REPAIR: ATM.Health.MAINTENANCE,
        ATM.Status.UNKNOWN: ATM.Health.UNKNOWN,
    }
    if new_status in health_map:
        atm.health = health_map[new_status]
    atm.save(update_fields=["status", "health", "last_status_change", "updated_at"])
    ATMStatusHistory.objects.create(
        atm=atm,
        old_status=old_status,
        new_status=new_status,
        changed_by=user if getattr(user, "pk", None) else None,
        reason=reason,
    )
    AuditLog.objects.create(
        user=user if getattr(user, "pk", None) else None,
        action="ATM_STATUS_CHANGED",
        entity="ATM",
        entity_id=str(atm.pk),
        previous_value={"status": old_status},
        new_value={"status": new_status, "reason": reason},
    )
    return True


class ATMViewSet(AuditMixin, ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = ATM.objects.select_related("branch", "branch__district", "assigned_technician").prefetch_related(
        "components"
    ).order_by("reference")
    serializer_class = ATMSerializer
    search_fields = ["reference", "name", "serial_number", "branch__name", "branch__district__name"]
    filterset_fields = ["status", "health", "is_active", "branch", "branch__district", "assigned_technician"]
    ordering_fields = ["reference", "created_at", "status", "last_checked", "last_status_change"]
    entity_name = "ATM"
    permission_classes = [CanManageATMs]

    def scope_queryset(self, qs):
        u = self.request.user
        if not u.is_authenticated:
            return qs.none()
        if u.is_staff or not u.district_id:
            return qs
        return qs.filter(
            branch__district_id=u.district_id,
            **({"branch_id": u.branch_id} if u.branch_id else {}),
        )

    def perform_create(self, serializer):
        require(
            can_manage_organization(self.request.user) or is_operations(self.request.user),
            "You are not authorized to register ATMs.",
        )
        super().perform_create(serializer)

    def perform_destroy(self, instance):
        require(can_manage_organization(self.request.user), "Only administrators may delete ATMs.")
        incidents = instance.incidents.count()
        if incidents:
            raise ValidationError(
                {
                    "detail": (
                        f"ATM '{instance.reference}' has {incidents} incident(s) in its history. "
                        "Deactivate it instead of deleting it."
                    )
                }
            )
        self._audit("ATM_DELETED", instance)
        instance.delete()

    @action(detail=True, methods=["get"])
    def status_history(self, request, pk=None):
        atm = self.get_object()
        rows = atm.status_history.select_related("changed_by").order_by("-created_at")
        return Response(ATMStatusHistorySerializer(rows, many=True).data)

    @action(detail=True, methods=["get"])
    def incidents(self, request, pk=None):
        from apps.incidents.serializers import IncidentSerializer

        atm = self.get_object()
        rows = atm.incidents.select_related("reported_by", "assigned_to").order_by("-created_at")
        return Response(IncidentSerializer(rows, many=True).data)

    @action(detail=True, methods=["get"])
    def maintenance(self, request, pk=None):
        atm = self.get_object()
        rows = atm.maintenance_records.select_related("technician").order_by("-created_at")
        return Response(MaintenanceSerializer(rows, many=True).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def set_status(self, request, pk=None):
        atm = self.get_object()
        require(is_technician(request.user), "Only technicians, supervisors, and administrators may update ATM status.")
        new_status = request.data.get("status")
        reason = request.data.get("reason", "")
        if new_status not in dict(ATM.Status.choices):
            return Response({"status": ["Invalid ATM status."]}, status=http_status.HTTP_400_BAD_REQUEST)
        changed = record_atm_status_change(atm, new_status, request.user, reason)
        if request.data.get("last_checked"):
            atm.last_checked = timezone.now()
            atm.save(update_fields=["last_checked", "updated_at"])
        return Response({"changed": changed, "atm": ATMSerializer(atm).data})

    @action(detail=False, methods=["post"], url_path="bulk-status")
    @transaction.atomic
    def bulk_status(self, request):
        require(is_operations(request.user), "Only operations staff may perform bulk ATM status updates.")
        ids = request.data.get("ids", [])
        new_status = request.data.get("status")
        reason = request.data.get("reason", "Bulk status update")
        if not ids or not isinstance(ids, list):
            return Response({"ids": ["List of ATM IDs is required."]}, status=http_status.HTTP_400_BAD_REQUEST)
        if new_status not in dict(ATM.Status.choices):
            return Response({"status": ["Invalid ATM status."]}, status=http_status.HTTP_400_BAD_REQUEST)

        atms = self.get_queryset().filter(id__in=ids)
        updated_count = 0
        for atm in atms:
            if record_atm_status_change(atm, new_status, request.user, reason):
                updated_count += 1

        return Response({
            "total_requested": len(ids),
            "updated_count": updated_count,
            "status": new_status,
            "reason": reason,
        })

    @action(detail=True, methods=["get"])
    def analytics(self, request, pk=None):
        from apps.incidents.models import Incident
        from django.db.models import Avg, Count, DurationField, F
        from django.db.models.functions import Cast

        atm = self.get_object()
        incidents = Incident.objects.filter(atm=atm)
        total_incidents = incidents.count()
        resolved = incidents.filter(resolved_at__isnull=False, created_at__isnull=False)
        resolved_duration = Cast(F("resolved_at") - F("created_at"), output_field=DurationField())
        avg_sec = resolved.aggregate(avg=Avg(resolved_duration))["avg"]
        mttr_hours = round(avg_sec.total_seconds() / 3600, 1) if avg_sec else 0.0

        categories = dict(incidents.values("category").annotate(total=Count("id")).values_list("category", "total"))
        maintenance_count = atm.maintenance_records.count()
        history_count = atm.status_history.count()

        return Response({
            "atm_id": atm.id,
            "reference": atm.reference,
            "name": atm.name,
            "status": atm.status,
            "total_incidents": total_incidents,
            "resolved_incidents": resolved.count(),
            "mttr_hours": mttr_hours,
            "incident_categories": categories,
            "total_maintenance_jobs": maintenance_count,
            "status_changes_count": history_count,
        })

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def set_active(self, request, pk=None):
        atm = self.get_object()
        require(can_manage_organization(request.user), "Only administrators may activate or deactivate ATMs.")
        is_active = bool(request.data.get("is_active"))
        reason = request.data.get("reason", "")
        previous = atm.is_active
        atm.is_active = is_active
        atm.save(update_fields=["is_active", "updated_at"])
        AuditLog.objects.create(
            user=request.user,
            action="ATM_ACTIVE_CHANGED",
            entity="ATM",
            entity_id=str(atm.pk),
            previous_value={"is_active": previous},
            new_value={"is_active": is_active, "reason": reason},
        )
        return Response(ATMSerializer(atm).data)


MAINTENANCE_TRANSITIONS = {
    Maintenance.Status.REQUESTED: [Maintenance.Status.APPROVED, Maintenance.Status.CANCELLED],
    Maintenance.Status.APPROVED: [Maintenance.Status.SCHEDULED, Maintenance.Status.ASSIGNED, Maintenance.Status.CANCELLED],
    Maintenance.Status.SCHEDULED: [Maintenance.Status.ASSIGNED, Maintenance.Status.IN_PROGRESS, Maintenance.Status.CANCELLED],
    Maintenance.Status.ASSIGNED: [Maintenance.Status.SCHEDULED, Maintenance.Status.IN_PROGRESS, Maintenance.Status.CANCELLED],
    Maintenance.Status.STARTED: [Maintenance.Status.IN_PROGRESS],
    Maintenance.Status.IN_PROGRESS: [
        Maintenance.Status.UNDER_REPAIR,
        Maintenance.Status.TESTING,
        Maintenance.Status.ON_HOLD,
    ],
    Maintenance.Status.ON_HOLD: [Maintenance.Status.IN_PROGRESS, Maintenance.Status.CANCELLED],
    Maintenance.Status.UNDER_REPAIR: [Maintenance.Status.TESTING, Maintenance.Status.IN_PROGRESS],
    Maintenance.Status.TESTING: [
        Maintenance.Status.COMPLETED,
        Maintenance.Status.UNDER_REPAIR,
    ],
    Maintenance.Status.COMPLETED: [Maintenance.Status.VERIFIED],
}


class MaintenanceViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = Maintenance.objects.select_related(
        "atm", "atm__branch", "atm__branch__district", "technician", "requested_by", "incident"
    ).order_by("-created_at")
    serializer_class = MaintenanceSerializer
    filterset_fields = ["id", "status", "maintenance_type", "priority", "atm", "technician", "atm__branch__district"]
    search_fields = ["atm__reference", "reason", "remarks", "result"]
    ordering_fields = ["created_at", "start_date", "end_date", "status", "scheduled_date"]

    def scope_queryset(self, qs):
        u = self.request.user
        if not u.is_authenticated:
            return qs.none()
        if u.is_staff or not u.district_id:
            return qs
        qs = qs.filter(atm__branch__district_id=u.district_id)
        if u.branch_id:
            qs = qs.filter(atm__branch_id=u.branch_id)
        # Technicians see assigned jobs primarily; still allow list of all district if supervisor
        if u.role == "TECHNICIAN" and self.request.query_params.get("mine") == "1":
            qs = qs.filter(technician=u)
        return qs

    def perform_create(self, serializer):
        require(is_technician(self.request.user), "Only technicians, supervisors, and administrators may create maintenance.")
        maintenance = serializer.save(requested_by=self.request.user)
        AuditLog.objects.create(
            user=self.request.user,
            action="MAINTENANCE_CREATED",
            entity="Maintenance",
            entity_id=str(maintenance.pk),
            new_value={"status": maintenance.status, "atm": maintenance.atm.reference},
        )

    def perform_update(self, serializer):
        maintenance = self.get_object()
        require(is_technician(self.request.user), "Only technicians may update maintenance.")
        previous = {"status": maintenance.status}
        record = serializer.save()
        AuditLog.objects.create(
            user=self.request.user,
            action="MAINTENANCE_UPDATED",
            entity="Maintenance",
            entity_id=str(record.pk),
            previous_value=previous,
            new_value={"status": record.status},
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def assign(self, request, pk=None):
        require(is_supervisor(request.user), "Only supervisors may assign maintenance.")
        maintenance = self.get_object()
        technician_id = request.data.get("technician")
        if not technician_id:
            return Response({"technician": ["This field is required."]}, status=http_status.HTTP_400_BAD_REQUEST)
        from apps.accounts.models import User

        tech = User.objects.filter(id=technician_id, role="TECHNICIAN", is_active=True).first()
        if not tech:
            return Response({"technician": ["Invalid technician."]}, status=http_status.HTTP_400_BAD_REQUEST)
        maintenance.technician = tech
        if maintenance.status in (Maintenance.Status.REQUESTED, Maintenance.Status.APPROVED, Maintenance.Status.SCHEDULED):
            maintenance.status = Maintenance.Status.ASSIGNED
        maintenance.save()
        AuditLog.objects.create(
            user=request.user,
            action="MAINTENANCE_ASSIGNED",
            entity="Maintenance",
            entity_id=str(maintenance.pk),
            new_value={"technician": tech.id, "status": maintenance.status},
        )
        notify(
            {tech},
            title=f"Maintenance {maintenance.maintenance_id} assigned",
            body=f"{maintenance.atm.reference}: {maintenance.reason[:120]}",
            kind="MAINTENANCE_ASSIGNED",
        )
        return Response(MaintenanceSerializer(maintenance).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def status(self, request, pk=None):
        maintenance = self.get_object()
        require(is_technician(request.user), "Only technicians, supervisors, and administrators may update maintenance.")
        next_status = request.data.get("status")
        confirmed_operational = bool(request.data.get("confirmed_operational"))
        test_result = request.data.get("test_result")

        if next_status not in MAINTENANCE_TRANSITIONS.get(maintenance.status, []):
            return Response(
                {"detail": f"Invalid transition from {maintenance.status} to {next_status}."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if next_status in (Maintenance.Status.APPROVED, Maintenance.Status.VERIFIED):
            require(is_supervisor(request.user), f"Only supervisors may move maintenance to {next_status}.")

        if next_status == Maintenance.Status.TESTING:
            maintenance.test_result = Maintenance.TestResult.PENDING
        if next_status == Maintenance.Status.COMPLETED:
            if test_result not in (Maintenance.TestResult.PASSED, Maintenance.TestResult.PARTIAL):
                return Response(
                    {"test_result": ["Test must PASSED or PARTIAL before completing maintenance."]},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            maintenance.test_result = test_result
        if next_status == Maintenance.Status.UNDER_REPAIR and maintenance.status == Maintenance.Status.TESTING:
            maintenance.test_result = Maintenance.TestResult.FAILED

        maintenance.status = next_status
        now = timezone.now()

        if next_status == Maintenance.Status.IN_PROGRESS:
            maintenance.start_date = maintenance.start_date or now
            record_atm_status_change(maintenance.atm, ATM.Status.MAINTENANCE, request.user, maintenance.reason)
        elif next_status == Maintenance.Status.UNDER_REPAIR:
            record_atm_status_change(maintenance.atm, ATM.Status.UNDER_REPAIR, request.user, maintenance.reason)
        elif next_status == Maintenance.Status.COMPLETED:
            maintenance.end_date = maintenance.end_date or now
            maintenance.atm.last_maintenance = now
            maintenance.atm.save(update_fields=["last_maintenance", "updated_at"])
            # Do NOT auto-set OPERATIONAL — wait for verification + confirmed test
        elif next_status == Maintenance.Status.VERIFIED:
            if not confirmed_operational:
                return Response(
                    {"confirmed_operational": ["Confirm ATM is operational after successful testing."]},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            if maintenance.test_result != Maintenance.TestResult.PASSED:
                return Response(
                    {"detail": "ATM must have a PASSED test result before restoration."},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            record_atm_status_change(
                maintenance.atm,
                ATM.Status.OPERATIONAL,
                request.user,
                "Maintenance verified and ATM confirmed operational after testing.",
            )
            notify(
                {maintenance.requested_by, maintenance.technician},
                title=f"ATM {maintenance.atm.reference} restored",
                body="Maintenance verified and service restored.",
                kind="ATM_RESTORED",
            )

        if "work_performed" in request.data:
            maintenance.work_performed = request.data.get("work_performed", maintenance.work_performed)
        if "result" in request.data:
            maintenance.result = request.data.get("result", maintenance.result)
        if "remarks" in request.data:
            maintenance.remarks = request.data.get("remarks", maintenance.remarks)

        maintenance.save()
        AuditLog.objects.create(
            user=request.user,
            action="MAINTENANCE_STATUS_CHANGED",
            entity="Maintenance",
            entity_id=str(maintenance.pk),
            new_value={"status": maintenance.status, "test_result": maintenance.test_result},
        )
        if next_status == Maintenance.Status.COMPLETED:
            from apps.accounts.models import User
            from django.db.models import Q
            district_id = maintenance.atm.branch.district_id
            supervisors = User.objects.filter(is_active=True).filter(
                Q(district_id=district_id, role__in=["SUPERVISOR", "MAINTENANCE_SUPERVISOR"])
                | Q(role__in=["ADMINISTRATOR", "DISTRICT_ADMIN"])
            )
            notify(
                set(supervisors),
                title=f"Maintenance {maintenance.maintenance_id} completed",
                body="Verification required.",
                kind="MAINTENANCE_COMPLETED",
            )
        return Response(MaintenanceSerializer(maintenance).data)
