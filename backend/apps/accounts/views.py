from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.models import AuditLog
from apps.common.permissions import CanManageUsers, is_supervisor, portal_for_role, user_permissions
from .models import User
from .serializers import UserSerializer


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

    def get_permissions(self):
        if self.action == "technicians":
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def perform_create(self, serializer):
        user = serializer.save()
        AuditLog.objects.create(user=self.request.user, action="USER_CREATED", entity="User", entity_id=user.username, new_value={"role": user.role})

    def perform_update(self, serializer):
        user = self.get_object()
        previous = {"role": user.role, "is_active": user.is_active}
        serializer.save()
        AuditLog.objects.create(user=self.request.user, action="USER_UPDATED", entity="User", entity_id=user.username, previous_value=previous, new_value={"role": user.role, "is_active": user.is_active})


class MeView(APIView):
    def get(self, request):
        data = UserSerializer(request.user).data
        data["permissions"] = user_permissions(request.user)
        data["portal"] = portal_for_role(getattr(request.user, "normalized_role", request.user.role))
        data["normalized_role"] = getattr(request.user, "normalized_role", request.user.role)
        return Response(data)


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
