from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework import status
from rest_framework.response import Response

from apps.audit.models import AuditLog
from .models import User
from .authentication import EmailOrUsernameTokenSerializer

class EmailOrUsernameTokenView(TokenObtainPairView):
    serializer_class = EmailOrUsernameTokenSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            username = request.data.get("username") or request.data.get("email")
            user = User.objects.filter(username=username).first() or User.objects.filter(email=username).first()
            if user:
                AuditLog.objects.create(user=user, action="LOGIN", entity="User", entity_id=user.username)
        return response

