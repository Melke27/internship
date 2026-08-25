from rest_framework import serializers

from .models import ATM, ATMComponent, ATMStatusHistory, Maintenance


class ATMComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ATMComponent
        fields = "__all__"


class ATMStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.full_name", read_only=True, default=None)

    class Meta:
        model = ATMStatusHistory
        fields = "__all__"


class MaintenanceSerializer(serializers.ModelSerializer):
    atm_reference = serializers.CharField(source="atm.reference", read_only=True)
    branch_name = serializers.CharField(source="atm.branch.name", read_only=True)
    district_name = serializers.CharField(source="atm.branch.district.name", read_only=True)
    technician_name = serializers.CharField(source="technician.full_name", read_only=True, default=None)

    class Meta:
        model = Maintenance
        fields = "__all__"


class ATMSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    district_name = serializers.CharField(source="branch.district.name", read_only=True)
    assigned_technician_name = serializers.CharField(
        source="assigned_technician.full_name", read_only=True, default=None
    )
    active_incident = serializers.SerializerMethodField()
    components = ATMComponentSerializer(many=True, read_only=True)

    class Meta:
        model = ATM
        fields = "__all__"

    def get_active_incident(self, obj):
        active = obj.incidents.exclude(status="CLOSED").order_by("-created_at").first()
        if not active:
            return None
        return {
            "id": active.id,
            "incident_number": active.incident_id,
            "status": active.status,
            "priority": active.priority,
            "category": active.category,
            "title": active.title,
        }

