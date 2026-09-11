from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response

from apps.assets.models import ATM, Maintenance
from apps.common.audit import AuditMixin
from apps.common.permissions import (
    CanManageBranches,
    CanManageOrganization,
    ScopedQuerysetMixin,
    can_manage_organization,
    require,
)
from apps.incidents.models import BranchReport, Incident
from apps.organization.yeka import YEKA_NAME, get_yeka_district

from .models import Branch, Department, District
from .serializers import BranchSerializer, DepartmentSerializer, DistrictSerializer


class DistrictViewSet(AuditMixin, ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """Yeka District is fixed. Create / update / delete are not allowed."""

    queryset = District.objects.order_by("name")
    serializer_class = DistrictSerializer
    search_fields = ["name", "code"]
    filterset_fields = ["status"]
    entity_name = "District"
    permission_classes = [CanManageOrganization]
    http_method_names = ["get", "head", "options"]

    def scope_queryset(self, qs):
        yeka = get_yeka_district()
        return qs.filter(id=yeka.id)

    def list(self, request, *args, **kwargs):
        yeka = get_yeka_district()
        return Response([DistrictSerializer(yeka).data])

    def retrieve(self, request, *args, **kwargs):
        return Response(DistrictSerializer(get_yeka_district()).data)

    @action(detail=False, methods=["get"])
    def current(self, request):
        return Response(DistrictSerializer(get_yeka_district()).data)


class BranchViewSet(AuditMixin, ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = Branch.objects.select_related("district").order_by("name")
    serializer_class = BranchSerializer
    search_fields = ["name", "code"]
    filterset_fields = ["status"]
    entity_name = "Branch"
    permission_classes = [CanManageBranches]

    def scope_queryset(self, qs):
        yeka = get_yeka_district()
        u = self.request.user
        qs = qs.filter(district_id=yeka.id)
        if not u.is_authenticated:
            return qs.none()
        if u.is_staff:
            return qs
        if u.branch_id:
            return qs.filter(id=u.branch_id)
        return qs

    def perform_create(self, serializer):
        require(can_manage_organization(self.request.user), "You are not authorized to create branches.")
        serializer.save(district=get_yeka_district())

    def perform_update(self, serializer):
        require(can_manage_organization(self.request.user), "You are not authorized to edit branches.")
        serializer.save(district=get_yeka_district())

    def perform_destroy(self, instance):
        raise MethodNotAllowed(
            "DELETE",
            detail="Branches must be deactivated, not deleted. Historical ATM and incident records must remain.",
        )

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        require(can_manage_organization(request.user), "Only administrators may deactivate branches.")
        branch = self.get_object()
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"reason": ["A reason is required."]}, status=status.HTTP_400_BAD_REQUEST)

        open_incidents = Incident.objects.filter(atm__branch=branch).exclude(status=Incident.Status.CLOSED).count()
        open_maintenance = (
            Maintenance.objects.filter(atm__branch=branch)
            .exclude(status__in=[Maintenance.Status.VERIFIED, Maintenance.Status.CANCELLED, Maintenance.Status.COMPLETED])
            .count()
        )
        open_reports = BranchReport.objects.filter(branch=branch).exclude(
            status__in=[
                BranchReport.Status.CLOSED,
                BranchReport.Status.DISMISSED,
                BranchReport.Status.RESOLVED,
                BranchReport.Status.VERIFIED,
            ]
        ).count()
        atm_count = ATM.objects.filter(branch=branch).count()

        previous = branch.status
        branch.status = "INACTIVE"
        branch.save(update_fields=["status", "updated_at"])
        self._audit(
            "BRANCH_DEACTIVATED",
            branch,
            previous={
                "status": previous,
                "reason": reason,
                "atms": atm_count,
                "open_incidents": open_incidents,
                "open_maintenance": open_maintenance,
                "open_reports": open_reports,
                "district": YEKA_NAME,
            },
        )
        return Response(
            {
                "branch": BranchSerializer(branch).data,
                "warning": {
                    "atms": atm_count,
                    "open_incidents": open_incidents,
                    "open_maintenance": open_maintenance,
                    "open_reports": open_reports,
                },
            }
        )

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        branch = self.get_object()
        atms = ATM.objects.filter(branch=branch)
        return Response(
            {
                "id": branch.id,
                "name": branch.name,
                "code": branch.code,
                "district": YEKA_NAME,
                "status": branch.status,
                "total_atms": atms.count(),
                "operational": atms.filter(status=ATM.Status.OPERATIONAL, is_active=True).count(),
                "faults": atms.filter(
                    status__in=[ATM.Status.FAULT, ATM.Status.WARNING, ATM.Status.DEGRADED],
                    is_active=True,
                ).count(),
                "critical": atms.filter(status=ATM.Status.CRITICAL, is_active=True).count(),
                "maintenance": atms.filter(
                    status__in=[ATM.Status.MAINTENANCE, ATM.Status.UNDER_REPAIR],
                    is_active=True,
                ).count(),
            }
        )


