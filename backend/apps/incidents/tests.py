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
        summary=self.client.get("/api/reports/dashboard/")
        self.assertEqual(summary.status_code,200)
        self.assertIn("atm_status",summary.data)

