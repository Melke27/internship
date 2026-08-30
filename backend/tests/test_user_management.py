import pytest
from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.organization.models import Branch, District
from apps.organization.yeka import YEKA_CODE, YEKA_NAME


def client_for(user):
    client = APIClient()
    client.default_format = "json"
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.mark.django_db
def test_district_admin_can_create_branch_user_in_yeka():
    admin = User.objects.create_user(username="admin", password="Pass12345!", role="DISTRICT_ADMIN")
    yeka = District.objects.create(name=YEKA_NAME, code=YEKA_CODE)
    branch = Branch.objects.create(district=yeka, name="Mebrat Hayl", code="MH")

    response = client_for(admin).post("/api/users/", {
        "username": "branch.user",
        "email": "branch.user@example.com",
        "full_name": "Branch User",
        "role": "BRANCH_USER",
        "branch": branch.id,
        "password": "Pass12345!",
    })

    assert response.status_code == 201, response.data
    user = User.objects.get(username="branch.user")
    assert user.district == yeka
    assert user.branch == branch
    assert user.check_password("Pass12345!")


@pytest.mark.django_db
def test_branch_role_requires_a_yeka_branch():
    admin = User.objects.create_user(username="admin", password="Pass12345!", role="DISTRICT_ADMIN")
    other_district = District.objects.create(name="Other District", code="OTHER")
    other_branch = Branch.objects.create(district=other_district, name="Other Branch", code="OB")
    payload = {
        "username": "branch.user",
        "email": "branch.user@example.com",
        "full_name": "Branch User",
        "role": "BRANCH_USER",
        "password": "Pass12345!",
    }

    missing_branch = client_for(admin).post("/api/users/", payload)
    assert missing_branch.status_code == 400
    assert "branch" in missing_branch.data

    outside_yeka = client_for(admin).post("/api/users/", {**payload, "branch": other_branch.id})
    assert outside_yeka.status_code == 400
    assert "branch" in outside_yeka.data


@pytest.mark.django_db
def test_portal_account_command_creates_one_account_per_dashboard():
    call_command("create_portal_accounts", password="StrongPass!2026")

    users = {user.username: user for user in User.objects.all()}
    assert users["district.admin"].role == User.Role.DISTRICT_ADMIN
    assert users["district.admin"].email == "district.admin@example.test"
    assert users["maintenance.tech"].role == User.Role.TECHNICIAN
    assert users["branch.user"].role == User.Role.BRANCH_USER
    assert users["branch.user"].branch is not None
