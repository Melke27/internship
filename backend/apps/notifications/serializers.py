from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    incident_ref = serializers.CharField(source="incident.incident_id", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "recipient", "incident", "incident_ref", "title", "body", "kind", "is_read", "created_at"]
        read_only_fields = ["recipient", "created_at"]
