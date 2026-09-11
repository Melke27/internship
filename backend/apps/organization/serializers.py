from rest_framework import serializers

from apps.organization.yeka import YEKA_NAME, get_yeka_district

from .models import Branch, Department, District


class DistrictSerializer(serializers.ModelSerializer):
    branch_count = serializers.IntegerField(source="branches.count", read_only=True)

    class Meta:
        model = District
        fields = "__all__"
        read_only_fields = ["name", "code", "status", "description", "address", "phone", "email"]


class BranchSerializer(serializers.ModelSerializer):
    district_name = serializers.SerializerMethodField()
    atm_count = serializers.SerializerMethodField()
    operational_count = serializers.SerializerMethodField()
    fault_count = serializers.SerializerMethodField()
    critical_count = serializers.SerializerMethodField()
    maintenance_count = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = "__all__"
        read_only_fields = ["district"]

    def get_district_name(self, obj):
        return YEKA_NAME

    def get_atm_count(self, obj):
        return obj.atms.count()

    def get_operational_count(self, obj):
        return obj.atms.filter(status="OPERATIONAL", is_active=True).count()

    def get_fault_count(self, obj):
        return obj.atms.filter(status__in=["FAULT", "WARNING", "DEGRADED"], is_active=True).count()

    def get_critical_count(self, obj):
        return obj.atms.filter(status="CRITICAL", is_active=True).count()

    def get_maintenance_count(self, obj):
        return obj.atms.filter(status__in=["MAINTENANCE", "UNDER_REPAIR"], is_active=True).count()

    def create(self, validated_data):
        validated_data["district"] = get_yeka_district()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data["district"] = get_yeka_district()
        return super().update(instance, validated_data)


class DepartmentSerializer(serializers.ModelSerializer):
    district_name = serializers.SerializerMethodField()
    head_name = serializers.SerializerMethodField()
    head_email = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()
    open_incidents_count = serializers.SerializerMethodField()
    active_maintenance_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = "__all__"
        read_only_fields = ["district"]

    def get_district_name(self, obj):
        return YEKA_NAME

    def get_head_name(self, obj):
        if obj.head:
            return obj.head.full_name or obj.head.username
        return None

    def get_head_email(self, obj):
        if obj.head:
            return obj.head.email
        return None

    def get_user_count(self, obj):
        return obj.users.count()

    def get_open_incidents_count(self, obj):
        from apps.incidents.models import Incident
        return Incident.objects.filter(
            assigned_to__department=obj
        ).exclude(status="CLOSED").count()

    def get_active_maintenance_count(self, obj):
        from apps.assets.models import Maintenance
        return Maintenance.objects.filter(
            technician__department=obj
        ).exclude(status__in=["VERIFIED", "CANCELLED", "COMPLETED"]).count()

    def create(self, validated_data):
        validated_data["district"] = get_yeka_district()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data["district"] = get_yeka_district()
        return super().update(instance, validated_data)

