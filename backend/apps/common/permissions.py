from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

SUPERVISOR_ROLES = ("ADMINISTRATOR", "SUPERVISOR")
TECHNICIAN_ROLES = SUPERVISOR_ROLES + ("TECHNICIAN",)
ORG_MANAGER_ROLES = ("ADMINISTRATOR",)


def is_supervisor(user):
    return user.is_staff or user.is_authenticated and user.role in SUPERVISOR_ROLES


def is_technician(user):
    return user.is_staff or user.is_authenticated and user.role in TECHNICIAN_ROLES


def can_manage_organization(user):
    return user.is_staff or user.is_authenticated and user.role in ORG_MANAGER_ROLES


def can_manage_users(user):
    return user.is_staff or user.is_authenticated and user.role == "ADMINISTRATOR"


def requires_supervisor(user):
    if not is_supervisor(user):
        raise PermissionDenied("Only supervisors and administrators may perform this action.")
    return True


def requires_technician(user):
    if not is_technician(user):
        raise PermissionDenied("Only technicians, supervisors and administrators may perform this action.")
    return True


class ScopedQuerysetMixin:
    def get_queryset(self): return self.scope_queryset(super().get_queryset())
    def perform_update(self, serializer):
        if not self.get_queryset().filter(pk=self.get_object().pk).exists(): raise PermissionDenied("Outside organizational scope")
        serializer.save()
    def perform_destroy(self, instance): raise PermissionDenied("Production records must be deactivated, not deleted")


class IsSupervisor(BasePermission):
    message = "Only supervisors and administrators may perform this action."
    def has_permission(self, request, view):
        return bool(request.user and is_supervisor(request.user))


class IsTechnician(BasePermission):
    message = "Only technicians, supervisors and administrators may perform this action."
    def has_permission(self, request, view):
        return bool(request.user and is_technician(request.user))


class CanManageOrganization(BasePermission):
    message = "Only administrators may manage organization records."
    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return bool(request.user and can_manage_organization(request.user))


class CanManageBranches(BasePermission):
    message = "You are not authorized to manage branches."
    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return bool(request.user and can_manage_organization(request.user))


class CanManageATMs(BasePermission):
    message = "You are not authorized to manage ATMs."
    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return bool(request.user and can_manage_organization(request.user))


class CanManageUsers(BasePermission):
    message = "Only administrators may manage users."
    def has_permission(self, request, view):
        return bool(request.user and can_manage_users(request.user))


class IsSupervisorOrAbove(BasePermission):
    message = "Only supervisors and administrators may perform this action."
    def has_permission(self, request, view):
        return bool(request.user and is_supervisor(request.user))


class IsTechnicianOrAbove(BasePermission):
    message = "Only technicians, supervisors and administrators may perform this action."
    def has_permission(self, request, view):
        return bool(request.user and is_technician(request.user))


def require(condition, message):
    if not condition:
        raise PermissionDenied(message)


def user_permissions(user):
    """Flat permission strings exposed to the frontend for UI gating only."""
    if not user.is_authenticated:
        return []
    perms = ["incident.view", "report.view", "district.view", "branch.view", "atm.view", "notification.view", "maintenance.view"]
    if user.role == "AUDITOR":
        perms += ["audit.view", "troubleshooting.view"]
        return sorted(set(perms))
    if can_manage_users(user):
        perms += ["user.view", "user.create", "user.update", "user.disable", "role.view", "audit.view", "notification.manage"]
    if can_manage_organization(user):
        perms += [
            "district.create", "district.update", "district.delete",
            "branch.create", "branch.update", "branch.delete",
            "atm.create", "atm.update", "atm.delete", "report.export",
        ]
    if user.role != "AUDITOR":
        perms += ["incident.create", "troubleshooting.view"]
    if is_technician(user):
        perms += ["troubleshooting.create", "incident.escalate", "incident.resolve", "incident.retest", "maintenance.create", "maintenance.update"]
    if is_supervisor(user):
        perms += ["incident.assign", "incident.reassign", "incident.verify", "incident.close"]
    return sorted(set(perms))
