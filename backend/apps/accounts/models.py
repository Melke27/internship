from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    class Role(models.TextChoices):
        ADMINISTRATOR = "ADMINISTRATOR", "Administrator"
        SUPERVISOR = "SUPERVISOR", "Supervisor"
        TECHNICIAN = "TECHNICIAN", "Technician"
        MONITORING_OFFICER = "MONITORING_OFFICER", "Monitoring Officer"
        AUDITOR = "AUDITOR", "Read-Only / Auditor"
    full_name = models.CharField(max_length=160, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.AUDITOR)
    district = models.ForeignKey("organization.District", null=True, blank=True, on_delete=models.PROTECT, related_name="users")
    branch = models.ForeignKey("organization.Branch", null=True, blank=True, on_delete=models.PROTECT, related_name="users")
    def __str__(self): return self.full_name or self.username
