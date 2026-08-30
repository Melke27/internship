from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import User
from apps.assets.models import ATM
from apps.assets.views import record_atm_status_change
from apps.audit.models import AuditLog
from apps.common.permissions import (
    ScopedQuerysetMixin,
    is_branch_user,
    is_operations,
    is_supervisor,
    require,
)
from apps.notifications.views import notify

from .models import BranchReport, Incident
from .serializers import ACTIVE_INCIDENT_STATUSES, BranchReportSerializer, IncidentSerializer


SEVERITY_TO_ATM_STATUS = {
    BranchReport.Severity.CRITICAL: ATM.Status.CRITICAL,
    BranchReport.Severity.HIGH: ATM.Status.FAULT,
    BranchReport.Severity.MEDIUM: ATM.Status.FAULT,
    BranchReport.Severity.LOW: ATM.Status.WARNING,
}


def district_ops_users(district_id):
    return User.objects.filter(is_active=True).filter(
        Q(district_id=district_id, role__in=[
            "OPERATIONS_OFFICER", "MONITORING_OFFICER",
            "MAINTENANCE_SUPERVISOR", "SUPERVISOR",
            "DISTRICT_ADMIN", "ADMINISTRATOR",
        ])
        | Q(role__in=["DISTRICT_ADMIN", "ADMINISTRATOR"])
    )


class BranchReportViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = BranchReport.objects.select_related(
        "atm", "branch", "reported_by", "reviewed_by", "incident"
    ).order_by("-created_at")
    serializer_class = BranchReportSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    search_fields = ["description", "observed_error", "atm__reference", "branch__name"]
    filterset_fields = ["status", "severity", "problem_type", "atm", "branch"]
    ordering_fields = ["created_at", "severity", "status"]
    http_method_names = ["get", "post", "head", "options", "patch"]

    def scope_queryset(self, qs):
        u = self.request.user
        if not u.is_authenticated:
            return qs.none()
        if u.is_staff or not u.district_id:
            return qs
        qs = qs.filter(branch__district_id=u.district_id)
        if u.branch_id:
            qs = qs.filter(branch_id=u.branch_id)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        require(
            is_branch_user(user) or is_operations(user),
            "You do not have permission to submit branch ATM reports.",
        )
        atm = serializer.validated_data["atm"]
        if user.branch_id and atm.branch_id != user.branch_id:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You can only report ATMs belonging to your branch.")
        branch = user.branch or atm.branch
        report = serializer.save(
            reported_by=user,
            branch=branch,
            status=BranchReport.Status.SUBMITTED,
        )
        AuditLog.objects.create(
            user=user,
            action="REPORT_SUBMITTED",
            entity="BranchReport",
            entity_id=report.report_id,
            new_value={
                "atm": atm.reference,
                "severity": report.severity,
                "problem_type": report.problem_type,
            },
        )
        notify(
            district_ops_users(branch.district_id),
            title=f"New branch report {report.report_id}",
            body=f"{atm.reference}: {report.problem_type} ({report.severity})",
            kind="BRANCH_REPORT",
        )
        notify(
            {user},
            title=f"Report {report.report_id} received",
            body="District operations will review your ATM report.",
            kind="REPORT_RECEIVED",
        )

    def perform_update(self, serializer):
        require(is_operations(self.request.user), "Only operations staff may update branch reports.")
        super().perform_update(serializer)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def receive(self, request, pk=None):
        require(is_operations(request.user), "Only operations may receive branch reports.")
        report = self.get_object()
        if report.status != BranchReport.Status.SUBMITTED:
            return Response(
                {"detail": f"Cannot receive a report in {report.status}."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        report.status = BranchReport.Status.RECEIVED
        report.reviewed_by = request.user
        report.save(update_fields=["status", "reviewed_by", "updated_at"])
        AuditLog.objects.create(
            user=request.user,
            action="REPORT_RECEIVED",
            entity="BranchReport",
            entity_id=report.report_id,
            new_value={"status": report.status},
        )
        return Response(BranchReportSerializer(report, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def review(self, request, pk=None):
        require(is_operations(request.user), "Only operations may review branch reports.")
        report = self.get_object()
        if report.status not in (BranchReport.Status.SUBMITTED, BranchReport.Status.RECEIVED):
            return Response(
                {"detail": f"Cannot review a report in {report.status}."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        report.status = BranchReport.Status.REVIEWING
        report.reviewed_by = request.user
        report.save(update_fields=["status", "reviewed_by", "updated_at"])
        return Response(BranchReportSerializer(report, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def dismiss(self, request, pk=None):
        require(is_operations(request.user), "Only operations may dismiss branch reports.")
        report = self.get_object()
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"reason": ["A dismissal reason is required."]}, status=http_status.HTTP_400_BAD_REQUEST)
        if report.status in (
            BranchReport.Status.CONVERTED_TO_INCIDENT,
            BranchReport.Status.CLOSED,
            BranchReport.Status.DISMISSED,
        ):
            return Response(
                {"detail": f"Cannot dismiss a report in {report.status}."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        report.status = BranchReport.Status.DISMISSED
        report.dismissal_reason = reason
        report.reviewed_by = request.user
        report.save(update_fields=["status", "dismissal_reason", "reviewed_by", "updated_at"])
        AuditLog.objects.create(
            user=request.user,
            action="REPORT_DISMISSED",
            entity="BranchReport",
            entity_id=report.report_id,
            new_value={"reason": reason},
        )
        notify(
            {report.reported_by},
            title=f"Report {report.report_id} dismissed",
            body=reason,
            kind="REPORT_CLOSED",
        )
        return Response(BranchReportSerializer(report, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="create-incident")
    @transaction.atomic
    def create_incident(self, request, pk=None):
        """Convert a valid branch report into an incident. Does not auto-mark ATM critical
        until operations confirms severity."""
        require(is_operations(request.user), "Only operations may convert reports to incidents.")
        report = self.get_object()
        if report.status in (
            BranchReport.Status.CONVERTED_TO_INCIDENT,
            BranchReport.Status.DISMISSED,
            BranchReport.Status.CLOSED,
        ):
            return Response(
                {"detail": f"Cannot convert a report in {report.status}."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        existing = (
            Incident.objects.filter(atm=report.atm, status__in=ACTIVE_INCIDENT_STATUSES)
            .order_by("-created_at")
            .first()
        )
        if existing:
            return Response(
                {
                    "detail": "ACTIVE INCIDENT EXISTS",
                    "existing_incident": {
                        "id": existing.id,
                        "incident_number": existing.incident_id,
                        "title": existing.title,
                        "priority": existing.priority,
                        "status": existing.status,
                        "category": existing.category,
                    },
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        confirmed_severity = request.data.get("confirmed_severity") or report.severity
        if confirmed_severity not in dict(BranchReport.Severity.choices):
            return Response(
                {"confirmed_severity": ["Invalid severity."]},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        # Do NOT auto-set ATM status on branch submit — only when ops confirms
        apply_atm_status = bool(request.data.get("apply_atm_status", True))
        problem_title = request.data.get("title") or f"{report.get_problem_type_display()} — {report.atm.reference}"

        incident = Incident.objects.create(
            atm=report.atm,
            category=report.problem_type,
            priority=confirmed_severity,
            status=Incident.Status.REPORTED,
            title=problem_title,
            description=report.description,
            error_message=report.observed_error[:255] if report.observed_error else "",
            service_impact=report.customer_impact,
            reported_by=report.reported_by,
            branch_report=report,
        )

        report.status = BranchReport.Status.CONVERTED_TO_INCIDENT
        report.confirmed_severity = confirmed_severity
        report.reviewed_by = request.user
        report.save(update_fields=["status", "confirmed_severity", "reviewed_by", "updated_at"])

        if apply_atm_status:
            target_status = SEVERITY_TO_ATM_STATUS.get(confirmed_severity, ATM.Status.FAULT)
            if report.atm_currently_working == BranchReport.WorkingState.NO and confirmed_severity == BranchReport.Severity.CRITICAL:
                target_status = ATM.Status.CRITICAL
            elif report.atm_currently_working == BranchReport.WorkingState.NO and confirmed_severity in (
                BranchReport.Severity.HIGH,
                BranchReport.Severity.CRITICAL,
            ):
                target_status = ATM.Status.OFFLINE if confirmed_severity == BranchReport.Severity.HIGH else ATM.Status.CRITICAL
            record_atm_status_change(
                report.atm,
                target_status,
                request.user,
                f"Confirmed from branch report {report.report_id}",
            )

        AuditLog.objects.create(
            user=request.user,
            action="INCIDENT_CREATED",
            entity="Incident",
            entity_id=incident.incident_id,
            new_value={
                "from_report": report.report_id,
                "priority": incident.priority,
                "atm": report.atm.reference,
            },
        )
        notify(
            {report.reported_by},
            title=f"Incident {incident.incident_id} created",
            body=f"Your report {report.report_id} was converted to an incident.",
            kind="INCIDENT_CREATED",
            incident=incident,
        )
        if incident.priority == Incident.Priority.CRITICAL:
            notify(
                district_ops_users(report.branch.district_id),
                title=f"Critical ATM {report.atm.reference}",
                body=incident.title,
                kind="CRITICAL_ATM",
                incident=incident,
            )

        return Response(
            {
                "report": BranchReportSerializer(report, context={"request": request}).data,
                "incident": IncidentSerializer(incident).data,
            },
            status=http_status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"])
    def pending(self, request):
        qs = self.get_queryset().filter(
            status__in=[
                BranchReport.Status.SUBMITTED,
                BranchReport.Status.RECEIVED,
                BranchReport.Status.REVIEWING,
            ]
        )
        return Response(BranchReportSerializer(qs[:50], many=True, context={"request": request}).data)
