from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from .models import District, Branch
from .serializers import DistrictSerializer, BranchSerializer
from apps.common.permissions import ScopedQuerysetMixin, CanManageOrganization, CanManageBranches, can_manage_organization, require
from apps.common.audit import AuditMixin
class DistrictViewSet(AuditMixin,ScopedQuerysetMixin,viewsets.ModelViewSet):
    queryset=District.objects.order_by("name"); serializer_class=DistrictSerializer; search_fields=["name","code"]; filterset_fields=["status"]; entity_name="District"; permission_classes=[CanManageOrganization]
    def scope_queryset(self, qs): return qs if self.request.user.is_staff or not self.request.user.district_id else qs.filter(id=self.request.user.district_id)
    def perform_create(self, serializer):
        require(can_manage_organization(self.request.user), "Only administrators may create districts.")
        super().perform_create(serializer)
    def perform_destroy(self, instance):
        require(can_manage_organization(self.request.user), "Only administrators may delete districts.")
        branches=instance.branches.count()
        if branches: raise ValidationError({"detail": f"District '{instance.name}' still has {branches} branch(es). Remove or reassign them, or set the district to INACTIVE instead."})
        users=instance.users.count()
        if users: raise ValidationError({"detail": f"District '{instance.name}' still has {users} assigned user(s). Reassign them before deletion."})
        self._audit("DISTRICT_DELETED", instance)
        instance.delete()
class BranchViewSet(AuditMixin,ScopedQuerysetMixin,viewsets.ModelViewSet):
    queryset=Branch.objects.select_related("district").order_by("name"); serializer_class=BranchSerializer; search_fields=["name","code","district__name"]; filterset_fields=["district","status"]; entity_name="Branch"; permission_classes=[CanManageBranches]
    def scope_queryset(self, qs):
        u=self.request.user
        if u.is_staff or not u.district_id: return qs
        return qs.filter(district_id=u.district_id, **({"id":u.branch_id} if u.branch_id else {}))
    def perform_create(self, serializer):
        require(can_manage_organization(self.request.user), "You are not authorized to create branches.")
        super().perform_create(serializer)
    def perform_destroy(self, instance):
        require(can_manage_organization(self.request.user), "Only administrators may delete branches.")
        atms=instance.atms.count()
        if atms: raise ValidationError({"detail": f"Branch '{instance.name}' still has {atms} ATM(s). Decommission or reassign them first."})
        self._audit("BRANCH_DELETED", instance)
        instance.delete()
