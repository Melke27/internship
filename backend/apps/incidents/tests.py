from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

class IncidentIntegrationTests(APITestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user(username="integration-admin",password="integration-password",is_staff=True)
        self.client=APIClient()

    def test_jwt_login_and_dashboard_summary(self):
        login=self.client.post("/api/auth/token/",{"username":"integration-admin","password":"integration-password"},format="json")
        self.assertEqual(login.status_code,200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.assertEqual(self.client.get("/api/auth/me/").status_code,200)
    def test_new_api_endpoints(self):
        login = self.client.post("/api/auth/token/", {"username": "integration-admin", "password": "integration-password"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        
        # Test SLA metrics endpoint
        sla = self.client.get("/api/reports/sla/")
        self.assertEqual(sla.status_code, 200)
        self.assertIn("overall_sla_compliance", sla.data)
        
        # Test System Health endpoint
        health = self.client.get("/api/system/health/")
        self.assertEqual(health.status_code, 200)
        self.assertIn("status", health.data)

        # Test Bulk Status endpoint
        bulk = self.client.post("/api/atms/bulk-status/", {"ids": [1], "status": "OFFLINE", "reason": "Test outage"}, format="json")
        self.assertEqual(bulk.status_code, 200)
        self.assertIn("updated_count", bulk.data)

        # Test Change Password endpoint
        pwd = self.client.post("/api/auth/change_password/", {"current_password": "integration-password", "new_password": "new-strong-password"}, format="json")
        self.assertEqual(pwd.status_code, 200)
        self.assertEqual(pwd.data["detail"], "Password changed successfully.")


