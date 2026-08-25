from rest_framework import serializers

from .models import Escalation, Incident, Resolution, TroubleshootingAction, Verification


ACTIVE_INCIDENT_STATUSES = [
    Incident.Status.REPORTED,
    Incident.Status.ACKNOWLEDGED,
    Incident.Status.ASSIGNED,
    Incident.Status.INVESTIGATING,
    Incident.Status.TROUBLESHOOTING,
    Incident.Status.WAITING,
    Incident.Status.ESCALATED,
    Incident.Status.RESOLVED,
    Incident.Status.VERIFIED,
]


class TroubleshootingActionSerializer(serializers.ModelSerializer):
    technician_name = serializers.CharField(source="technician.full_name", read_only=True, default=None)

    class Meta:
        model = TroubleshootingAction
        fields = "__all__"


class EscalationSerializer(serializers.ModelSerializer):
    escalated_by_name = serializers.CharField(source="escalated_by.full_name", read_only=True, default=None)

    class Meta:
        model = Escalation
        fields = "__all__"


class ResolutionSerializer(serializers.ModelSerializer):
    technician_name = serializers.CharField(source="technician.full_name", read_only=True, default=None)

    class Meta:
        model = Resolution
        fields = "__all__"


class VerificationSerializer(serializers.ModelSerializer):
    verified_by_name = serializers.CharField(source="verified_by.full_name", read_only=True, default=None)

    class Meta:
        model = Verification
        fields = "__all__"


class IncidentSerializer(serializers.ModelSerializer):
    incident_id = serializers.ReadOnlyField()
    atm_reference = serializers.CharField(source="atm.reference", read_only=True)
    branch_name = serializers.CharField(source="atm.branch.name", read_only=True)
    district_name = serializers.CharField(source="atm.branch.district.name", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True, default=None)
    reported_by_name = serializers.CharField(source="reported_by.full_name", read_only=True, default=None)
    actions = TroubleshootingActionSerializer(many=True, read_only=True)
    escalations = EscalationSerializer(many=True, read_only=True)
    resolution = ResolutionSerializer(read_only=True)
    verification = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = "__all__"
        read_only_fields = ["reported_by", "status", "resolved_at", "closed_at", "final_result"]

    def get_verification(self, obj):
        if not hasattr(obj, "resolution") or not hasattr(obj.resolution, "verification"):
            return None
        return VerificationSerializer(obj.resolution.verification).data

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        atm = attrs.get("atm") or getattr(instance, "atm", None)
        category = attrs.get("category") or getattr(instance, "category", None)
        if not atm:
            return attrs
        qs = Incident.objects.filter(atm=atm, status__in=ACTIVE_INCIDENT_STATUSES)
        if instance:
            qs = qs.exclude(pk=instance.pk)
        existing = qs.order_by("-created_at").first()
        if existing:
            raise serializers.ValidationError(
                {
                    "detail": f"{atm.reference} already has an active incident.",
                    "existing_incident": {
                        "id": existing.id,
                        "incident_number": existing.incident_id,
                        "title": existing.title,
                        "priority": existing.priority,
                        "status": existing.status,
                        "category": existing.category,
                    },
                }
            )
        if category and len(category) > 60:
            raise serializers.ValidationError({"category": "Category is too long."})
        return attrs

