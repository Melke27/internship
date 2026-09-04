import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, KeyRound, ShieldCheck, Sliders, User, Users } from 'lucide-react';

import { api } from '../lib/api';
import { hasPermission, roleLabel, useAuth } from '../context/AuthContext';
import { extractError } from '../lib/utils';
import { showToast } from '../lib/toast';
import { LoadingState } from '../components/feedback/StateView';
import { Dialog, Field, TextInput } from '../components/ui/form';
import type { DashboardSummary } from '../types/api';

const PERMISSION_LABELS: Record<string, string> = {
  'atm.view': 'View ATMs',
  'atm.create': 'Register ATMs',
  'atm.update': 'Update ATMs',
  'atm.status_confirm': 'Confirm ATM Status',
  'atm.activate': 'Activate ATMs',
  'atm.deactivate': 'Deactivate ATMs',
  'status_history.view': 'View Status History',

  'incident.view': 'View Incidents',
  'incident.create': 'Log Incidents',
  'incident.assign': 'Assign Technicians',
  'incident.reassign': 'Reassign Technicians',
  'incident.escalate': 'Escalate Incidents',
  'incident.resolve': 'Resolve Tickets',
  'incident.verify': 'Verify Resolutions',
  'incident.close': 'Close Incidents',
  'incident.retest': 'Retest Hardware',
  'troubleshooting.create': 'Record Diagnostics',
  'troubleshooting.view': 'View Diagnostics',

  'maintenance.view': 'View Maintenance',
  'maintenance.create': 'Request Maintenance',
  'maintenance.update': 'Update Maintenance',
  'maintenance.approve': 'Approve Maintenance',
  'maintenance.assign': 'Assign Maintenance',
  'maintenance.start': 'Start Work',
  'maintenance.complete': 'Complete Maintenance',
  'maintenance.verify': 'Verify Maintenance',

  'branch_report.view': 'View Branch Reports',
  'branch_report.review': 'Review Reports',
  'branch_report.convert': 'Convert to Incident',
  'branch_report.dismiss': 'Dismiss Reports',

  'branch.view': 'View Branches',
  'branch.create': 'Register Branches',
  'branch.update': 'Update Branches',
  'branch.deactivate': 'Deactivate Branches',
  'user.view': 'View Users',
  'user.create': 'Create Users',
  'user.update': 'Update Users',
  'user.disable': 'Disable Users',
  'audit.view': 'View Audit Logs',
  'report.view': 'View Reports',
  'report.export': 'Export Data',
  'notification.view': 'View Alerts',
  'notification.manage': 'Manage Alerts',
  'role.view': 'View Roles',
  'district.view': 'View District',
};

const PERMISSION_GROUPS: { title: string; prefix: string[] }[] = [
  { title: 'ATMs & Monitoring', prefix: ['atm.', 'status_history.'] },
  { title: 'Incidents & Troubleshooting', prefix: ['incident.', 'troubleshooting.'] },
  { title: 'Maintenance Operations', prefix: ['maintenance.'] },
  { title: 'Branch Reports', prefix: ['branch_report.'] },
  { title: 'Organization & Administration', prefix: ['branch.', 'user.', 'audit.', 'report.', 'notification.', 'district.', 'role.'] },
];

function groupPermissions(permissions: string[]) {
  const groups: Record<string, string[]> = {};
  const uncategorized: string[] = [];

  for (const perm of permissions) {
    let matched = false;
    for (const group of PERMISSION_GROUPS) {
      if (group.prefix.some((p) => perm.startsWith(p))) {
        groups[group.title] = groups[group.title] || [];
        groups[group.title].push(perm);
        matched = true;
        break;
      }
    }
    if (!matched) uncategorized.push(perm);
  }

  return { groups, uncategorized };
}

