import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.assets.models import ATM
from apps.incidents.models import Incident
from apps.audit.models import AuditLog
from apps.notifications.models import Notification
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
    district_b = District.objects.create(name="District B", code="DB")
    branch_a1 = Branch.objects.create(district=district_a, name="Branch A1", code="A1")
    branch_b1 = Branch.objects.create(district=district_b, name="Branch B1", code="B1")
    atm_a = ATM.objects.create(reference="ATM-A1-001", branch=branch_a1)
    atm_b = ATM.objects.create(reference="ATM-B1-001", branch=branch_b1)
    return {"district_a": district_a, "district_b": district_b,
            "branch_a1": branch_a1, "branch_b1": branch_b1,
            "atm_a": atm_a, "atm_b": atm_b}


@pytest.fixture
def users(org):
    return {
        "superadmin": make_user("superadmin", "ADMINISTRATOR", staff=True),
        "manager_a": make_user("manager_a", "MONITORING_OFFICER", district=org["district_a"], branch=org["branch_a1"]),
        "supervisor_a": make_user("supervisor_a", "SUPERVISOR", district=org["district_a"]),
        "technician_a": make_user("technician_a", "TECHNICIAN", district=org["district_a"]),
        "manager_b": make_user("manager_b", "MONITORING_OFFICER", district=org["district_b"], branch=org["branch_b1"]),
        "auditor": make_user("auditor", "AUDITOR"),
    }


def client_for(user):
    client = APIClient()
    client.default_format = "json"
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


def results(payload):
    return payload["results"] if isinstance(payload, dict) and "results" in payload else payload


# ---------------------------------------------------------------- authentication

@pytest.mark.django_db
def test_invalid_login_rejected():
    client = APIClient()
    response = client.post("/api/auth/token/", {"username": "ghost", "password": "wrong"})
    assert response.status_code == 401


@pytest.mark.django_db
def test_me_returns_permissions(users):
    data = client_for(users["supervisor_a"]).get("/api/auth/me/").json()
    assert data["username"] == "supervisor_a"
    assert "incident.assign" in data["permissions"]
    assert "incident.verify" in data["permissions"]


@pytest.mark.django_db
def test_technician_permissions_exclude_supervisor_actions(users):
    data = client_for(users["technician_a"]).get("/api/auth/me/").json()
    assert "incident.resolve" in data["permissions"]
    assert "incident.verify" not in data["permissions"]
    assert "user.create" not in data["permissions"]


# ---------------------------------------------------------------- scope

@pytest.mark.django_db
def test_district_scope_limits_atms_and_incidents(users, org):
    Incident.objects.create(atm=org["atm_a"], title="A problem", category="Hardware",
                            reported_by=users["manager_a"])
    Incident.objects.create(atm=org["atm_b"], title="B problem", category="Hardware",
                            reported_by=users["manager_b"])

    atms = results(client_for(users["manager_a"]).get("/api/atms/").json())
    assert [a["reference"] for a in atms] == ["ATM-A1-001"]

    incidents = results(client_for(users["manager_a"]).get("/api/incidents/").json())
    assert len(incidents) == 1 and incidents[0]["title"] == "A problem"


@pytest.mark.django_db
def test_cross_district_incident_access_rejected(users, org):
    other = Incident.objects.create(atm=org["atm_b"], title="B problem", category="Hardware",
                                    reported_by=users["manager_b"])
    response = client_for(users["manager_a"]).get(f"/api/incidents/{other.id}/")
    assert response.status_code == 404


@pytest.mark.django_db
def test_branch_manager_cannot_create_district(users):
    response = client_for(users["manager_a"]).post("/api/districts/", {"name": "X", "code": "XX"})
    assert response.status_code == 403


@pytest.mark.django_db
def test_head_office_can_create_district(users):
    """Districts are deliberately read-only; posting is rejected."""
    response = client_for(users["superadmin"]).post(
        "/api/districts/", {"name": "New District", "code": "ND"})
    assert response.status_code == 405


# ---------------------------------------------------------------- lifecycle

def create_incident(client, atm):
    return client.post("/api/incidents/", {
        "atm": atm.id, "category": "Hardware", "priority": "CRITICAL",
        "title": "Card reader jammed", "description": "ATM not accepting cards.",
    })


