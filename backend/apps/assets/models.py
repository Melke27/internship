from django.conf import settings
from django.db import models

from apps.organization.models import TimeStamped


class ATM(TimeStamped):
    """ATM unit for one district branch.

    Operational state (is_active) is separate from technical_status.
    ACTIVE + OFFLINE means the ATM is still in the fleet but currently offline.
    """

    class TechnicalStatus(models.TextChoices):
        OPERATIONAL = "OPERATIONAL", "Operational"
        WARNING = "WARNING", "Warning"
        DEGRADED = "DEGRADED", "Degraded"
        FAULT = "FAULT", "Fault"
        OFFLINE = "OFFLINE", "Offline"
        CRITICAL = "CRITICAL", "Critical"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        UNDER_REPAIR = "UNDER_REPAIR", "Under Repair"
        UNKNOWN = "UNKNOWN", "Unknown"

    # Legacy alias so existing code referencing ATM.Status still works during transition
    Status = TechnicalStatus

    class Health(models.TextChoices):
        HEALTHY = "HEALTHY", "Healthy"
        WARNING = "WARNING", "Warning"
        DEGRADED = "DEGRADED", "Degraded"
        CRITICAL = "CRITICAL", "Critical"
        OFFLINE = "OFFLINE", "Offline"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        UNKNOWN = "UNKNOWN", "Unknown"

    class ServiceStatus(models.TextChoices):
        ONLINE = "ONLINE", "Online"
        OFFLINE = "OFFLINE", "Offline"
        NORMAL = "NORMAL", "Normal"
        WARNING = "WARNING", "Warning"
        FAULT = "FAULT", "Fault"
        AVAILABLE = "AVAILABLE", "Available"
        UNAVAILABLE = "UNAVAILABLE", "Unavailable"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        ERROR = "ERROR", "Error"
        UNKNOWN = "UNKNOWN", "Unknown"
        HEALTHY = "HEALTHY", "Healthy"

    reference = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=120, blank=True)
    branch = models.ForeignKey("organization.Branch", on_delete=models.PROTECT, related_name="atms")
    atm_type = models.CharField(max_length=80, blank=True)
    manufacturer = models.CharField(max_length=120, blank=True)
    model = models.CharField(max_length=120, blank=True)
    serial_number = models.CharField(max_length=120, blank=True)
    location = models.CharField(max_length=255, blank=True)
    address = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    is_active = models.BooleanField(default=True, help_text="Whether the ATM is part of active district operations.")
    status = models.CharField(
        max_length=40,
        choices=TechnicalStatus.choices,
        default=TechnicalStatus.OPERATIONAL,
        help_text="Technical / operational condition of the ATM.",
    )
    health = models.CharField(max_length=20, choices=Health.choices, default=Health.HEALTHY)
    network_status = models.CharField(max_length=20, choices=ServiceStatus.choices, default=ServiceStatus.UNKNOWN)
    power_status = models.CharField(max_length=20, choices=ServiceStatus.choices, default=ServiceStatus.UNKNOWN)
    hardware_status = models.CharField(max_length=20, choices=ServiceStatus.choices, default=ServiceStatus.UNKNOWN)
    communication_status = models.CharField(max_length=20, choices=ServiceStatus.choices, default=ServiceStatus.UNKNOWN)
    installation_date = models.DateField(null=True, blank=True)
    last_checked = models.DateTimeField(null=True, blank=True)
    last_status_change = models.DateTimeField(null=True, blank=True)
    last_maintenance = models.DateTimeField(null=True, blank=True)
    next_maintenance = models.DateTimeField(null=True, blank=True)
    assigned_technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="assigned_atms",
    )
    assigned_team = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)
    photo = models.ImageField(
        upload_to="atms/%Y/%m/",
        null=True,
        blank=True,
        help_text="Photo of the ATM unit (front view or signage).",
    )

    def __str__(self):
        return self.reference

    @property
    def operational_state(self):
        return "ACTIVE" if self.is_active else "INACTIVE"


