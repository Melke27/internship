import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { hasPermission, roleLabel, useAuth } from '../context/AuthContext';
import { LoadingState, ErrorState } from '../components/feedback/StateView';
import type { DashboardSummary } from '../types/api';

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((response) => response.data),
  });

  if (!currentUser) return null;
  if (summary.isLoading) return <LoadingState label="Loading settings..." />;
  if (summary.isError) return <ErrorState message="Unable to load district configuration." />;

  const districtName = summary.data?.district_name || 'District';

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">System</p>
          <h1>Settings</h1>
          <p className="page-copy">Profile, district context and role-based access for the ATM technical operations dashboard.</p>
        </div>
      </div>

      <div className="details-grid">
        <article className="panel">
          <h2>User Profile</h2>
          <dl className="detail-grid">
            <div className="detail-item"><dt>Name</dt><dd>{currentUser.full_name || currentUser.username}</dd></div>
            <div className="detail-item"><dt>Username</dt><dd>{currentUser.username}</dd></div>
            <div className="detail-item"><dt>Email</dt><dd>{currentUser.email || '—'}</dd></div>
            <div className="detail-item"><dt>Role</dt><dd>{roleLabel(currentUser.role)}</dd></div>
            <div className="detail-item"><dt>Status</dt><dd>{currentUser.is_active ? 'Active' : 'Inactive'}</dd></div>
          </dl>
        </article>

        <article className="panel">
          <h2>District Context</h2>
          <dl className="detail-grid">
            <div className="detail-item"><dt>District</dt><dd>{districtName}</dd></div>
            <div className="detail-item"><dt>Branches</dt><dd>{summary.data?.branches ?? '—'}</dd></div>
            <div className="detail-item"><dt>Total ATMs</dt><dd>{summary.data?.atms ?? '—'}</dd></div>
            <div className="detail-item"><dt>Application Scope</dt><dd>Single district · Single dashboard</dd></div>
          </dl>
        </article>
      </div>

      <article className="panel">
        <h2>Permissions</h2>
        <p className="page-copy">Actions available in this dashboard are controlled by your assigned role. The backend enforces all permissions.</p>
        <div className="permission-tags">
          {(currentUser.permissions || []).map((permission) => (
            <span key={permission} className="permission-tag">{permission}</span>
          ))}
        </div>
      </article>

      {hasPermission(currentUser, 'user.view') ? (
        <article className="panel">
          <h2>Administration</h2>
          <p className="page-copy">Manage district users authorized to access the ATM support system.</p>
          <Link className="button secondary" to="/users">Manage Users</Link>
        </article>
      ) : null}
    </section>
  );
}
