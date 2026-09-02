import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, portalHome, useAuth } from './context/AuthContext';
import { PortalRoute, ProtectedRoute, PermissionRoute } from './components/routes/RouteGuards';
import ErrorBoundary from './components/feedback/ErrorBoundary';
import { LoadingState } from './components/feedback/StateView';
import AppLayout from './layouts/AppLayout';
import { AccessDeniedPage, NotFoundPage } from './pages/ErrorPages';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ATMsPage = lazy(() => import('./pages/ATMsPage'));
const ATMDetailsPage = lazy(() => import('./pages/ATMDetailsPage'));
const IncidentsPage = lazy(() => import('./pages/IncidentsPage'));
const IncidentDetailPage = lazy(() => import('./pages/IncidentDetailPage'));
const TroubleshootingPage = lazy(() => import('./pages/TroubleshootingPage'));
const EscalationsPage = lazy(() => import('./pages/EscalationsPage'));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'));
const MaintenanceOpsPage = lazy(() => import('./pages/MaintenancePage').then(m => ({ default: m.MaintenanceOpsPage })));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const BranchesPage = lazy(() => import('./pages/BranchesPage'));
const BranchDetailPage = lazy(() => import('./pages/BranchesPage').then(m => ({ default: m.BranchDetailPage })));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const ActiveFaultsPage = lazy(() => import('./pages/ActiveFaultsPage'));
const BranchReportsPage = lazy(() => import('./pages/BranchReportsPage'));
const DistrictBranchReportDetailPage = lazy(() => import('./pages/BranchReportsPage').then(m => ({ default: m.DistrictBranchReportDetailPage })));
const BranchDashboardPage = lazy(() => import('./pages/BranchDashboardPage'));
const BranchReportFormPage = lazy(() => import('./pages/BranchReportFormPage'));
const BranchReportsListPage = lazy(() => import('./pages/BranchReportFormPage').then(m => ({ default: m.BranchReportsListPage })));
const BranchReportDetailPage = lazy(() => import('./pages/BranchReportDetailPage'));
const StatusHistoryPage = lazy(() => import('./pages/BranchATMsPage'));
const BranchATMDetailPage = lazy(() => import('./pages/BranchATMsPage').then(m => ({ default: m.BranchATMDetailPage })));
const BranchATMsPage = lazy(() => import('./pages/BranchATMsPage').then(m => ({ default: m.BranchATMsPage })));

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

function RouteFallback() {
  return <LoadingState label="Loading page…" />;
}

function App() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Suspense fallback={<RouteFallback />}>
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
                <Route path="/atms" element={<PortalRoute portal={['district', 'maintenance']}><PermissionRoute permission="atm.view"><ATMsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/atms/:id" element={<PortalRoute portal={['district', 'maintenance']}><PermissionRoute permission="atm.view"><ATMDetailsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/active-faults" element={<PortalRoute portal={['district', 'maintenance']}><PermissionRoute permission="atm.view"><ActiveFaultsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/incidents" element={<PortalRoute portal={['district', 'maintenance']}><PermissionRoute permission="incident.view"><IncidentsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/incidents/:id" element={<PortalRoute portal={['district', 'maintenance']}><PermissionRoute permission="incident.view"><IncidentDetailPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branch-reports" element={<PortalRoute portal={['district', 'maintenance']}><PermissionRoute permission="branch_report.view"><BranchReportsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/branch-reports/:id" element={<PortalRoute portal={['district', 'maintenance']}><PermissionRoute permission="branch_report.view"><DistrictBranchReportDetailPage /></PermissionRoute></PortalRoute>} />
                <Route path="/troubleshooting" element={<PortalRoute portal="maintenance"><PermissionRoute permission="troubleshooting.view"><TroubleshootingPage /></PermissionRoute></PortalRoute>} />
                <Route path="/escalations" element={<PortalRoute portal="maintenance"><PermissionRoute permission="incident.view"><EscalationsPage /></PermissionRoute></PortalRoute>} />
                <Route path="/maintenance" element={<PortalRoute portal={['district', 'maintenance']}><PermissionRoute permission="maintenance.view"><MaintenancePage /></PermissionRoute></PortalRoute>} />
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
      </Suspense>
    </ErrorBoundary>
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
