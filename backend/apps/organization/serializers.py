from rest_framework import serializers
from .models import District, Branch
class DistrictSerializer(serializers.ModelSerializer):
    branch_count=serializers.IntegerField(source="branches.count",read_only=True)
    class Meta: model=District; fields="__all__"
class BranchSerializer(serializers.ModelSerializer):
    district_name=serializers.CharField(source="district.name",read_only=True)
    class Meta: model=Branch; fields="__all__"

