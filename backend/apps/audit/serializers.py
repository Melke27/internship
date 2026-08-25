from rest_framework import serializers
from .models import AuditLog

class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = ["id", "user", "user_name", "action", "entity", "entity_id", "previous_value", "new_value", "created_at"]

    def get_user_name(self, obj):
        if not obj.user:
            return None
        return obj.user.full_name or obj.user.username

