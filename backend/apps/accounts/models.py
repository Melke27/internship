from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        DISTRICT_ADMIN = "DISTRICT_ADMIN", "District Admin"
        OPERATIONS_OFFICER = "OPERATIONS_OFFICER", "Operations Officer"
        MAINTENANCE_SUPERVISOR = "MAINTENANCE_SUPERVISOR", "Maintenance Supervisor"
        TECHNICIAN = "TECHNICIAN", "Technician"
        BRANCH_MANAGER = "BRANCH_MANAGER", "Branch Manager"
        BRANCH_USER = "BRANCH_USER", "Branch User"
        AUDITOR = "AUDITOR", "Auditor"
        # Legacy roles kept for backward compatibility during migration
        ADMINISTRATOR = "ADMINISTRATOR", "Administrator"
        SUPERVISOR = "SUPERVISOR", "Supervisor"
        MONITORING_OFFICER = "MONITORING_OFFICER", "Monitoring Officer"

    full_name = models.CharField(max_length=160, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.AUDITOR)
    district = models.ForeignKey(
        "organization.District",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="users",
    )
    branch = models.ForeignKey(
        "organization.Branch",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="users",
    )

    def __str__(self):
        return self.full_name or self.username

    @property
    def normalized_role(self):
        mapping = {
            "ADMINISTRATOR": "DISTRICT_ADMIN",
            "SUPERVISOR": "MAINTENANCE_SUPERVISOR",
            "MONITORING_OFFICER": "OPERATIONS_OFFICER",
        }
        return mapping.get(self.role, self.role)
