import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Megaphone,
  Send,
  Loader2,
  CheckCheck,
  Search,
  Users,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Wrench,
  Bell,
  UserCheck,
  RefreshCw,
  X,
  Filter,
} from 'lucide-react';

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
  if (kind === 'USER_ROLE_UPGRADED' || kind === 'USER_ROLE_CHANGED')
    return { label: 'Role upgrade', cls: 'kind-role', icon: UserCheck };
  if (kind === 'ANNOUNCEMENT')
    return { label: 'Announcement', cls: 'kind-ann', icon: Megaphone };
  if (kind === 'MAINTENANCE_ASSIGNED' || kind === 'MAINTENANCE_COMPLETED')
    return { label: 'Maintenance', cls: 'kind-maint', icon: Wrench };
  if (kind === 'ATM_RESTORED')
    return { label: 'ATM status', cls: 'kind-atm', icon: CheckCircle2 };
  if (kind === 'CRITICAL_ATM' || kind === 'CRITICAL_INCIDENT')
    return { label: 'Critical', cls: 'kind-critical', icon: ShieldAlert };
  if (
    kind?.startsWith('INCIDENT') ||
    kind === 'INCIDENT_CREATED' ||
    kind === 'REPORT_CLOSED' ||
    kind === 'REPORT_RECEIVED' ||
    kind === 'BRANCH_REPORT'
  )
    return { label: 'Incident', cls: 'kind-inci', icon: AlertTriangle };
  return { label: 'Info', cls: 'kind-info', icon: Bell };
}

