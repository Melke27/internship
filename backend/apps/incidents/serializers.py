from django.utils import timezone
from rest_framework import serializers

from .models import BranchReport, Escalation, Incident, Resolution, TroubleshootingAction, Verification


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


def resolve_fault_category(value):
    """Map a user-supplied or legacy category string to the three fault categories
    (Hardware, Cash-out, Lost Communication). Returns None for unknown values."""
    key = str(value).strip().upper()
    mapping = {
        # Hardware fault
        "HARDWARE": Incident.FaultCategory.HARDWARE,
        "HARDWARE FAULT": Incident.FaultCategory.HARDWARE,
        "CARD READER": Incident.FaultCategory.HARDWARE,
        "CARD_READER": Incident.FaultCategory.HARDWARE,
        "CARD JAM": Incident.FaultCategory.HARDWARE,
        "CARD_JAM": Incident.FaultCategory.HARDWARE,
        "CASH DISPENSER": Incident.FaultCategory.HARDWARE,
        "CASH_DISPENSER": Incident.FaultCategory.HARDWARE,
        "CASH DISPENSER FAULT": Incident.FaultCategory.HARDWARE,
        "DISPLAY": Incident.FaultCategory.HARDWARE,
        "RECEIPT PRINTER": Incident.FaultCategory.HARDWARE,
        "RECEIPT_PRINTER": Incident.FaultCategory.HARDWARE,
        "SECURITY": Incident.FaultCategory.HARDWARE,
        # Cash-out fault
        "CASH_OUT": Incident.FaultCategory.CASH_OUT,
        "CASH-OUT": Incident.FaultCategory.CASH_OUT,
        "CASH-OUT FAULT": Incident.FaultCategory.CASH_OUT,
        "REJECT BIN FULL": Incident.FaultCategory.CASH_OUT,
        "REJECT_BIN_FULL": Incident.FaultCategory.CASH_OUT,
        "REJECT BIN": Incident.FaultCategory.CASH_OUT,
        "CASH EMPTY": Incident.FaultCategory.CASH_OUT,
        "CASH CASSETTE EMPTY": Incident.FaultCategory.CASH_OUT,
        "CASH_CASSETTE_EMPTY": Incident.FaultCategory.CASH_OUT,
        # Lost communication fault
        "LOST_COMMUNICATION": Incident.FaultCategory.LOST_COMMUNICATION,
        "LOST COMMUNICATION": Incident.FaultCategory.LOST_COMMUNICATION,
        "LOST COMMUNICATION FAULT": Incident.FaultCategory.LOST_COMMUNICATION,
        "NETWORK": Incident.FaultCategory.LOST_COMMUNICATION,
        "NETWORK COMMUNICATION": Incident.FaultCategory.LOST_COMMUNICATION,
        "NETWORK_COMMUNICATION": Incident.FaultCategory.LOST_COMMUNICATION,
        "NETWORK / COMMUNICATION": Incident.FaultCategory.LOST_COMMUNICATION,
        "CONNECTION": Incident.FaultCategory.LOST_COMMUNICATION,
        "CONNECTION LOSS": Incident.FaultCategory.LOST_COMMUNICATION,
        "COMMUNICATION": Incident.FaultCategory.LOST_COMMUNICATION,
        "POWER": Incident.FaultCategory.LOST_COMMUNICATION,
        # Other
        "OTHER": Incident.FaultCategory.OTHER,
        "GENERAL": Incident.FaultCategory.OTHER,
        "GENERAL ATM ERROR": Incident.FaultCategory.OTHER,
        "SOFTWARE": Incident.FaultCategory.OTHER,
        "SOFTWARE / APPLICATION": Incident.FaultCategory.OTHER,
        "UNKNOWN": Incident.FaultCategory.OTHER,
        "OTHER TECHNICAL ISSUE": Incident.FaultCategory.OTHER,
    }
    return mapping.get(key)


class TroubleshootingActionSerializer(serializers.ModelSerializer):
    technician_name = serializers.SerializerMethodField()

    class Meta:
        model = TroubleshootingAction
        fields = "__all__"

    def get_technician_name(self, obj):
        if hasattr(obj, "technician") and obj.technician:
            return obj.technician.full_name or obj.technician.username
        return None


class EscalationSerializer(serializers.ModelSerializer):
    escalated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Escalation
        fields = "__all__"

    def get_escalated_by_name(self, obj):
        if hasattr(obj, "escalated_by") and obj.escalated_by:
            return obj.escalated_by.full_name or obj.escalated_by.username
        return None


class ResolutionSerializer(serializers.ModelSerializer):
    technician_name = serializers.SerializerMethodField()

    class Meta:
        model = Resolution
        fields = "__all__"

    def get_technician_name(self, obj):
        if hasattr(obj, "technician") and obj.technician:
            return obj.technician.full_name or obj.technician.username
        return None


