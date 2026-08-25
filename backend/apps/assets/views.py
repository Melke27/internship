from django.db import transaction
from django.utils import timezone
from rest_framework import status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.models import AuditLog
from apps.common.audit import AuditMixin
from apps.common.permissions import CanManageATMs, ScopedQuerysetMixin, can_manage_organization, is_supervisor, is_technician, require
from .models import ATM, ATMStatusHistory, Maintenance
from .serializers import ATMSerializer, ATMStatusHistorySerializer, MaintenanceSerializer


def record_atm_status_change(atm, new_status, user=None, reason=""):
    old_status = atm.status
    if old_status == new_status:
        return False
    atm.status = new_status
    atm.last_status_change = timezone.now()
    atm.save(update_fields=["status", "last_status_change", "updated_at"])
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
    filterset_fields = ["status", "health", "branch", "branch__district", "assigned_technician"]
    ordering_fields = ["reference", "created_at", "status", "last_checked", "last_status_change"]
    entity_name = "ATM"
    permission_classes = [CanManageATMs]

    def scope_queryset(self, qs):
        u = self.request.user
        if u.is_staff or not u.district_id:
            return qs
        return qs.filter(branch__district_id=u.district_id, **({"branch_id": u.branch_id} if u.branch_id else {}))

    def perform_create(self, serializer):
        require(can_manage_organization(self.request.user), "You are not authorized to register ATMs.")
        super().perform_create(serializer)

    def perform_destroy(self, instance):
        require(can_manage_organization(self.request.user), "Only administrators may delete ATMs.")
        incidents = instance.incidents.count()
        if incidents:
            raise ValidationError(
                {
                    "detail": f"ATM '{instance.reference}' has {incidents} incident(s) in its history. Set its status to DECOMMISSIONED instead of deleting it."
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


class MaintenanceViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = Maintenance.objects.select_related("atm", "atm__branch", "atm__branch__district", "technician").order_by(
        "-created_at"
    )
    serializer_class = MaintenanceSerializer
    filterset_fields = ["status", "maintenance_type", "atm", "technician", "atm__branch__district"]
    search_fields = ["atm__reference", "reason", "remarks", "result"]
    ordering_fields = ["created_at", "start_date", "end_date", "status"]

    def scope_queryset(self, qs):
        u = self.request.user
        if u.is_staff or not u.district_id:
            return qs
        return qs.filter(atm__branch__district_id=u.district_id, **({"atm__branch_id": u.branch_id} if u.branch_id else {}))

    def perform_create(self, serializer):
        require(is_technician(self.request.user), "Only technicians, supervisors, and administrators may create maintenance.")
        maintenance = serializer.save()
        AuditLog.objects.create(
            user=self.request.user,
            action="MAINTENANCE_CREATED",
            entity="Maintenance",
            entity_id=str(maintenance.pk),
            new_value={"status": maintenance.status, "atm": maintenance.atm.reference},
        )

    def perform_update(self, serializer):
        maintenance = self.get_object()
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
    def status(self, request, pk=None):
        maintenance = self.get_object()
        require(is_technician(request.user), "Only technicians, supervisors, and administrators may update maintenance.")
        next_status = request.data.get("status")
        confirmed_operational = bool(request.data.get("confirmed_operational"))
        allowed = {
            Maintenance.Status.SCHEDULED: [Maintenance.Status.STARTED],
            Maintenance.Status.STARTED: [Maintenance.Status.IN_PROGRESS],
            Maintenance.Status.IN_PROGRESS: [Maintenance.Status.COMPLETED],
            Maintenance.Status.COMPLETED: [Maintenance.Status.VERIFIED],
        }
        if next_status not in allowed.get(maintenance.status, []):
            return Response(
                {"detail": f"Invalid transition from {maintenance.status} to {next_status}."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        maintenance.status = next_status
        now = timezone.now()
        if next_status == Maintenance.Status.STARTED:
            maintenance.start_date = maintenance.start_date or now
            record_atm_status_change(maintenance.atm, ATM.Status.MAINTENANCE, request.user, maintenance.reason)
        elif next_status == Maintenance.Status.COMPLETED:
            maintenance.end_date = maintenance.end_date or now
            maintenance.atm.last_maintenance = now
            maintenance.atm.save(update_fields=["last_maintenance", "updated_at"])
        elif next_status == Maintenance.Status.VERIFIED and confirmed_operational:
            record_atm_status_change(
                maintenance.atm,
                ATM.Status.OPERATIONAL,
                request.user,
                "Maintenance verified and ATM confirmed operational.",
            )
        maintenance.save()
        AuditLog.objects.create(
            user=request.user,
            action="MAINTENANCE_STATUS_CHANGED",
            entity="Maintenance",
            entity_id=str(maintenance.pk),
            new_value={"status": maintenance.status},
        )
        return Response(MaintenanceSerializer(maintenance).data)
