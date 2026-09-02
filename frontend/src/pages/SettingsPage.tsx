import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { hasPermission, roleLabel, useAuth } from '../context/AuthContext';
import { extractError } from '../lib/utils';
import { showToast } from '../lib/toast';
import { LoadingState } from '../components/feedback/StateView';
import type { DashboardSummary } from '../types/api';

export default function SettingsPage() {
  const { currentUser, refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState('');
  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((response) => response.data),
  });

  const saveProfile = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch('/auth/me/', payload).then((response) => response.data),
    onSuccess: async () => {
      showToast('Profile updated');
      setEditing(false);
      setFormError('');
      await refresh();
    },
    onError: (error) => setFormError(extractError(error, 'Unable to update profile.')),
  });

  if (!currentUser) return null;
  if (summary.isLoading) return <LoadingState label="Loading settings..." />;

  const districtName = summary.data?.district_name || 'District';
  const isSaving = saveProfile.isPending;

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>User Profile</h2>
            {!editing ? (
              <button className="button secondary small" onClick={() => setEditing(true)}>Edit Profile</button>
            ) : null}
          </div>
          {editing ? (
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const value = (name: string) =>
                  (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)?.value;
                const payload: Record<string, string> = {};
                if (value('full_name') !== currentUser.full_name) payload.full_name = value('full_name');
                if (value('email') !== (currentUser.email || '')) payload.email = value('email');
                if (value('phone') !== (currentUser.phone || '')) payload.phone = value('phone');
                saveProfile.mutate(payload);
              }}
            >
              <label>
                Full name
                <input
                  name="full_name"
                  className="field-input"
                  defaultValue={currentUser.full_name}
                  required
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  className="field-input"
                  defaultValue={currentUser.email || ''}
                />
              </label>
              <label>
                Phone
                <input
                  name="phone"
                  className="field-input"
                  defaultValue={currentUser.phone || ''}
                />
              </label>
              {formError ? <div className="error-banner" role="alert"><strong>{formError}</strong></div> : null}
              <div className="dialog-actions">
                <button type="button" className="button secondary" onClick={() => { setEditing(false); setFormError(''); }}>
                  Cancel
                </button>
                <button className="button primary" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <dl className="detail-grid">
              <div className="detail-item"><dt>Name</dt><dd>{currentUser.full_name || currentUser.username}</dd></div>
              <div className="detail-item"><dt>Username</dt><dd>{currentUser.username}</dd></div>
              <div className="detail-item"><dt>Email</dt><dd>{currentUser.email || '—'}</dd></div>
              <div className="detail-item"><dt>Phone</dt><dd>{currentUser.phone || '—'}</dd></div>
              <div className="detail-item"><dt>Role</dt><dd>{roleLabel(currentUser.role)}</dd></div>
              <div className="detail-item"><dt>Status</dt><dd>{currentUser.is_active ? 'Active' : 'Inactive'}</dd></div>
            </dl>
          )}
        </article>

        <article className="panel">
          <h2>District Context</h2>
          {summary.isError ? (
            <div className="form-error" role="alert">
              <span>Unable to load district configuration.</span>
              <button type="button" onClick={() => summary.refetch()} style={{ marginLeft: 'auto', fontWeight: 600, textDecoration: 'underline' }}>Retry</button>
            </div>
          ) : (
            <dl className="detail-grid">
              <div className="detail-item"><dt>District</dt><dd>{districtName}</dd></div>
              <div className="detail-item"><dt>Branches</dt><dd>{summary.data?.branches ?? '—'}</dd></div>
              <div className="detail-item"><dt>Total ATMs</dt><dd>{summary.data?.atms ?? '—'}</dd></div>
              <div className="detail-item"><dt>Application Scope</dt><dd>Single district · Single dashboard</dd></div>
            </dl>
          )}
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
