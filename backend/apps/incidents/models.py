from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models

from apps.organization.models import TimeStamped


class Incident(TimeStamped):
    class Status(models.TextChoices):
        REPORTED = "REPORTED", "Reported"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
        ASSIGNED = "ASSIGNED", "Assigned"
        INVESTIGATING = "INVESTIGATING", "Investigating"
        TROUBLESHOOTING = "TROUBLESHOOTING", "Troubleshooting"
        WAITING = "WAITING", "Waiting"
        ESCALATED = "ESCALATED", "Escalated"
        RESOLVED = "RESOLVED", "Resolved"
        VERIFIED = "VERIFIED", "Verified"
        CLOSED = "CLOSED", "Closed"

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    atm = models.ForeignKey("assets.ATM", on_delete=models.PROTECT, related_name="incidents")
    category = models.CharField(max_length=60)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.REPORTED)
    title = models.CharField(max_length=200)
    description = models.TextField()
    error_message = models.CharField(max_length=255, blank=True)
    service_impact = models.TextField(blank=True)
    final_result = models.TextField(blank=True)
    escalation_status = models.CharField(max_length=30, blank=True)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reported_incidents"
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="assigned_incidents",
    )
    branch_report = models.OneToOneField(
        "BranchReport",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="incident",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    @property
    def incident_id(self):
        if self.pk and self.created_at:
            return f"INC-{self.created_at:%Y}-{self.pk:04d}"
        return "INC-PENDING"

    def __str__(self):
        return f"{self.incident_id} — {self.title}"


class BranchReport(TimeStamped):
    """Branch-submitted ATM fault / crash report."""

    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        RECEIVED = "RECEIVED", "Received"
        REVIEWING = "REVIEWING", "Reviewing"
        CONVERTED_TO_INCIDENT = "CONVERTED_TO_INCIDENT", "Converted to Incident"
        ASSIGNED = "ASSIGNED", "Assigned"
        RESOLVED = "RESOLVED", "Resolved"
        VERIFIED = "VERIFIED", "Verified"
        CLOSED = "CLOSED", "Closed"
        REVIEWED = "REVIEWED", "Reviewed"
        DISMISSED = "DISMISSED", "Dismissed"

    class ProblemType(models.TextChoices):
        NETWORK_COMMUNICATION = "NETWORK_COMMUNICATION", "Network / Communication"
        POWER = "POWER", "Power"
        DISPLAY = "DISPLAY", "Display"
        CARD_READER = "CARD_READER", "Card Reader"
        CASH_DISPENSER = "CASH_DISPENSER", "Cash Dispenser"
        RECEIPT_PRINTER = "RECEIPT_PRINTER", "Receipt Printer"
        SOFTWARE = "SOFTWARE", "Software / Application"
        HARDWARE = "HARDWARE", "Hardware"
        SECURITY = "SECURITY", "Security-Related Technical Issue"
        GENERAL = "GENERAL", "General ATM Error"
        UNKNOWN = "UNKNOWN", "Unknown"

    class Severity(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    class WorkingState(models.TextChoices):
        YES = "YES", "Yes"
        NO = "NO", "No"
        UNKNOWN = "UNKNOWN", "Unknown"

    atm = models.ForeignKey("assets.ATM", on_delete=models.PROTECT, related_name="branch_reports")
    branch = models.ForeignKey("organization.Branch", on_delete=models.PROTECT, related_name="atm_reports")
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="branch_reports"
    )
    problem_type = models.CharField(max_length=40, choices=ProblemType.choices, default=ProblemType.UNKNOWN)
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.MEDIUM)
    confirmed_severity = models.CharField(
        max_length=20,
        choices=Severity.choices,
        blank=True,
        help_text="Severity confirmed by district operations (branch cannot force critical).",
    )
    atm_currently_working = models.CharField(
        max_length=10, choices=WorkingState.choices, default=WorkingState.UNKNOWN
    )
    description = models.TextField()
    observed_error = models.TextField(blank=True)
    problem_started_at = models.DateTimeField(null=True, blank=True)
    customer_impact = models.CharField(max_length=255, blank=True)
    evidence = models.FileField(
        upload_to="branch_reports/%Y/%m/",
        null=True,
        blank=True,
        validators=[
            FileExtensionValidator(
                allowed_extensions=['jpg', 'jpeg', 'png', 'gif', 'pdf', 'mp4', 'mov']
            )
        ],
    )
    status = models.CharField(max_length=40, choices=Status.choices, default=Status.SUBMITTED)
    dismissal_reason = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_branch_reports",
    )

    @property
    def report_id(self):
        return f"RPT-{self.pk:04d}" if self.pk else "RPT-PENDING"

    def __str__(self):
        return self.report_id


