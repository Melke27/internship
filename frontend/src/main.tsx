import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, portalHome, useAuth } from './context/AuthContext';
import { PortalRoute, ProtectedRoute, PermissionRoute } from './components/routes/RouteGuards';
import AppLayout from './layouts/AppLayout';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ATMsPage from './pages/ATMsPage';
import ATMDetailsPage from './pages/ATMDetailsPage';
import IncidentsPage from './pages/IncidentsPage';
import IncidentDetailPage from './pages/IncidentDetailPage';
import TroubleshootingPage from './pages/TroubleshootingPage';
import EscalationsPage from './pages/EscalationsPage';
import MaintenancePage, { MaintenanceOpsPage } from './pages/MaintenancePage';
import MonitoringPage from './pages/MonitoringPage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import BranchesPage, { BranchDetailPage } from './pages/BranchesPage';
import UsersPage from './pages/UsersPage';
import ActiveFaultsPage from './pages/ActiveFaultsPage';
import BranchReportsPage, { DistrictBranchReportDetailPage } from './pages/BranchReportsPage';
import BranchDashboardPage from './pages/BranchDashboardPage';
import BranchReportFormPage, { BranchReportsListPage } from './pages/BranchReportFormPage';
import BranchReportDetailPage from './pages/BranchReportDetailPage';
import StatusHistoryPage, { BranchATMDetailPage, BranchATMsPage } from './pages/BranchATMsPage';
import { AccessDeniedPage, NotFoundPage } from './pages/ErrorPages';

import './modern.css';
import './photo-overrides.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function HomeRedirect() {
  const { currentUser } = useAuth();
  return <Navigate to={portalHome(currentUser)} replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/dashboard" element={<PortalRoute portal="district"><DashboardPage /></PortalRoute>} />
                <Route path="/maintenance-ops" element={<PortalRoute portal="maintenance"><PermissionRoute permission="maintenance.view"><MaintenanceOpsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branch" element={<PortalRoute portal="branch"><BranchDashboardPage /></PortalRoute>} />
                <Route path="/branch/atms" element={<PortalRoute portal="branch"><PermissionRoute permission="atm.view"><BranchATMsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branch/atms/:id" element={<PortalRoute portal="branch"><PermissionRoute permission="atm.view"><BranchATMDetailPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branch/report" element={<PortalRoute portal="branch"><PermissionRoute permission="branch_report.create"><BranchReportFormPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branch/reports" element={<PortalRoute portal="branch"><PermissionRoute permission="branch_report.view"><BranchReportsListPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branch/reports/:id" element={<PortalRoute portal="branch"><PermissionRoute permission="branch_report.view"><BranchReportDetailPage /></PermissionRoute></PortalRoute>} />
                <Route path="/atms" element={<PortalRoute portal="district"><PermissionRoute permission="atm.view"><ATMsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/atms/:id" element={<PortalRoute portal="district"><PermissionRoute permission="atm.view"><ATMDetailsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/active-faults" element={<PortalRoute portal="district"><PermissionRoute permission="atm.view"><ActiveFaultsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/incidents" element={<PortalRoute portal="district"><PermissionRoute permission="incident.view"><IncidentsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/incidents/:id" element={<PortalRoute portal="district"><PermissionRoute permission="incident.view"><IncidentDetailPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branch-reports" element={<PortalRoute portal="district"><PermissionRoute permission="branch_report.view"><BranchReportsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branch-reports/:id" element={<PortalRoute portal="district"><PermissionRoute permission="branch_report.view"><DistrictBranchReportDetailPage /></PermissionRoute></PortalRoute>} />
                <Route path="/troubleshooting" element={<PortalRoute portal="maintenance"><PermissionRoute permission="troubleshooting.view"><TroubleshootingPage /></PermissionRoute></PortalRoute>} />
                <Route path="/escalations" element={<PortalRoute portal="maintenance"><PermissionRoute permission="incident.view"><EscalationsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/maintenance" element={<PortalRoute portal="maintenance"><PermissionRoute permission="maintenance.view"><MaintenancePage /></PermissionRoute></PortalRoute>} />
                <Route path="/monitoring" element={<PortalRoute portal="district"><PermissionRoute permission="atm.view"><MonitoringPage /></PermissionRoute></PortalRoute>} />
                <Route path="/status-history" element={<PortalRoute portal="district"><PermissionRoute permission="atm.view"><StatusHistoryPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branches" element={<PortalRoute portal="district"><PermissionRoute permission="branch.view"><BranchesPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branches/:id" element={<PortalRoute portal="district"><PermissionRoute permission="branch.view"><BranchDetailPage /></PermissionRoute></PortalRoute>} />
                <Route path="/reports" element={<PortalRoute portal={['district', 'maintenance']}><PermissionRoute permission="report.view"><ReportsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/users" element={<PortalRoute portal="district"><PermissionRoute permission="user.view"><UsersPage /></PermissionRoute></PortalRoute>} />
                <Route path="/audit-logs" element={<PortalRoute portal="district"><PermissionRoute permission="audit.view"><AuditPage /></PermissionRoute></PortalRoute>} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
