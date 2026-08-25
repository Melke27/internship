from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework_simplejwt.views import TokenRefreshView
from apps.organization.views import DistrictViewSet, BranchViewSet
from apps.assets.views import ATMViewSet, MaintenanceViewSet
from apps.incidents.views import IncidentViewSet
from apps.accounts.views import UserViewSet, MeView, LogoutView
from apps.accounts.auth_views import EmailOrUsernameTokenView
from apps.audit.views import AuditLogViewSet
from apps.notifications.views import NotificationViewSet
from apps.reports.views import DashboardSummaryView, DistrictReportView, BranchReportView, TechnicianReportView, ATMReportView, GlobalSearchView

router = DefaultRouter()
router.register("districts", DistrictViewSet, basename="district")
router.register("branches", BranchViewSet, basename="branch")
router.register("atms", ATMViewSet, basename="atm")
router.register("maintenance", MaintenanceViewSet, basename="maintenance")
router.register("incidents", IncidentViewSet, basename="incident")
router.register("users", UserViewSet, basename="user")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")
router.register("notifications", NotificationViewSet, basename="notification")
urlpatterns = [path("admin/", admin.site.urls), path("api/auth/token/", EmailOrUsernameTokenView.as_view(), name="token"), path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"), path("api/auth/logout/", LogoutView.as_view(), name="logout"), path("api/auth/me/", MeView.as_view()), path("api/reports/dashboard/", DashboardSummaryView.as_view(), name="dashboard-summary"), path("api/reports/districts/", DistrictReportView.as_view(), name="report-districts"), path("api/reports/branches/", BranchReportView.as_view(), name="report-branches"), path("api/reports/technicians/", TechnicianReportView.as_view(), name="report-technicians"), path("api/reports/atms/<int:pk>/", ATMReportView.as_view(), name="report-atm"), path("api/search/", GlobalSearchView.as_view(), name="global-search"), path("api/", include(router.urls)), path("api/schema/", SpectacularAPIView.as_view(), name="schema"), path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"))]
