import pytest
from rest_framework.test import APIClient
from apps.accounts.models import User

@pytest.mark.django_db
def test_authenticated_user_can_read_me():
    user=User.objects.create_user(username="admin",password="password",is_staff=True)
    client=APIClient(); client.force_authenticate(user=user)
    response=client.get("/api/auth/me/")
    assert response.status_code == 200
    assert response.data["username"] == "admin"

