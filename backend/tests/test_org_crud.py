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
    """Districts are deliberately read-only (Yeka District is fixed)."""
    response = client_for(headoffice).post("/api/districts/", {"name": "Yeka", "code": "YK"})
    assert response.status_code == 405
    assert not District.objects.filter(code="YK").exists()


@pytest.mark.django_db
def test_district_read_only_blocks_update_and_delete(headoffice, org):
    empty = District.objects.create(name="Empty", code="EM")
    client = client_for(headoffice)
    assert client.delete(f"/api/districts/{empty.id}/").status_code == 405
    assert client.patch(f"/api/districts/{empty.id}/", {"name": "Renamed"}).status_code == 405
    assert District.objects.filter(id=empty.id).exists()


@pytest.mark.django_db
def test_district_list_always_returns_yeka(headoffice):
    """Only the fixed Yeka district is exposed via the API list."""
    from apps.organization.yeka import YEKA_CODE
    data = client_for(headoffice).get("/api/districts/").json()
    assert len(data) == 1
    assert data[0]["code"] == YEKA_CODE


@pytest.mark.django_db
def test_branch_must_be_deactivated_not_deleted(headoffice):
    """Only branches in the fixed Yeka district are visible; they cannot be deleted."""
    from apps.organization.yeka import get_yeka_district
    branch = Branch.objects.create(district=get_yeka_district(), name="Yeka Branch", code="YB1")
    response = client_for(headoffice).delete(f"/api/branches/{branch.id}/")
    assert response.status_code == 405
    assert Branch.objects.filter(id=branch.id).exists()


@pytest.mark.django_db
def test_branch_deactivate_requires_reason(headoffice):
    from apps.organization.yeka import get_yeka_district
    branch = Branch.objects.create(district=get_yeka_district(), name="Yeka Branch", code="YB2")
    response = client_for(headoffice).post(
        f"/api/branches/{branch.id}/deactivate/", {}
    )
    assert response.status_code == 400
    assert "reason" in response.data


@pytest.mark.django_db
def test_atm_delete_blocked_when_incidents_exist(headoffice, org):
    manager = make_user("mgr", "MONITORING_OFFICER", district=org["district_a"], branch=org["branch_a1"])
    atm = ATM.objects.create(reference="ATM-A1-001", branch=org["branch_a1"])
    Incident.objects.create(atm=atm, title="Broken", category="Hardware", reported_by=manager)
    response = client_for(headoffice).delete(f"/api/atms/{atm.id}/")
    assert response.status_code == 400
    assert "Deactivate it instead" in str(response.data["detail"])
    assert ATM.objects.filter(id=atm.id).exists()


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
    """Deleting an ATM (when safe) is audit-logged."""
    district = District.objects.create(name="District D", code="DD")
    branch = Branch.objects.create(district=district, name="Branch D1", code="D1")
    atm_a = ATM.objects.create(reference="ATM-D1-001", branch=branch)
    atm_b = ATM.objects.create(reference="ATM-D1-002", branch=branch)
    # ensure only atm_a is deletable (no incidents); atm_b gets an incident
    manager = make_user("mgr2", "MONITORING_OFFICER", district=district, branch=branch)
    Incident.objects.create(atm=atm_b, title="Broken", category="Hardware", reported_by=manager)
    response = client_for(headoffice).delete(f"/api/atms/{atm_a.id}/")
    assert response.status_code == 204
    from apps.audit.models import AuditLog
    assert AuditLog.objects.filter(action="ATM_DELETED", entity_id=str(atm_a.id)).exists()
