from rest_framework import serializers
from .models import User
class UserSerializer(serializers.ModelSerializer):
    district_name=serializers.CharField(source="district.name",read_only=True,default=None)
    branch_name=serializers.CharField(source="branch.name",read_only=True,default=None)
    class Meta:
        model = User; fields = ["id","username","email","full_name","phone","role","district","branch","district_name","branch_name","is_active"]