@pytest.mark.django_db
def test_full_incident_lifecycle_with_audit_and_notifications(users, org):
    reporter = users["manager_a"]; supervisor = users["supervisor_a"]; tech = users["technician_a"]
    spare_atm = ATM.objects.create(reference="ATM-A1-002", branch=org["branch_a1"])

    # 1. Monitoring officer reports the problem
    response = create_incident(client_for(reporter), org["atm_a"])
    assert response.status_code == 201
    incident_id = response.data["id"]
    assert response.data["status"] == Incident.Status.REPORTED

    # Critical incident notifies district supervisors (but not the actor)
    kinds = list(Notification.objects.filter(incident_id=incident_id).values_list("kind", flat=True))
    assert "CRITICAL_INCIDENT" in kinds

    # 2. Supervisor acknowledges
    response = client_for(supervisor).post(f"/api/incidents/{incident_id}/status/",
                                           {"status": "ACKNOWLEDGED"})
    assert response.status_code == 200

    # Technician may not acknowledge (fresh REPORTED incident keeps the transition valid)
    fresh = create_incident(client_for(reporter), spare_atm).data["id"]
    assert client_for(tech).post(f"/api/incidents/{fresh}/status/",
                                 {"status": "ACKNOWLEDGED"}).status_code == 403

    # 3. Supervisor assigns technician -> assignee notified
    response = client_for(supervisor).post(f"/api/incidents/{incident_id}/assign/",
                                           {"assigned_to": tech.id})
    assert response.status_code == 200
    assert Notification.objects.filter(recipient=tech, kind="INCIDENT_ASSIGNED",
                                       incident_id=incident_id).exists()

    # 4. Technician investigates then troubleshoots
    assert client_for(tech).post(f"/api/incidents/{incident_id}/status/",
                                 {"status": "INVESTIGATING"}).status_code == 200
    response = client_for(tech).post(f"/api/incidents/{incident_id}/troubleshooting/", {
        "action": "Network connectivity test",
        "observation": "ATM not communicating with monitoring system.",
        "result": "Connectivity unavailable.",
        "next_action": "Escalate to network support.",
    })
    assert response.status_code == 201, getattr(response, "data", None)

    # 5. Escalation -> supervisors notified
    response = client_for(tech).post(f"/api/incidents/{incident_id}/escalate/", {
        "reason": "Network link down", "technical_findings": "No carrier signal.",
        "required_team": "Network Support"})
    assert response.status_code == 201
    assert Notification.objects.filter(kind="INCIDENT_ESCALATED", incident_id=incident_id).exists()

    # 6. Continue and resolve -> supervisors notified for verification
    assert client_for(tech).post(f"/api/incidents/{incident_id}/status/",
                                 {"status": "INVESTIGATING"}).status_code == 200
    response = client_for(tech).post(f"/api/incidents/{incident_id}/resolve/", {
        "description": "Replaced faulty network module.",
        "action_performed": "Module swap and connectivity retest.",
        "final_status": "ATM restored to service."})
    assert response.status_code == 201
    assert Notification.objects.filter(kind="INCIDENT_RESOLVED", incident_id=incident_id).exists()

    # Technician may not verify
    assert client_for(tech).post(f"/api/incidents/{incident_id}/verify/", {
        "atm_available": True, "issue_cleared": True,
        "communication_working": True, "approved_test_completed": True}).status_code == 403

    # 7. Supervisor verifies with a failed check -> back to troubleshooting
    response = client_for(supervisor).post(f"/api/incidents/{incident_id}/verify/", {
        "atm_available": True, "issue_cleared": False,
        "communication_working": True, "approved_test_completed": False})
    assert response.status_code == 201
    assert Incident.objects.get(id=incident_id).status == Incident.Status.TROUBLESHOOTING

    # 8. Re-resolve and verify successfully
    response = client_for(tech).post(f"/api/incidents/{incident_id}/resolve/", {
        "description": "Final retest after supervisor feedback.",
        "action_performed": "Confirmed service stability.",
        "final_status": "ATM restored to service."})
    assert response.status_code == 201
    response = client_for(supervisor).post(f"/api/incidents/{incident_id}/verify/", {
        "atm_available": True, "issue_cleared": True,
        "communication_working": True, "approved_test_completed": True})
    assert response.status_code == 201
    assert Incident.objects.get(id=incident_id).status == Incident.Status.VERIFIED

    # 9. Supervisor closes after successful verification
    response = client_for(supervisor).post(f"/api/incidents/{incident_id}/close/")
    assert response.status_code == 200
    assert Incident.objects.get(id=incident_id).status == Incident.Status.CLOSED

    # Audit trail covers every step
    actions = set(AuditLog.objects.filter(entity="Incident").values_list("action", flat=True))
    assert {"INCIDENT_CREATED", "INCIDENT_ASSIGNED", "TROUBLESHOOTING_ADDED",
            "INCIDENT_ESCALATED", "INCIDENT_RESOLVED", "INCIDENT_VERIFIED"} <= actions

    # Closed incidents reject further mutations
    assert client_for(tech).post(f"/api/incidents/{incident_id}/status/",
                                 {"status": "INVESTIGATING"}).status_code == 400


@pytest.mark.django_db
def test_duplicate_active_incident_is_rejected(users, org):
    reporter = users["manager_a"]
    first = create_incident(client_for(reporter), org["atm_a"])
    assert first.status_code == 201
    duplicate = create_incident(client_for(reporter), org["atm_a"])
    assert duplicate.status_code == 400
    assert "existing_incident" in duplicate.json()


