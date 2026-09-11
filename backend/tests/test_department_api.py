import pytest
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from apps.organization.models import Department, District
from apps.organization.yeka import get_yeka_district, ensure_default_departments

User = get_user_model()


@pytest.fixture
def admin_user(db):
    yeka = get_yeka_district()
    return User.objects.create_user(
        username="test_dept_admin",
        password="password123",
        role="DISTRICT_ADMIN",
        district=yeka,
        is_staff=True,
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.mark.django_db
def test_list_departments(admin_client):
    response = admin_client.get("/api/departments/")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    items = data["results"] if isinstance(data, dict) and "results" in data else data
    assert len(items) >= 5
    codes = [d["code"] for d in items]
    assert "DEP-OPS" in codes
    assert "DEP-IT" in codes


@pytest.mark.django_db
def test_create_department(admin_client):
    payload = {
        "name": "New Security Department",
        "code": "DEP-SEC",
        "department_type": "OPERATIONS",
        "description": "Physical & Cyber Security for ATMs",
        "email": "security@cbe.com.et",
        "phone": "+251 11 661 9999",
    }
    response = admin_client.post("/api/departments/", payload, format="json")
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["code"] == "DEP-SEC"
    assert Department.objects.filter(code="DEP-SEC").exists()


@pytest.mark.django_db
def test_deactivate_department(admin_client):
    dept = Department.objects.create(
        name="Temporary Dept",
        code="DEP-TEMP",
        district=get_yeka_district(),
        status="ACTIVE",
    )
    response = admin_client.post(
        f"/api/departments/{dept.id}/deactivate/",
        {"reason": "Restructuring operations"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    dept.refresh_from_db()
    assert dept.status == "INACTIVE"


@pytest.mark.django_db
def test_department_summary(admin_client):
    dept = Department.objects.create(
        name="Summary Dept",
        code="DEP-SUMM",
        district=get_yeka_district(),
        status="ACTIVE",
    )
    response = admin_client.get(f"/api/departments/{dept.id}/summary/")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["code"] == "DEP-SUMM"
    assert "total_users" in data


@pytest.mark.django_db
def test_department_reports(admin_client):
    ensure_default_departments()
    response = admin_client.get("/api/reports/departments/")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 5
