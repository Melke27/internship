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

