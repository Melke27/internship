from django.db import models
class TimeStamped(models.Model):
    created_at=models.DateTimeField(auto_now_add=True); updated_at=models.DateTimeField(auto_now=True)
    class Meta: abstract=True
class District(TimeStamped):
    name=models.CharField(max_length=150); code=models.CharField(max_length=30,unique=True); description=models.TextField(blank=True); address=models.CharField(max_length=255,blank=True); phone=models.CharField(max_length=32,blank=True); email=models.EmailField(blank=True); status=models.CharField(max_length=20,choices=[("ACTIVE","Active"),("INACTIVE","Inactive")],default="ACTIVE")
    def __str__(self): return f"{self.name} ({self.code})"
class Branch(TimeStamped):
    district=models.ForeignKey(District,on_delete=models.PROTECT,related_name="branches"); name=models.CharField(max_length=150); code=models.CharField(max_length=30); branch_type=models.CharField(max_length=60,blank=True); address=models.CharField(max_length=255,blank=True); phone=models.CharField(max_length=32,blank=True); email=models.EmailField(blank=True); status=models.CharField(max_length=30,choices=[("SETUP","Under Setup"),("ACTIVE","Active"),("CLOSED","Temporarily Closed"),("INACTIVE","Inactive")],default="SETUP"); opening_date=models.DateField(null=True,blank=True)
    class Meta: constraints=[models.UniqueConstraint(fields=["district","code"],name="unique_branch_code_per_district")]
    def __str__(self): return f"{self.name} ({self.code})"

class SystemSetting(TimeStamped):
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField()
    description = models.CharField(max_length=255, blank=True)
    setting_type = models.CharField(
        max_length=20,
        choices=[("STRING", "String"), ("INT", "Integer"), ("BOOL", "Boolean"), ("JSON", "JSON")],
        default="STRING",
    )

    def __str__(self):
        return f"{self.key}: {self.value}"


class Department(TimeStamped):
    class DepartmentType(models.TextChoices):
        OPERATIONS = "OPERATIONS", "ATM Operations"
        TECHNICAL = "TECHNICAL", "IT & Technical Support"
        MAINTENANCE = "MAINTENANCE", "Maintenance & Engineering"
        AUDIT = "AUDIT", "Audit & Compliance"
        ADMINISTRATION = "ADMINISTRATION", "Administration & HR"

    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30, unique=True)
    district = models.ForeignKey(
        District,
        on_delete=models.PROTECT,
        related_name="departments",
        null=True,
        blank=True,
    )
    head = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_departments",
    )
    department_type = models.CharField(
        max_length=30,
        choices=DepartmentType.choices,
        default=DepartmentType.OPERATIONS,
    )
    description = models.TextField(blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    status = models.CharField(
        max_length=20,
        choices=[("ACTIVE", "Active"), ("INACTIVE", "Inactive")],
        default="ACTIVE",
    )

    def __str__(self):
        return f"{self.name} ({self.code})"



