import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, PermissionRoute } from './components/routes/RouteGuards';
import AppLayout from './layouts/AppLayout';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ATMsPage from './pages/ATMsPage';
import ATMDetailsPage from './pages/ATMDetailsPage';
import IncidentsPage from './pages/IncidentsPage';
import IncidentDetailPage from './pages/IncidentDetailPage';
import TroubleshootingPage from './pages/TroubleshootingPage';
import EscalationsPage from './pages/EscalationsPage';
import MaintenancePage from './pages/MaintenancePage';
import MonitoringPage from './pages/MonitoringPage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import UsersPage from './pages/UsersPage';
import { AccessDeniedPage, NotFoundPage } from './pages/ErrorPages';

import './atm-ops.css';
import './enhancements.css';
import './branding.css';
import './photo-overrides.css';
import './logo-image.css';
import './password-toggle.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/atms" element={<PermissionRoute permission="atm.view"><ATMsPage /></PermissionRoute>} />
                <Route path="/atms/:id" element={<PermissionRoute permission="atm.view"><ATMDetailsPage /></PermissionRoute>} />
                <Route path="/incidents" element={<PermissionRoute permission="incident.view"><IncidentsPage /></PermissionRoute>} />
                <Route path="/incidents/:id" element={<PermissionRoute permission="incident.view"><IncidentDetailPage /></PermissionRoute>} />
                <Route path="/troubleshooting" element={<PermissionRoute permission="troubleshooting.view"><TroubleshootingPage /></PermissionRoute>} />
                <Route path="/escalations" element={<PermissionRoute permission="incident.view"><EscalationsPage /></PermissionRoute>} />
                <Route path="/maintenance" element={<PermissionRoute permission="maintenance.view"><MaintenancePage /></PermissionRoute>} />
                <Route path="/monitoring" element={<PermissionRoute permission="atm.view"><MonitoringPage /></PermissionRoute>} />
                <Route path="/reports" element={<PermissionRoute permission="report.view"><ReportsPage /></PermissionRoute>} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/users" element={<PermissionRoute permission="user.view"><UsersPage /></PermissionRoute>} />
                <Route path="/audit-logs" element={<PermissionRoute permission="audit.view"><AuditPage /></PermissionRoute>} />
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
