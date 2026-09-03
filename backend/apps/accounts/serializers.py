from rest_framework import serializers

from apps.organization.yeka import YEKA_CODE, YEKA_NAME, get_yeka_district

from .models import User


class UserSerializer(serializers.ModelSerializer):
    district_name = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "full_name",
            "phone",
            "role",
            "district",
            "branch",
            "district_name",
            "branch_name",
            "is_active",
            "password",
        ]
        extra_kwargs = {
            "password": {"write_only": True, "required": False},
            "district": {"read_only": True},
        }

    def get_district_name(self, obj):
        return YEKA_NAME

    def validate(self, attrs):
        """Keep user accounts within the single-district operating model."""
        role = attrs.get("role", getattr(self.instance, "role", None))
        branch = attrs.get("branch", getattr(self.instance, "branch", None))

        if role in {User.Role.BRANCH_USER, User.Role.BRANCH_MANAGER} and not branch:
            raise serializers.ValidationError({"branch": "A branch is required for branch users and branch managers."})

        if branch and branch.district.code != YEKA_CODE:
            raise serializers.ValidationError({"branch": f"Users can only be assigned to branches in {YEKA_NAME}."})

        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError({"password": "A temporary password is required when creating a user."})

        return attrs

    from django.db import transaction

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data["district"] = get_yeka_district()
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        validated_data["district"] = get_yeka_district()
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["full_name", "email", "phone"]