type CategoryFilter = 'all' | 'unread' | 'announcement' | 'incident' | 'maintenance';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all');
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
      showToast('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'panel'] });
    },
  });

  const rows = notifications.data || [];

  const filteredRows = useMemo(() => {
    return rows.filter((n) => {
      if (activeFilter === 'unread') return !n.is_read;
      if (activeFilter === 'announcement') return n.kind === 'ANNOUNCEMENT';
      if (activeFilter === 'incident')
        return (
          n.kind?.startsWith('INCIDENT') ||
          n.kind === 'CRITICAL_INCIDENT' ||
          n.kind === 'REPORT_CLOSED' ||
          n.kind === 'REPORT_RECEIVED' ||
          n.kind === 'BRANCH_REPORT'
        );
      if (activeFilter === 'maintenance')
        return n.kind === 'MAINTENANCE_ASSIGNED' || n.kind === 'MAINTENANCE_COMPLETED' || n.kind === 'ATM_RESTORED';
      return true;
    });
  }, [rows, activeFilter]);

  const unreadCount = useMemo(() => rows.filter((n) => !n.is_read).length, [rows]);

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">System</p>
          <h1>Notifications</h1>
          <p className="page-copy">Operational alerts, incident updates, and administrator announcements.</p>
        </div>
        <div className="page-actions">
          {canAnnounce ? (
            <button type="button" className="button primary" onClick={() => setComposeOpen(true)}>
              <Megaphone size={16} /> Send Announcement
            </button>
          ) : null}
          {unreadCount > 0 ? (
            <button
              type="button"
              className="button secondary"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              {markAll.isPending ? <Loader2 size={15} className="spin-icon" /> : <CheckCheck size={16} />}
              Mark all read
            </button>
          ) : null}
        </div>
      </div>

      <div className="kpi-grid compact">
        <article className="metric-card">
          <span>Total Alerts</span>
          <strong>{notifications.isLoading ? '…' : rows.length}</strong>
        </article>
        <article className="metric-card warning">
          <span>Unread</span>
          <strong>{unreadCount}</strong>
        </article>
        <article className="metric-card success">
          <span>Read</span>
          <strong>{rows.length - unreadCount}</strong>
        </article>
      </div>

      <div className="notif-filter-bar">
        <button
          type="button"
          className={`notif-filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All ({rows.length})
        </button>
        <button
          type="button"
          className={`notif-filter-tab ${activeFilter === 'unread' ? 'active' : ''}`}
          onClick={() => setActiveFilter('unread')}
        >
          Unread ({unreadCount})
        </button>
        <button
          type="button"
          className={`notif-filter-tab ${activeFilter === 'announcement' ? 'active' : ''}`}
          onClick={() => setActiveFilter('announcement')}
        >
          Announcements
        </button>
        <button
          type="button"
          className={`notif-filter-tab ${activeFilter === 'incident' ? 'active' : ''}`}
          onClick={() => setActiveFilter('incident')}
        >
          Incidents
        </button>
        <button
          type="button"
          className={`notif-filter-tab ${activeFilter === 'maintenance' ? 'active' : ''}`}
          onClick={() => setActiveFilter('maintenance')}
        >
          Maintenance
        </button>
      </div>

      <div className="panel">
        {notifications.isLoading ? <LoadingState label="Loading notifications..." /> : null}
        {notifications.isError ? (
          <ErrorState message="Unable to load notifications." onRetry={() => notifications.refetch()} />
        ) : null}
        {filteredRows.length === 0 && !notifications.isLoading ? (
          <EmptyState
            title="No notifications match"
            description="No alerts or announcements match your selected filter criteria."
          />
        ) : null}

        {filteredRows.length > 0 ? (
          <div className="list-stack">
            {filteredRows.map((notification) => {
              const meta = kindMeta(notification.kind);
              const IconComp = meta.icon;
              const isRole = meta.cls === 'kind-role';
              return (
                <div
                  key={notification.id}
                  className={`list-card ${notification.is_read ? '' : 'unread'} ${isRole ? 'role-upgrade' : ''}`}
                >
                  <div className={`kind-icon-badge ${meta.cls}`} title={meta.label}>
                    <IconComp size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{notification.title}</strong>
                      <span className={`kind-tag ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <small style={{ marginTop: 4 }}>{notification.body}</small>
                    <small style={{ marginTop: 2, color: 'var(--text-3)' }}>
                      {new Date(notification.created_at).toLocaleString()}
                      {notification.incident_ref ? ` · ${notification.incident_ref}` : ''}
                    </small>
                  </div>
                  <div className="row-actions">
                    {notification.incident ? (
                      <Link className="button secondary small" to={`/incidents/${notification.incident}`}>
                        View Incident
                      </Link>
                    ) : null}
                    {!notification.is_read ? (
                      <button
                        type="button"
                        className="button secondary small"
                        disabled={markRead.isPending && markRead.variables === notification.id}
                        onClick={() => markRead.mutate(notification.id)}
                      >
                        {markRead.isPending && markRead.variables === notification.id ? (
                          <Loader2 size={13} className="spin-icon" />
                        ) : null}
                        Mark read
                      </button>
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
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [roleSelection, setRoleSelection] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
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
      showToast('Announcement sent successfully');
      onSent();
    },
    onError: (err) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Unable to send announcement.');
    },
  });

  const allUsersList = users.data || [];

  // Filtered users for selection column
  const filteredUserRows = useMemo(() => {
    let list = allUsersList;
    if (roleSelection) list = list.filter((u) => u.role === roleSelection);
    if (userSearchQuery.trim()) {
      const q = userSearchQuery.toLowerCase();
      list = list.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.role?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allUsersList, roleSelection, userSearchQuery]);

  const toggleUser = (id: number) =>
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const toggleRole = (role: string) =>
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  // Shortcut preset handlers
  const handleSelectAllVisibleUsers = () => {
    const visibleIds = filteredUserRows.map((u) => u.id);
    setSelectedUserIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const handleClearUsers = () => setSelectedUserIds([]);

  const handleSelectAllRoles = () => {
    setSelectedRoles(roleOptions.map((r) => r.value));
  };

  const handleClearRoles = () => setSelectedRoles([]);

  const handleSelectRolePreset = (roleValue: string) => {
    if (!selectedRoles.includes(roleValue)) {
      setSelectedRoles((prev) => [...prev, roleValue]);
    }
  };

  // Recipient calculations
  const roleTargetUserCount = useMemo(() => {
    if (!selectedRoles.length) return 0;
    return allUsersList.filter((u) => selectedRoles.includes(u.role)).length;
  }, [allUsersList, selectedRoles]);

  const recipientCount = useMemo(() => {
    const directUserIds = new Set(selectedUserIds);
    if (selectedRoles.length > 0) {
      allUsersList.forEach((u) => {
        if (selectedRoles.includes(u.role)) directUserIds.add(u.id);
      });
    }
    return directUserIds.size;
  }, [selectedUserIds, selectedRoles, allUsersList]);

  const canSubmit = title.trim().length > 0 && recipientCount > 0 && !send.isPending;

  return (
    <Dialog
      kicker="ADMIN NOTICE"
      title="Send System Announcement"
      description="Compose an announcement notice and deliver it instantly to targeted users' dashboards."
      onClose={onClose}
      wide
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) {
          setError('Announcement title is required.');
          return;
        }
        if (recipientCount === 0) {
          setError('Select at least one recipient user or role.');
          return;
        }
        setError('');
        send.mutate({
          title: title.trim(),
          body: body.trim(),
          recipient_ids: selectedUserIds,
          roles: selectedRoles,
        });
      }}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose} disabled={send.isPending}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={!canSubmit}>
            {send.isPending ? (
              <>
                <Loader2 size={16} className="spin-icon" /> Sending announcement...
              </>
            ) : (
              <>
                <Send size={16} />
                {recipientCount > 0
                  ? `Send to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`
                  : 'Select recipients to send'}
              </>
            )}
          </button>
        </>
      }
    >
      <Field
        label={
          <span>
            Announcement Title <span className="char-counter">{title.length}/120</span>
          </span>
        }
        required
      >
        <TextInput
          name="title"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Scheduled system maintenance tonight at 10:00 PM"
        />
      </Field>

      <Field
        label={
          <span>
            Message Body <span className="char-counter">{body.length}/500</span>
          </span>
        }
        hint="Delivered in the notification card on each recipient's dashboard"
      >
        <TextArea
          name="body"
          rows={3}
          maxLength={500}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe the details, impact, or instructions for users…"
        />
      </Field>

      {/* Recipient summary & preset bar */}
      <div className="recipient-summary-bar">
        <div>
          <strong>Target Audience Summary</strong>
          <p style={{ margin: '2px 0 0', color: 'var(--text-2)', fontSize: 11.5 }}>
            {selectedUserIds.length} direct user(s) · {selectedRoles.length} role group(s) selected
          </p>
        </div>
        <div className="recipient-summary-badge">
          <Users size={14} />
          {recipientCount > 0 ? `${recipientCount} Unique Target Recipient${recipientCount === 1 ? '' : 's'}` : 'No targets selected'}
        </div>
      </div>

      {/* Full-width Quick Preset bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>Quick Presets:</span>
        <button
          type="button"
          className={`preset-chip ${selectedRoles.length === roleOptions.length && roleOptions.length > 0 ? 'active' : ''}`}
          onClick={handleSelectAllRoles}
        >
          All Roles ({roleOptions.length})
        </button>
        <button
          type="button"
          className={`preset-chip ${selectedUserIds.length === filteredUserRows.length && filteredUserRows.length > 0 ? 'active' : ''}`}
          onClick={handleSelectAllVisibleUsers}
        >
          All Visible Users ({filteredUserRows.length})
        </button>
        {roleOptions.slice(0, 3).map((r) => (
          <button
            key={`preset-bar-${r.value}`}
            type="button"
            className={`preset-chip ${selectedRoles.includes(r.value) ? 'active' : ''}`}
            onClick={() => toggleRole(r.value)}
          >
            {selectedRoles.includes(r.value) ? '✓ ' : '+ '}
            {r.label}
          </button>
        ))}
        {(selectedUserIds.length > 0 || selectedRoles.length > 0) && (
          <button
            type="button"
            className="preset-chip"
            style={{ color: 'var(--danger, #ef4444)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
            onClick={() => {
              setSelectedUserIds([]);
              setSelectedRoles([]);
            }}
          >
            Clear All
          </button>
        )}
      </div>

      <FormGrid cols={2}>
        {/* Recipient Users Column */}
        <Field label="Target Individual Users">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            <SelectInput
              value={roleSelection}
              onChange={(e) => setRoleSelection(e.target.value)}
              style={{ height: 32, fontSize: 11.5, padding: '0 8px' }}
            >
              <option value="">All Roles</option>
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </SelectInput>

            <div className="recipient-search-box" style={{ margin: 0 }}>
              <Search size={13} className="search-icon" />
              <TextInput
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search users…"
                style={{ height: 32, fontSize: 11.5 }}
              />
            </div>
          </div>

          <div className="select-list" style={{ maxHeight: 180, overflowY: 'auto' }}>
            {users.isLoading ? (
              <small style={{ color: 'var(--text-3)', padding: 8 }}>Loading directory…</small>
            ) : null}
            {filteredUserRows.map((user) => (
              <label
                key={user.id}
                className={`select-list-row ${selectedUserIds.includes(user.id) ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                />
                <span>
                  <strong>{user.full_name || user.username}</strong>
                  <small>
                    {roleLabel(user.role)}
                    {user.username ? ` · @${user.username}` : ''}
                  </small>
                </span>
              </label>
            ))}
            {filteredUserRows.length === 0 && !users.isLoading ? (
              <small style={{ color: 'var(--text-3)', padding: 8, display: 'block' }}>
                No active users match search.
              </small>
            ) : null}
          </div>
        </Field>

        {/* Recipient Roles Column */}
        <Field label="Target Role Groups">
          <div className="select-list" style={{ maxHeight: 220, overflowY: 'auto', marginTop: 0 }}>
            {roleOptions.map((r) => {
              const isSelected = selectedRoles.includes(r.value);
              return (
                <label
                  key={r.value}
                  className={`select-list-row ${isSelected ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleRole(r.value)}
                  />
                  <span>
                    <strong>{r.label}</strong>
                    <small>Deliver announcement to all users with this role</small>
                  </span>
                </label>
              );
            })}
          </div>
        </Field>
      </FormGrid>

      {error ? (
        <div className="error-banner" role="alert" style={{ marginTop: 12 }}>
          <strong>{error}</strong>
        </div>
      ) : null}
    </Dialog>
  );
}

