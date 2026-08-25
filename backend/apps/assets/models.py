from django.conf import settings
from django.db import models

from apps.organization.models import TimeStamped


class ATM(TimeStamped):
    class Status(models.TextChoices):
        OPERATIONAL = "OPERATIONAL", "Operational"
        AVAILABLE = "AVAILABLE", "Available"
        OFFLINE = "OFFLINE", "Offline"
        UNAVAILABLE = "UNAVAILABLE", "Unavailable"
        FAULT = "FAULT", "Fault"
        COMMUNICATION_PROBLEM = "COMMUNICATION_PROBLEM", "Communication Problem"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        ERROR = "ERROR", "Error"
        DECOMMISSIONED = "DECOMMISSIONED", "Decommissioned"

    class Health(models.TextChoices):
        HEALTHY = "HEALTHY", "Healthy"
        WARNING = "WARNING", "Warning"
        DEGRADED = "DEGRADED", "Degraded"
        CRITICAL = "CRITICAL", "Critical"
        OFFLINE = "OFFLINE", "Offline"
        MAINTENANCE = "MAINTENANCE", "Maintenance"

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
    status = models.CharField(max_length=40, choices=Status.choices, default=Status.AVAILABLE)
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

    def __str__(self):
        return self.reference


class ATMComponent(TimeStamped):
    class ComponentType(models.TextChoices):
        DISPLAY = "DISPLAY", "Display"
        CARD_READER = "CARD_READER", "Card Reader"
        CASH_DISPENSER = "CASH_DISPENSER", "Cash Dispenser"
        RECEIPT_PRINTER = "RECEIPT_PRINTER", "Receipt Printer"
        NETWORK = "NETWORK", "Network"
        POWER = "POWER", "Power"

    class Condition(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        WARNING = "WARNING", "Warning"
        DEGRADED = "DEGRADED", "Degraded"
        FAULT = "FAULT", "Fault"
        OFFLINE = "OFFLINE", "Offline"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        UNKNOWN = "UNKNOWN", "Unknown"

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
    old_status = models.CharField(max_length=40, choices=ATM.Status.choices)
    new_status = models.CharField(max_length=40, choices=ATM.Status.choices)
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

    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        STARTED = "STARTED", "Started"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        VERIFIED = "VERIFIED", "Verified"

    atm = models.ForeignKey(ATM, on_delete=models.CASCADE, related_name="maintenance_records")
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="maintenance_records",
    )
    maintenance_type = models.CharField(max_length=20, choices=MaintenanceType.choices)
    reason = models.TextField()
    work_performed = models.TextField(blank=True)
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    result = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    remarks = models.TextField(blank=True)