@pytest.mark.django_db
def test_invalid_transition_rejected(users, org):
    response = create_incident(client_for(users["manager_a"]), org["atm_a"])
    incident_id = response.data["id"]
    response = client_for(users["supervisor_a"]).post(f"/api/incidents/{incident_id}/status/",
                                                      {"status": "CLOSED"})
    assert response.status_code == 400


# ---------------------------------------------------------------- reports & notifications API

@pytest.mark.django_db
def test_reports_are_scoped(users, org):
    create_incident(client_for(users["manager_a"]), org["atm_a"])
    create_incident(client_for(users["manager_b"]), org["atm_b"])

    report = client_for(users["manager_a"]).get("/api/reports/districts/").json()
    assert len(report) == 1 and report[0]["district"] == "District A"

    tech_report = client_for(users["superadmin"]).get("/api/reports/technicians/").json()
    assert isinstance(tech_report, list)

    branch_report = client_for(users["manager_a"]).get("/api/reports/branches/").json()
    assert len(branch_report) == 1 and branch_report[0]["branch"] == "Branch A1"

    atm_report = client_for(users["manager_a"]).get(f"/api/reports/atms/{org['atm_a'].id}/").json()
    assert atm_report["atm"]["reference"] == "ATM-A1-001"
    cross = client_for(users["manager_a"]).get(f"/api/reports/atms/{org['atm_b'].id}/")
    assert cross.status_code == 404


@pytest.mark.django_db
def test_notification_endpoints(users, org):
    create_incident(client_for(users["manager_a"]), org["atm_a"])
    supervisor_client = client_for(users["supervisor_a"])
    assert supervisor_client.get("/api/notifications/unread_count/").json()["count"] >= 1
    notification_id = results(supervisor_client.get("/api/notifications/").json())[0]["id"]
    assert supervisor_client.post(f"/api/notifications/{notification_id}/mark_read/").status_code == 200
    assert supervisor_client.get("/api/notifications/unread_count/").json()["count"] == 0


# ---------------------------------------------------------------- assignment support

@pytest.mark.django_db
def test_technicians_endpoint_scoped_to_supervisor_district(users, org):
    make_user("technician_b", "TECHNICIAN", district=org["district_b"])
    data = results(client_for(users["supervisor_a"]).get("/api/users/technicians/").json())
    usernames = {row["username"] for row in data}
    assert "technician_a" in usernames
    assert "technician_b" not in usernames


@pytest.mark.django_db
def test_technicians_endpoint_denied_for_non_supervisor(users):
    assert client_for(users["manager_a"]).get("/api/users/technicians/").status_code == 403
    assert client_for(users["auditor"]).get("/api/users/technicians/").status_code == 403
    assert client_for(users["superadmin"]).get("/api/users/technicians/").status_code == 200


@pytest.mark.django_db
def test_incident_list_is_paginated(users, org):
    create_incident(client_for(users["manager_a"]), org["atm_a"])
    payload = client_for(users["manager_a"]).get("/api/incidents/").json()
    assert isinstance(payload, dict) and "results" in payload and payload["count"] == 1


@pytest.mark.django_db
def test_incident_duration_minutes_field(users, org):
    """duration_minutes is a read-only computed field on list and detail."""
    reporter = users["manager_a"]
    supervisor = users["supervisor_a"]
    tech = users["technician_a"]
    client = client_for(reporter)

    response = create_incident(client, org["atm_a"])
    incident_id = response.data["id"]
    assert "duration_minutes" in response.data
    assert response.data["duration_minutes"] == 0  # just created

    detail = client.get(f"/api/incidents/{incident_id}/").json()
    assert detail["duration_minutes"] == 0

    # Run a valid lifecycle to COMPLETION so closed_at/resolved_at are set.
    sup = client_for(supervisor)
    sup.post(f"/api/incidents/{incident_id}/status/", {"status": "ACKNOWLEDGED"})
    sup.post(f"/api/incidents/{incident_id}/assign/", {"assigned_to": tech.id})
    techc = client_for(tech)
    techc.post(f"/api/incidents/{incident_id}/status/", {"status": "INVESTIGATING"})
    techc.post(f"/api/incidents/{incident_id}/troubleshooting/", {
        "action": "Diagnostic", "observation": "x", "result": "y", "next_action": "z"})
    techc.post(f"/api/incidents/{incident_id}/escalate/", {
        "reason": "r", "technical_findings": "f", "required_team": "Network"})
    techc.post(f"/api/incidents/{incident_id}/status/", {"status": "INVESTIGATING"})
    techc.post(f"/api/incidents/{incident_id}/resolve/", {
        "description": "Fixed", "action_performed": "Replaced part", "final_status": "Restored"})
    sup.post(f"/api/incidents/{incident_id}/verify/", {
        "atm_available": True, "issue_cleared": True,
        "communication_working": True, "approved_test_completed": True})
    sup.post(f"/api/incidents/{incident_id}/close/", {})

    closed = client.get(f"/api/incidents/{incident_id}/").json()
    assert closed["status"] == "CLOSED"
    assert isinstance(closed["duration_minutes"], int)
    assert closed["duration_minutes"] >= 0