class ATMComponent(TimeStamped):
    class ComponentType(models.TextChoices):
        DISPLAY = "DISPLAY", "Display"
        CARD_READER = "CARD_READER", "Card Reader"
        CASH_DISPENSER = "CASH_DISPENSER", "Cash Dispenser"
        RECEIPT_PRINTER = "RECEIPT_PRINTER", "Receipt Printer"
        NETWORK = "NETWORK", "Network"
        POWER = "POWER", "Power"

    class Condition(models.TextChoices):
        HEALTHY = "HEALTHY", "Healthy"
        NORMAL = "NORMAL", "Normal"
        WARNING = "WARNING", "Warning"
        FAULT = "FAULT", "Fault"
        UNKNOWN = "UNKNOWN", "Unknown"
        DEGRADED = "DEGRADED", "Degraded"
        OFFLINE = "OFFLINE", "Offline"
        MAINTENANCE = "MAINTENANCE", "Maintenance"

    atm = models.ForeignKey(ATM, on_delete=models.CASCADE, related_name="components")
    component_type = models.CharField(max_length=40, choices=ComponentType.choices)
    status = models.CharField(max_length=20, choices=ATM.ServiceStatus.choices, default=ATM.ServiceStatus.UNKNOWN)
    condition = models.CharField(max_length=20, choices=Condition.choices, default=Condition.UNKNOWN)
    notes = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["atm", "component_type"], name="unique_component_per_atm")
        ]


class ATMStatusHistory(TimeStamped):
    atm = models.ForeignKey(ATM, on_delete=models.CASCADE, related_name="status_history")
    old_status = models.CharField(max_length=40)
    new_status = models.CharField(max_length=40)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="atm_status_changes",
    )
    reason = models.TextField(blank=True)


class Maintenance(TimeStamped):
    class MaintenanceType(models.TextChoices):
        PREVENTIVE = "PREVENTIVE", "Preventive"
        CORRECTIVE = "CORRECTIVE", "Corrective"
        EMERGENCY = "EMERGENCY", "Emergency"
        INSPECTION = "INSPECTION", "Inspection"
        NETWORK = "NETWORK", "Network"
        HARDWARE = "HARDWARE", "Hardware"
        SOFTWARE = "SOFTWARE", "Software"

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        APPROVED = "APPROVED", "Approved"
        SCHEDULED = "SCHEDULED", "Scheduled"
        ASSIGNED = "ASSIGNED", "Assigned"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        ON_HOLD = "ON_HOLD", "On Hold"
        UNDER_REPAIR = "UNDER_REPAIR", "Under Repair"
        TESTING = "TESTING", "Testing"
        COMPLETED = "COMPLETED", "Completed"
        VERIFIED = "VERIFIED", "Verified"
        CANCELLED = "CANCELLED", "Cancelled"
        # Legacy
        STARTED = "STARTED", "Started"

    class TestResult(models.TextChoices):
        PASSED = "PASSED", "Passed"
        FAILED = "FAILED", "Failed"
        PARTIAL = "PARTIAL", "Partial"
        PENDING = "PENDING", "Pending"

    atm = models.ForeignKey(ATM, on_delete=models.CASCADE, related_name="maintenance_records")
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="maintenance_records",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="requested_maintenance",
    )
    incident = models.ForeignKey(
        "incidents.Incident",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="maintenance_jobs",
    )
    maintenance_type = models.CharField(max_length=20, choices=MaintenanceType.choices)
    priority = models.CharField(
        max_length=20,
        choices=[("LOW", "Low"), ("MEDIUM", "Medium"), ("HIGH", "High"), ("CRITICAL", "Critical")],
        default="MEDIUM",
    )
    reason = models.TextField()
    work_performed = models.TextField(blank=True)
    scheduled_date = models.DateTimeField(null=True, blank=True)
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    result = models.TextField(blank=True)
    test_result = models.CharField(max_length=20, choices=TestResult.choices, default=TestResult.PENDING, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)
    remarks = models.TextField(blank=True)

    @property
    def maintenance_id(self):
        return f"MJ-{self.pk:04d}" if self.pk else "MJ-PENDING"

    def __str__(self):
        return self.maintenance_id