class DepartmentViewSet(AuditMixin, ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = Department.objects.select_related("district", "head").order_by("name")
    serializer_class = DepartmentSerializer
    search_fields = ["name", "code", "department_type", "description"]
    filterset_fields = ["status", "department_type"]
    entity_name = "Department"
    permission_classes = [CanManageOrganization]

    def get_queryset(self):
        from apps.organization.yeka import ensure_default_departments
        ensure_default_departments()
        return super().get_queryset()

    def scope_queryset(self, qs):
        yeka = get_yeka_district()
        u = self.request.user
        qs = qs.filter(district_id=yeka.id)
        if not u.is_authenticated:
            return qs.none()
        return qs

    def perform_create(self, serializer):
        require(can_manage_organization(self.request.user), "You are not authorized to create departments.")
        serializer.save(district=get_yeka_district())

    def perform_update(self, serializer):
        require(can_manage_organization(self.request.user), "You are not authorized to edit departments.")
        serializer.save(district=get_yeka_district())

    def perform_destroy(self, instance):
        raise MethodNotAllowed(
            "DELETE",
            detail="Departments must be deactivated, not deleted, to preserve historical records.",
        )

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        require(can_manage_organization(request.user), "Only administrators may deactivate departments.")
        department = self.get_object()
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"reason": ["A reason is required."]}, status=status.HTTP_400_BAD_REQUEST)

        previous = department.status
        department.status = "INACTIVE"
        department.save(update_fields=["status", "updated_at"])
        self._audit(
            "DEPARTMENT_DEACTIVATED",
            department,
            previous={
                "status": previous,
                "reason": reason,
                "users_count": department.users.count(),
                "district": YEKA_NAME,
            },
        )
        return Response(
            {
                "department": DepartmentSerializer(department).data,
                "warning": {
                    "assigned_users": department.users.count(),
                },
            }
        )

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        department = self.get_object()
        users = department.users.all()
        open_incidents = Incident.objects.filter(assigned_to__department=department).exclude(status="CLOSED")
        active_maint = Maintenance.objects.filter(technician__department=department).exclude(
            status__in=[Maintenance.Status.VERIFIED, Maintenance.Status.CANCELLED, Maintenance.Status.COMPLETED]
        )

        return Response(
            {
                "id": department.id,
                "name": department.name,
                "code": department.code,
                "department_type": department.department_type,
                "district": YEKA_NAME,
                "status": department.status,
                "head": department.head.full_name or department.head.username if department.head else None,
                "total_users": users.count(),
                "open_incidents": open_incidents.count(),
                "active_maintenance": active_maint.count(),
                "staff_members": [
                    {
                        "id": u.id,
                        "name": u.full_name or u.username,
                        "email": u.email,
                        "role": u.role,
                    }
                    for u in users[:10]
                ],
            }
        )

