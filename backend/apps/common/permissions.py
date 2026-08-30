from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

# Canonical role groups (legacy roles included)
DISTRICT_ADMIN_ROLES = ("DISTRICT_ADMIN", "ADMINISTRATOR")
OPS_ROLES = DISTRICT_ADMIN_ROLES + ("OPERATIONS_OFFICER", "MONITORING_OFFICER", "MAINTENANCE_SUPERVISOR", "SUPERVISOR")
SUPERVISOR_ROLES = DISTRICT_ADMIN_ROLES + ("MAINTENANCE_SUPERVISOR", "SUPERVISOR")
TECHNICIAN_ROLES = SUPERVISOR_ROLES + ("TECHNICIAN",)
ORG_MANAGER_ROLES = DISTRICT_ADMIN_ROLES
BRANCH_ROLES = ("BRANCH_USER", "BRANCH_MANAGER")
MAINTENANCE_PORTAL_ROLES = ("TECHNICIAN", "MAINTENANCE_SUPERVISOR", "SUPERVISOR") + DISTRICT_ADMIN_ROLES
DISTRICT_PORTAL_ROLES = OPS_ROLES + ("AUDITOR",)


def is_district_admin(user):
    return user.is_staff or (user.is_authenticated and user.role in DISTRICT_ADMIN_ROLES)


def is_supervisor(user):
    return user.is_staff or (user.is_authenticated and user.role in SUPERVISOR_ROLES)


def is_operations(user):
    return user.is_staff or (user.is_authenticated and user.role in OPS_ROLES)


def is_technician(user):
    return user.is_staff or (user.is_authenticated and user.role in TECHNICIAN_ROLES)


def is_branch_user(user):
    return user.is_authenticated and user.role in BRANCH_ROLES


def can_manage_organization(user):
    return user.is_staff or (user.is_authenticated and user.role in ORG_MANAGER_ROLES)


def can_manage_users(user):
    return is_district_admin(user)


def requires_supervisor(user):
    if not is_supervisor(user):
        raise PermissionDenied("Only supervisors and administrators may perform this action.")
    return True


def requires_technician(user):
    if not is_technician(user):
        raise PermissionDenied("Only technicians, supervisors and administrators may perform this action.")
    return True


def requires_operations(user):
    if not is_operations(user):
        raise PermissionDenied("Only district operations staff may perform this action.")
    return True


class ScopedQuerysetMixin:
    def get_queryset(self):
        return self.scope_queryset(super().get_queryset())

    def perform_update(self, serializer):
        if not self.get_queryset().filter(pk=self.get_object().pk).exists():
            raise PermissionDenied("Outside organizational scope")
        serializer.save()

    def perform_destroy(self, instance):
        raise PermissionDenied("Production records must be deactivated, not deleted")


class IsSupervisor(BasePermission):
    message = "Only supervisors and administrators may perform this action."

    def has_permission(self, request, view):
        return bool(request.user and is_supervisor(request.user))


class IsTechnician(BasePermission):
    message = "Only technicians, supervisors and administrators may perform this action."

    def has_permission(self, request, view):
        return bool(request.user and is_technician(request.user))


class IsOperations(BasePermission):
    message = "Only district operations staff may perform this action."

    def has_permission(self, request, view):
        return bool(request.user and is_operations(request.user))


class CanManageOrganization(BasePermission):
    message = "Only administrators may manage organization records."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return bool(request.user and can_manage_organization(request.user))


class CanManageBranches(BasePermission):
    message = "You are not authorized to manage branches."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return bool(request.user and can_manage_organization(request.user))


class CanManageATMs(BasePermission):
    message = "You are not authorized to manage ATMs."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        user = request.user
        return bool(
            user
            and (
                can_manage_organization(user)
                or is_operations(user)
            )
        )


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


def portal_for_role(role):
    """Which operational interface the user should land on."""
    if role in BRANCH_ROLES:
        return "branch"
    if role in ("TECHNICIAN", "MAINTENANCE_SUPERVISOR", "SUPERVISOR"):
        return "maintenance"
    return "district"


def user_permissions(user):
    """Flat permission strings exposed to the frontend for UI gating only."""
    if not user.is_authenticated:
        return []
    role = getattr(user, "normalized_role", user.role)
    perms = [
        "incident.view",
        "report.view",
        "district.view",
        "branch.view",
        "atm.view",
        "notification.view",
        "maintenance.view",
        "branch_report.view",
    ]

    if role == "AUDITOR":
        perms += ["audit.view", "troubleshooting.view"]
        return sorted(set(perms))

    if role == "BRANCH_USER":
        perms += [
            "branch_report.create",
            "branch_report.view_own",
            "atm.view_own_branch",
        ]
        return sorted(set(perms))

    if role == "BRANCH_MANAGER":
        perms += [
            "branch_report.create",
            "branch_report.view_own",
            "atm.view_own_branch",
            "branch.view_users",
            "incident.view_branch",
            "maintenance.view_branch",
        ]
        return sorted(set(perms))

    if can_manage_users(user):
        perms += [
            "user.view",
            "user.create",
            "user.update",
            "user.disable",
            "role.view",
            "audit.view",
            "notification.manage",
        ]

    if can_manage_organization(user):
        # Yeka District is fixed — no district create/update/delete permissions
        perms += [
            "branch.create",
            "branch.update",
            "branch.deactivate",
            "atm.create",
            "atm.update",
            "atm.activate",
            "atm.deactivate",
            "report.export",
        ]

    if role != "AUDITOR":
        perms += ["incident.create", "troubleshooting.view", "branch_report.review"]

    if is_operations(user):
        perms += [
            "incident.create",
            "branch_report.convert",
            "branch_report.dismiss",
            "atm.status_confirm",
            "atm.create",
            "atm.update",
        ]

    if is_technician(user):
        perms += [
            "troubleshooting.create",
            "incident.escalate",
            "incident.resolve",
            "incident.retest",
            "maintenance.create",
            "maintenance.update",
            "maintenance.start",
            "maintenance.complete",
        ]

    if is_supervisor(user):
        perms += [
            "incident.assign",
            "incident.reassign",
            "incident.verify",
            "incident.close",
            "maintenance.approve",
            "maintenance.assign",
            "maintenance.verify",
        ]

    return sorted(set(perms))
