from rest_framework import viewsets
from .models import AuditLog
from .serializers import AuditLogSerializer
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset=AuditLog.objects.select_related("user").order_by("-created_at"); serializer_class=AuditLogSerializer; filterset_fields=["action","entity","user"]; search_fields=["action","entity","entity_id"]