class TroubleshootingAction(TimeStamped):
    class ActionType(models.TextChoices):
        CHECK_STATUS = "CHECK_STATUS", "Check Status"
        CHECK_ATM_STATUS = "CHECK_ATM_STATUS", "Check ATM Status"
        PHYSICAL_INSPECTION = "PHYSICAL_INSPECTION", "Physical Inspection"
        CHECK_POWER = "CHECK_POWER", "Check Power"
        CHECK_CONNECTION = "CHECK_CONNECTION", "Check Connection"
        CHECK_NETWORK = "CHECK_NETWORK", "Check Network"
        CHECK_COMMUNICATION = "CHECK_COMMUNICATION", "Check Communication"
        CHECK_HARDWARE = "CHECK_HARDWARE", "Check Hardware"
        CHECK_DISPLAY = "CHECK_DISPLAY", "Check Display"
        CHECK_CARD_READER = "CHECK_CARD_READER", "Check Card Reader"
        CHECK_CASH_DISPENSER = "CHECK_CASH_DISPENSER", "Check Cash Dispenser"
        CHECK_RECEIPT_PRINTER = "CHECK_RECEIPT_PRINTER", "Check Receipt Printer"
        CHECK_SOFTWARE_ERROR = "CHECK_SOFTWARE_ERROR", "Check Software Error"
        RECORD_OBSERVATION = "RECORD_OBSERVATION", "Record Observation"
        RECORD_ERROR = "RECORD_ERROR", "Record Error"
        AUTHORIZED_TROUBLESHOOTING = "AUTHORIZED_TROUBLESHOOTING", "Authorized Troubleshooting"
        PERFORM_AUTHORIZED_ACTION = "PERFORM_AUTHORIZED_ACTION", "Perform Authorized Action"
        RETEST_ATM = "RETEST_ATM", "Retest ATM"
        VERIFY_SERVICE = "VERIFY_SERVICE", "Verify Service"
        ESCALATE = "ESCALATE", "Escalate"
        ESCALATE_INCIDENT = "ESCALATE_INCIDENT", "Escalate Incident"

    class Result(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        PROBLEM_FOUND = "PROBLEM_FOUND", "Problem Found"
        UNABLE_TO_TEST = "UNABLE_TO_TEST", "Unable to Test"
        PASSED = "PASSED", "Passed"
        FAILED = "FAILED", "Failed"

    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="actions")
    technician = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action_type = models.CharField(
        max_length=40, choices=ActionType.choices, default=ActionType.CHECK_ATM_STATUS
    )
    action = models.TextField()
    observation = models.TextField(blank=True)
    result = models.TextField(blank=True)
    next_action = models.TextField(blank=True)
    remarks = models.TextField(blank=True)
    status = models.CharField(max_length=30, default="COMPLETED")


class Escalation(TimeStamped):
    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="escalations")
    reason = models.TextField()
    technical_findings = models.TextField(blank=True)
    troubleshooting_summary = models.TextField(blank=True)
    priority = models.CharField(
        max_length=20, choices=Incident.Priority.choices, default=Incident.Priority.MEDIUM
    )
    required_team = models.CharField(max_length=150)
    escalated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    assigned_team = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=30, default="OPEN")
    resolved_at = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True)


class Resolution(TimeStamped):
    incident = models.OneToOneField(Incident, on_delete=models.CASCADE, related_name="resolution")
    description = models.TextField()
    action_performed = models.TextField()
    final_status = models.CharField(max_length=100)
    technician = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    resolved_at = models.DateTimeField()


class Verification(TimeStamped):
    resolution = models.OneToOneField(Resolution, on_delete=models.CASCADE, related_name="verification")
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    atm_available = models.BooleanField(default=False)
    issue_cleared = models.BooleanField(default=False)
    communication_working = models.BooleanField(default=False)
    approved_test_completed = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
