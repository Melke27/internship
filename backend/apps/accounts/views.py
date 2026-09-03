from django.db import transaction
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.models import AuditLog
from apps.common.permissions import CanManageUsers, is_supervisor, portal_for_role, user_permissions
from apps.notifications.views import notify
from .models import User
from .serializers import UserSerializer, ProfileSerializer

ROLE_RANK = {
    User.Role.BRANCH_USER: 1,
    User.Role.TECHNICIAN: 2,
    User.Role.BRANCH_MANAGER: 3,
    User.Role.OPERATIONS_OFFICER: 4,
    User.Role.MONITORING_OFFICER: 4,
    User.Role.MAINTENANCE_SUPERVISOR: 5,
    User.Role.SUPERVISOR: 5,
    User.Role.DISTRICT_ADMIN: 6,
    User.Role.ADMINISTRATOR: 6,
    User.Role.AUDITOR: 0,
}

ROLE_LABELS = {
    User.Role.DISTRICT_ADMIN: "District Admin",
    User.Role.ADMINISTRATOR: "District Admin",
    User.Role.OPERATIONS_OFFICER: "Operations Officer",
    User.Role.MONITORING_OFFICER: "Operations Officer",
    User.Role.MAINTENANCE_SUPERVISOR: "Maintenance Supervisor",
    User.Role.SUPERVISOR: "Maintenance Supervisor",
    User.Role.TECHNICIAN: "Technician",
    User.Role.BRANCH_MANAGER: "Branch Manager",
    User.Role.BRANCH_USER: "Branch User",
    User.Role.AUDITOR: "Auditor",
}


def role_label(role):
    return ROLE_LABELS.get(role, role or "").replace("_", " ")


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related("district","branch").order_by("username"); serializer_class = UserSerializer; permission_classes = [CanManageUsers]; search_fields = ["username","email","full_name"]
    filterset_fields = ["role", "district", "branch", "is_active"]

    @action(detail=False, methods=["get"])
    def technicians(self, request):
        if not is_supervisor(request.user):
            return Response({"detail": "Only supervisors may list assignable technicians."}, status=status.HTTP_403_FORBIDDEN)
        users = User.objects.filter(is_active=True).select_related("district", "branch")
        if request.user.district_id:
            users = users.filter(district_id=request.user.district_id)
        data = [
            {"id": u.id, "username": u.username, "full_name": u.full_name, "role": u.role,
             "branch": u.branch_id, "district": u.district_id}
            for u in users.filter(role="TECHNICIAN").order_by("full_name", "username")
        ]
        return Response(data)

    @action(detail=False, methods=["get"])
    def roles(self, request):
        """Canonical assignable roles and their display labels (single source of truth)."""
        main = {
            User.Role.DISTRICT_ADMIN, User.Role.OPERATIONS_OFFICER,
            User.Role.MAINTENANCE_SUPERVISOR, User.Role.TECHNICIAN,
            User.Role.BRANCH_MANAGER, User.Role.BRANCH_USER, User.Role.AUDITOR,
        }
        return Response(
            {"roles": [{"value": r.value, "label": role_label(r.value)} for r in User.Role if r in main]}
        )

    def get_permissions(self):
        if self.action == "technicians":
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    @transaction.atomic
    def perform_create(self, serializer):
        user = serializer.save()
        AuditLog.objects.create(user=self.request.user, action="USER_CREATED", entity="User", entity_id=user.username, new_value={"role": user.role})

    @transaction.atomic
    def perform_update(self, serializer):
        user = self.get_object()
        previous = {"role": user.role, "is_active": user.is_active, "branch_id": user.branch_id}
        serializer.save()
        user.refresh_from_db()
        AuditLog.objects.create(user=self.request.user, action="USER_UPDATED", entity="User", entity_id=user.username, previous_value=previous, new_value={"role": user.role, "is_active": user.is_active, "branch_id": user.branch_id})

        if self.request.user is not user:
            self._notify_role_changes(user, previous)

    def _notify_role_changes(self, user, previous):
        old_role = previous.get("role")
        new_role = user.role
        old_branch = previous.get("branch_id")
        new_branch = user.branch_id

        messages = []

        if old_role != new_role:
            upgraded = ROLE_RANK.get(new_role, 0) > ROLE_RANK.get(old_role, 0)
            verb = "upgraded" if upgraded else "changed"
            messages.append(
                (
                    f"Your role was {verb} to {role_label(new_role)}",
                    f"Your access has been updated from {role_label(old_role)} to {role_label(new_role)}. "
                    f"Sign in to your {portal_for_role(new_role)} dashboard to see your new capabilities.",
                    "USER_ROLE_UPGRADED" if upgraded else "USER_ROLE_CHANGED",
                )
            )

        if new_branch != old_branch:
            branch_name = user.branch.name if user.branch else "No branch"
            messages.append(
                (
                    "Your branch assignment was updated",
                    f"You are now assigned to {branch_name} on the branch dashboard.",
                    "USER_ROLE_CHANGED",
                )
            )

        for title, body, kind in messages:
            notify({user}, title=title, body=body, kind=kind)


class MeView(APIView):
    def _serialize(self, request):
        data = UserSerializer(request.user).data
        data["permissions"] = user_permissions(request.user)
        data["portal"] = portal_for_role(getattr(request.user, "normalized_role", request.user.role))
        data["normalized_role"] = getattr(request.user, "normalized_role", request.user.role)
        return data

    def get(self, request):
        return Response(self._serialize(request))

    @transaction.atomic
    def patch(self, request):
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        AuditLog.objects.create(
            user=request.user,
            action="PROFILE_UPDATED",
            entity="User",
            entity_id=request.user.username,
            new_value=serializer.validated_data,
        )
        return Response(self._serialize(request))


class LogoutView(APIView):
    def post(self, request):
        refresh = request.data.get("refresh")
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except Exception:
                pass
        if request.user and request.user.is_authenticated:
            AuditLog.objects.create(user=request.user, action="LOGOUT", entity="User", entity_id=request.user.username)
        return Response(status=status.HTTP_205_RESET_CONTENT)