class VerificationSerializer(serializers.ModelSerializer):
    verified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Verification
        fields = "__all__"

    def get_verified_by_name(self, obj):
        if hasattr(obj, "verified_by") and obj.verified_by:
            return obj.verified_by.full_name or obj.verified_by.username
        return None


class BranchReportSerializer(serializers.ModelSerializer):
    report_id = serializers.ReadOnlyField()
    atm_reference = serializers.CharField(source="atm.reference", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    reported_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    linked_incident_id = serializers.SerializerMethodField()
    linked_incident_number = serializers.SerializerMethodField()
    active_incident = serializers.SerializerMethodField()

    def get_reported_by_name(self, obj):
        if hasattr(obj, "reported_by") and obj.reported_by:
            return obj.reported_by.full_name or obj.reported_by.username
        return None

    def get_reviewed_by_name(self, obj):
        if hasattr(obj, "reviewed_by") and obj.reviewed_by:
            return obj.reviewed_by.full_name or obj.reviewed_by.username
        return None

    class Meta:
        model = BranchReport
        fields = "__all__"
        read_only_fields = [
            "reported_by",
            "branch",
            "status",
            "confirmed_severity",
            "dismissal_reason",
            "reviewed_by",
        ]

    def get_linked_incident_id(self, obj):
        if hasattr(obj, "incident") and obj.incident:
            return obj.incident.id
        return None

    def get_linked_incident_number(self, obj):
        if hasattr(obj, "incident") and obj.incident:
            return obj.incident.incident_id
        return None

    def get_active_incident(self, obj):
        existing = (
            Incident.objects.filter(atm=obj.atm, status__in=ACTIVE_INCIDENT_STATUSES)
            .order_by("-created_at")
            .first()
        )
        if not existing:
            return None
        return {
            "id": existing.id,
            "incident_number": existing.incident_id,
            "title": existing.title,
            "priority": existing.priority,
            "status": existing.status,
            "category": existing.category,
            "category_detail": existing.category_detail,
        }

    def validate(self, attrs):
        request = self.context.get("request")
        atm = attrs.get("atm")
        if request and request.user.branch_id and atm and atm.branch_id != request.user.branch_id:
            raise serializers.ValidationError({"atm": "You can only report ATMs belonging to your branch."})
        return attrs


class IncidentSerializer(serializers.ModelSerializer):
    incident_id = serializers.ReadOnlyField()
    category = serializers.CharField(required=False)
    atm_reference = serializers.CharField(source="atm.reference", read_only=True)
    branch_name = serializers.CharField(source="atm.branch.name", read_only=True)
    district_name = serializers.CharField(source="atm.branch.district.name", read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    reported_by_name = serializers.SerializerMethodField()
    branch_report_id = serializers.SerializerMethodField()
    branch_report_number = serializers.SerializerMethodField()
    actions = TroubleshootingActionSerializer(many=True, read_only=True)
    escalations = EscalationSerializer(many=True, read_only=True)
    resolution = ResolutionSerializer(read_only=True)
    verification = serializers.SerializerMethodField()
    duration_minutes = serializers.SerializerMethodField()

    def get_assigned_to_name(self, obj):
        if hasattr(obj, "assigned_to") and obj.assigned_to:
            return obj.assigned_to.full_name or obj.assigned_to.username
        return None

    def get_reported_by_name(self, obj):
        if hasattr(obj, "reported_by") and obj.reported_by:
            return obj.reported_by.full_name or obj.reported_by.username
        return None

    def get_duration_minutes(self, obj):
        start = obj.created_at
        if start is None:
            return None
        end = obj.closed_at or obj.resolved_at or timezone.now()
        if end < start:
            end = start
        return int((end - start).total_seconds() // 60)

    class Meta:
        model = Incident
        fields = "__all__"
        read_only_fields = ["reported_by", "status", "resolved_at", "closed_at", "final_result"]

    def get_branch_report_id(self, obj):
        return obj.branch_report_id

    def get_branch_report_number(self, obj):
        if obj.branch_report_id and obj.branch_report:
            return obj.branch_report.report_id
        return None

    def get_verification(self, obj):
        if not hasattr(obj, "resolution") or not hasattr(obj.resolution, "verification"):
            return None
        return VerificationSerializer(obj.resolution.verification).data

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        atm = attrs.get("atm") or getattr(instance, "atm", None)
        if attrs.get("category"):
            resolved = resolve_fault_category(attrs["category"])
            if resolved:
                attrs["category"] = resolved
            else:
                raise serializers.ValidationError(
                    {
                        "category": (
                            "Category must be one of the fault categories: "
                            "HARDWARE (hardware fault), CASH_OUT (cash-out fault), "
                            "LOST_COMMUNICATION (lost communication fault)."
                        )
                    }
                )
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
        return attrs
