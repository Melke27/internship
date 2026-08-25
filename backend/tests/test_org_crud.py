import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.assets.models import ATM
from apps.incidents.models import Incident
from apps.organization.models import District, Branch


def make_user(username, role, district=None, branch=None, staff=False):
    return User.objects.create_user(
        username=username, email=f"{username}@cbe.et", password="Pass12345!",
        full_name=username.title(), role=role, district=district, branch=branch,
        is_staff=staff,
    )


@pytest.fixture
def org():
    district_a = District.objects.create(name="District A", code="DA")
    branch_a1 = Branch.objects.create(district=district_a, name="Branch A1", code="A1")
    return {"district_a": district_a, "branch_a1": branch_a1}


def client_for(user):
    client = APIClient()
    client.default_format = "json"
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def headoffice(org):
    return make_user("headoffice", "ADMINISTRATOR")


@pytest.mark.django_db
def test_head_office_can_create_district(headoffice):
    response = client_for(headoffice).post("/api/districts/", {"name": "Yeka", "code": "YK"})
    assert response.status_code == 201
    assert District.objects.filter(code="YK").exists()


@pytest.mark.django_db
def test_head_office_can_delete_empty_district(headoffice):
    empty = District.objects.create(name="Empty", code="EM")
    response = client_for(headoffice).delete(f"/api/districts/{empty.id}/")
    assert response.status_code == 204
    assert not District.objects.filter(id=empty.id).exists()


@pytest.mark.django_db
def test_delete_district_with_branches_is_rejected(headoffice, org):
    response = client_for(headoffice).delete(f"/api/districts/{org['district_a'].id}/")
    assert response.status_code == 400
    assert "branch" in str(response.data["detail"]).lower()
    assert District.objects.filter(id=org["district_a"].id).exists()


@pytest.mark.django_db
def test_head_office_can_delete_branch_without_atms(headoffice, org):
    response = client_for(headoffice).delete(f"/api/branches/{org['branch_a1'].id}/")
    assert response.status_code == 204


@pytest.mark.django_db
def test_delete_branch_with_atms_is_rejected(headoffice, org):
    ATM.objects.create(reference="ATM-A1-001", branch=org["branch_a1"])
    response = client_for(headoffice).delete(f"/api/branches/{org['branch_a1'].id}/")
    assert response.status_code == 400
    assert Branch.objects.filter(id=org["branch_a1"].id).exists()


@pytest.mark.django_db
def test_delete_atm_with_incidents_suggests_decommission(headoffice, org):
    manager = make_user("mgr", "MONITORING_OFFICER", district=org["district_a"], branch=org["branch_a1"])
    atm = ATM.objects.create(reference="ATM-A1-001", branch=org["branch_a1"])
    Incident.objects.create(atm=atm, title="Broken", category="Hardware", reported_by=manager)
    response = client_for(headoffice).delete(f"/api/atms/{atm.id}/")
    assert response.status_code == 400
    assert "DECOMMISSIONED" in str(response.data["detail"])


@pytest.mark.django_db
def test_supervisor_cannot_create_or_delete_district():
    district = District.objects.create(name="District A", code="DA")
    admin = make_user("dadmin", "SUPERVISOR", district=district)
    client = client_for(admin)
    assert client.post("/api/districts/", {"name": "X", "code": "XX"}).status_code == 403
    assert client.delete(f"/api/districts/{district.id}/").status_code == 403


@pytest.mark.django_db
def test_supervisor_cannot_create_branch():
    district = District.objects.create(name="District A", code="DA")
    admin = make_user("dadmin2", "SUPERVISOR", district=district)
    response = client_for(admin).post("/api/branches/", {"district": district.id, "name": "Branch A9", "code": "A9"})
    assert response.status_code == 403


@pytest.mark.django_db
def test_deletion_is_audited(headoffice):
    empty = District.objects.create(name="Empty", code="EM")
    client_for(headoffice).delete(f"/api/districts/{empty.id}/")
    from apps.audit.models import AuditLog
    assert AuditLog.objects.filter(action="DISTRICT_DELETED", entity_id=str(empty.id)).exists()
