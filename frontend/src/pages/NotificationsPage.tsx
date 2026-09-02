import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';

import { api } from '../lib/api';
import { canManageUsers, roleLabel, useAuth } from '../context/AuthContext';
import { listResource } from '../lib/utils';
import { showToast } from '../lib/toast';
import { useRoles } from '../hooks/useRoles';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { Dialog, Field, FormGrid, SelectInput, TextArea, TextInput } from '../components/ui/form';

interface NotificationRow {
  id: number;
  title: string;
  body: string;
  kind: string;
  is_read: boolean;
  created_at: string;
  incident: number | null;
  incident_ref?: string;
}

interface UserOption {
  id: number;
  username: string;
  full_name: string;
  role: string;
}

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

function kindMeta(kind: string | undefined) {
  if (kind === 'USER_ROLE_UPGRADED') return { label: 'Role upgraded', cls: 'kind-role' };
  if (kind === 'USER_ROLE_CHANGED') return { label: 'Role changed', cls: 'kind-role' };
  if (kind === 'ANNOUNCEMENT') return { label: 'Announcement', cls: 'kind-ann' };
  if (kind === 'MAINTENANCE_ASSIGNED' || kind === 'MAINTENANCE_COMPLETED')
    return { label: 'Maintenance', cls: 'kind-maint' };
  if (kind === 'ATM_RESTORED') return { label: 'ATM status', cls: 'kind-atm' };
  if (kind === 'CRITICAL_ATM' || kind === 'CRITICAL_INCIDENT')
    return { label: 'Critical', cls: 'kind-critical' };
  if (
    kind?.startsWith('INCIDENT') ||
    kind === 'INCIDENT_CREATED' ||
    kind === 'REPORT_CLOSED' ||
    kind === 'REPORT_RECEIVED' ||
    kind === 'BRANCH_REPORT'
  )
    return { label: 'Incident', cls: 'kind-inci' };
  return { label: 'Info', cls: 'kind-info' };
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [composeOpen, setComposeOpen] = useState(false);
  const canAnnounce = canManageUsers(currentUser);

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => list<NotificationRow>('/notifications/'),
  });
  const markRead = useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/mark_read/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'panel'] });
    },
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/mark_all_read/'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'panel'] });
    },
  });

  const rows = notifications.data || [];

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">System</p>
          <h1>Notifications</h1>
          <p className="page-copy">Operational alerts and administrator announcements.</p>
        </div>
        <div className="page-actions">
          {canAnnounce ? (
            <button className="button primary" onClick={() => setComposeOpen(true)}>
              <Megaphone size={16} /> Send Announcement
            </button>
          ) : null}
          {rows.some((notification) => !notification.is_read) ? (
            <button className="button secondary" onClick={() => markAll.mutate()}>
              Mark all read
            </button>
          ) : null}
        </div>
      </div>
      <div className="kpi-grid compact">
        <article className="metric-card"><span>Total Alerts</span><strong>{notifications.isLoading ? '…' : rows.length}</strong></article>
        <article className="metric-card warning"><span>Unread</span><strong>{rows.filter((notification) => !notification.is_read).length}</strong></article>
        <article className="metric-card success"><span>Read</span><strong>{rows.filter((notification) => notification.is_read).length}</strong></article>
      </div>
      <div className="panel">
        {notifications.isLoading ? <LoadingState label="Loading notifications..." /> : null}
        {notifications.isError ? <ErrorState message="Unable to load notifications." onRetry={() => notifications.refetch()} /> : null}
        {rows.length === 0 && !notifications.isLoading ? (
          <EmptyState
            title="No notifications"
            description="You will be alerted here when ATMs go offline, incidents are created, escalated, or when your role or access changes."
          />
        ) : null}
        {rows.length > 0 ? (
          <div className="list-stack">
            {rows.map((notification) => {
              const meta = kindMeta(notification.kind);
              const isRole = meta.cls === 'kind-role';
              return (
                <div key={notification.id} className={`list-card ${notification.is_read ? '' : 'unread'} ${isRole ? 'role-upgrade' : ''}`}>
                  <div className="badge-group">
                    <span className={`kind-tag ${meta.cls}`}>{meta.label}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <strong>{notification.title}</strong>
                    <small>{notification.body}</small>
                    <small>{new Date(notification.created_at).toLocaleString()}{notification.incident_ref ? ` · ${notification.incident_ref}` : ''}</small>
                  </div>
                  <div className="row-actions">
                    {notification.incident ? <Link className="button secondary small" to={`/incidents/${notification.incident}`}>Open</Link> : null}
                    {!notification.is_read ? (
                      <button className="button secondary small" onClick={() => markRead.mutate(notification.id)}>Mark read</button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {composeOpen ? (
        <AnnouncementDialog
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setComposeOpen(false);
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
            queryClient.invalidateQueries({ queryKey: ['notifications', 'panel'] });
          }}
        />
      ) : null}
    </section>
  );
}

function AnnouncementDialog({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [error, setError] = useState('');
  const [roleSelection, setRoleSelection] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const users = useQuery({
    queryKey: ['users', 'announce'],
    queryFn: () => listResource<UserOption>('/users/'),
  });
  const roles = useRoles();
  const roleOptions = roles.data || [];
  const send = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/notifications/announce/', payload),
    onSuccess: async () => {
      showToast('Announcement sent');
      onSent();
    },
    onError: (err) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Unable to send announcement.');
    },
  });

  const rows = useMemo(() => {
    const all = users.data || [];
    let filtered = all;
    if (roleSelection) filtered = filtered.filter((u) => u.role === roleSelection);
    return filtered;
  }, [users.data, roleSelection]);

  const toggleUser = (id: number) =>
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  const toggleRole = (role: string) =>
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const recipientCount =
    selectedUserIds.length + (selectedRoles.length > 0 ? rows.filter((u) => selectedRoles.includes(u.role)).length : 0);

  return (
    <Dialog
      kicker="ADMIN NOTICE"
      title="Send Announcement"
      description="Compose a notice and deliver it to selected users as a notification on their dashboard."
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const value = (name: string) =>
          (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
        if (!selectedUserIds.length && !selectedRoles.length) {
          setError('Select at least one recipient (user and/or role).');
          return;
        }
        send.mutate({
          title: value('title'),
          body: value('body'),
          recipient_ids: selectedUserIds,
          roles: selectedRoles,
        });
      }}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={send.isPending}>
            {send.isPending ? 'Sending…' : `Send to ${recipientCount || ''} recipient${recipientCount === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <Field label="Announcement Title" required>
        <TextInput name="title" required placeholder="e.g. Scheduled system maintenance tonight" />
      </Field>
      <Field label="Message" hint="Shown in the notification body on each recipient's dashboard">
        <TextArea name="body" rows={3} placeholder="Write the announcement message here…" />
      </Field>

      <Field label="Filter users by role">
        <SelectInput value={roleSelection} onChange={(event) => setRoleSelection(event.target.value)}>
          <option value="">All roles</option>
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </SelectInput>
      </Field>

      <FormGrid cols={2}>
        <Field label="Recipient Users">
          {rows.length === 0 && users.isLoading ? <small>Loading users…</small> : null}
          <div className="select-list">
            {rows.map((user) => (
              <label key={user.id} className="select-list-row">
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                />
                <span>
                  <strong>{user.full_name || user.username}</strong>
                  <small>{roleLabel(user.role)}{user.username ? ` · @${user.username}` : ''}</small>
                </span>
              </label>
            ))}
            {rows.length === 0 && !users.isLoading ? <small>No users match.</small> : null}
          </div>
        </Field>
        <Field label="Recipient Roles">
          <div className="select-list">
            {roleOptions.map((r) => (
              <label key={r.value} className="select-list-row">
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(r.value)}
                  onChange={() => toggleRole(r.value)}
                />
                <span>
                  <strong>{r.label}</strong>
                  <small>everyone with this role</small>
                </span>
              </label>
            ))}
          </div>
        </Field>
      </FormGrid>

      {error ? (
        <div className="error-banner"><strong>{error}</strong></div>
      ) : null}
    </Dialog>
  );
}
