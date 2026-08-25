from django.conf import settings
from django.db import models
class AuditLog(models.Model):
    user=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,on_delete=models.SET_NULL); action=models.CharField(max_length=80); entity=models.CharField(max_length=80); entity_id=models.CharField(max_length=80); previous_value=models.JSONField(null=True,blank=True); new_value=models.JSONField(null=True,blank=True); created_at=models.DateTimeField(auto_now_add=True)
    class Meta: ordering=["-created_at"]