export default function SettingsPage() {
  const { currentUser, refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [pwdError, setPwdError] = useState('');

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

  const changePassword = useMutation({
    mutationFn: (payload: { current_password: string; new_password: string }) =>
      api.post('/auth/change_password/', payload).then((response) => response.data),
    onSuccess: () => {
      showToast('Password changed successfully');
      setPasswordDialogOpen(false);
      setPwdError('');
    },
    onError: (error) => setPwdError(extractError(error, 'Unable to change password.')),
  });

  if (!currentUser) return null;
  if (summary.isLoading) return <LoadingState label="Loading settings..." />;

  const districtName = summary.data?.district_name || 'District';
  const isSaving = saveProfile.isPending;
  const groupedPerms = groupPermissions(currentUser.permissions || []);

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">System</p>
          <h1>Settings</h1>
          <p className="page-copy">Profile details, district configuration, and assigned role access controls.</p>
        </div>
      </div>

      <div className="details-grid">
        <article className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <User size={18} style={{ color: 'var(--brand)' }} /> User Profile
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {!editing ? (
                <>
                  <button type="button" className="button secondary small" onClick={() => setEditing(true)}>
                    Edit Profile
                  </button>
                  <button type="button" className="button secondary small" onClick={() => setPasswordDialogOpen(true)}>
                    Change Password
                  </button>
                </>
              ) : null}
            </div>
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
                Full Name
                <input name="full_name" className="field-input" defaultValue={currentUser.full_name} required />
              </label>
              <label>
                Email
                <input name="email" type="email" className="field-input" defaultValue={currentUser.email || ''} />
              </label>
              <label>
                Phone
                <input name="phone" className="field-input" defaultValue={currentUser.phone || ''} />
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
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px' }}>
            <Building2 size={18} style={{ color: 'var(--brand)' }} /> District Context
          </h2>
          {summary.isError ? (
            <div className="form-error" role="alert">
              <span>Unable to load district configuration.</span>
              <button type="button" onClick={() => summary.refetch()} style={{ marginLeft: 'auto', fontWeight: 600, textDecoration: 'underline' }}>
                Retry
              </button>
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
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
          <ShieldCheck size={18} style={{ color: 'var(--brand)' }} /> Permissions & Access Rights
        </h2>
        <p className="page-copy" style={{ marginBottom: 16 }}>
          Actions available in this dashboard are controlled by your assigned role ({roleLabel(currentUser.role)}).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {Object.entries(groupedPerms.groups).map(([groupTitle, perms]) => (
            <div key={groupTitle} style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line-soft)' }}>
              <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', display: 'block', marginBottom: 8 }}>
                {groupTitle} ({perms.length})
              </strong>
              <div className="permission-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {perms.map((permission) => (
                  <span key={permission} className="permission-tag" title={permission}>
                    {PERMISSION_LABELS[permission] || permission}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {groupedPerms.uncategorized.length > 0 && (
            <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line-soft)' }}>
              <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', display: 'block', marginBottom: 8 }}>
                Other ({groupedPerms.uncategorized.length})
              </strong>
              <div className="permission-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {groupedPerms.uncategorized.map((permission) => (
                  <span key={permission} className="permission-tag" title={permission}>
                    {PERMISSION_LABELS[permission] || permission}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>

      {hasPermission(currentUser, 'district.view') && (
        <article className="panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
            <Sliders size={18} style={{ color: 'var(--brand)' }} /> System SLA & Operational Parameters
          </h2>
          <p className="page-copy" style={{ marginBottom: 14 }}>
            Configure target resolution SLA hours and automated alert routing across {districtName}.
          </p>

          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement)?.value;
              const payload = {
                sla_critical_hours: value('sla_critical_hours'),
                sla_high_hours: value('sla_high_hours'),
                sla_medium_hours: value('sla_medium_hours'),
                sla_low_hours: value('sla_low_hours'),
                auto_escalate_enabled: value('auto_escalate_enabled'),
                email_notifications: value('email_notifications'),
              };
              api.post('/system/settings/', payload).then(() => {
                showToast('System operational parameters updated');
              }).catch((err) => {
                showToast(extractError(err, 'Failed to save settings'), 'error');
              });
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, width: '100%' }}>
              <label>
                Critical SLA Target (Hours)
                <input name="sla_critical_hours" type="number" min="1" max="72" className="field-input" defaultValue="4" required />
              </label>
              <label>
                High Priority SLA (Hours)
                <input name="sla_high_hours" type="number" min="1" max="168" className="field-input" defaultValue="8" required />
              </label>
              <label>
                Medium Priority SLA (Hours)
                <input name="sla_medium_hours" type="number" min="1" max="336" className="field-input" defaultValue="24" required />
              </label>
              <label>
                Low Priority SLA (Hours)
                <input name="sla_low_hours" type="number" min="1" max="720" className="field-input" defaultValue="48" required />
              </label>
              <label>
                Auto Incident Escalation
                <select name="auto_escalate_enabled" className="field-input" defaultValue="true">
                  <option value="true">Enabled (Escalate after SLA breach)</option>
                  <option value="false">Disabled (Manual escalation only)</option>
                </select>
              </label>
              <label>
                System Alert Email Notifications
                <select name="email_notifications" className="field-input" defaultValue="true">
                  <option value="true">Enabled (Send to District Admin)</option>
                  <option value="false">Disabled</option>
                </select>
              </label>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="button primary">Save System Parameters</button>
            </div>
          </form>
        </article>
      )}

      {hasPermission(currentUser, 'user.view') ? (
        <article className="panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
            <Users size={18} style={{ color: 'var(--brand)' }} /> Administration
          </h2>
          <p className="page-copy">Manage district users authorized to access the ATM support system.</p>
          <Link className="button secondary" to="/users">Manage Users</Link>
        </article>
      ) : null}

      {passwordDialogOpen && (
        <Dialog
          title="Change Password"
          description="Update your account login password. Enter your current password to proceed."
          onClose={() => { setPasswordDialogOpen(false); setPwdError(''); }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const current_password = (form.elements.namedItem('current_password') as HTMLInputElement).value;
            const new_password = (form.elements.namedItem('new_password') as HTMLInputElement).value;
            const confirm_password = (form.elements.namedItem('confirm_password') as HTMLInputElement).value;
            if (new_password !== confirm_password) {
              setPwdError('New password and confirm password do not match.');
              return;
            }
            changePassword.mutate({ current_password, new_password });
          }}
          footer={
            <>
              <button type="button" className="app-btn app-btn-secondary app-btn-md" onClick={() => { setPasswordDialogOpen(false); setPwdError(''); }}>
                Cancel
              </button>
              <button type="submit" className="app-btn app-btn-primary app-btn-md" disabled={changePassword.isPending}>
                {changePassword.isPending ? 'Updating...' : 'Update Password'}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Current Password" required>
              <TextInput name="current_password" type="password" placeholder="Enter current password" required />
            </Field>
            <Field label="New Password" hint="Must be at least 6 characters long." required>
              <TextInput name="new_password" type="password" placeholder="Enter new password" required minLength={6} />
            </Field>
            <Field label="Confirm New Password" required>
              <TextInput name="confirm_password" type="password" placeholder="Confirm new password" required minLength={6} />
            </Field>
            {pwdError ? <div className="form-error" role="alert"><span>{pwdError}</span></div> : null}
          </div>
        </Dialog>
      )}
    </section>
  );
}



