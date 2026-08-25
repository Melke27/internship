from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User

class EmailOrUsernameTokenSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        identifier = attrs.get(self.username_field, "")
        if "@" in identifier:
            account = User.objects.filter(email__iexact=identifier, is_active=True).first()
            if account:
                attrs[self.username_field] = account.get_username()
        return super().validate(attrs)

