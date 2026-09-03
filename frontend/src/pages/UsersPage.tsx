import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldCheck, Users, UserX, Wrench } from 'lucide-react';

import { canManageUsers, hasPermission, roleLabel, useAuth } from '../context/AuthContext';
import { FIXED_DISTRICT_NAME } from '../lib/navigation';
import { api } from '../lib/api';
import { extractError, listResource } from '../lib/utils';
import { showToast } from '../lib/toast';
import { useRoles, type RoleOption } from '../hooks/useRoles';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';
import { Dialog, Field, FormGrid, SelectInput, TextInput } from '../components/ui/form';
import type { BranchRow } from './BranchesPage';

interface UserRow {
  id: number;
  username: string;
  email: string;
  full_name: string;
  phone?: string;
  role: string;
  district: number | null;
  branch: number | null;
  district_name: string | null;
  branch_name: string | null;
  is_active: boolean;
}

/** Pick avatar color class by role family */
function avatarClass(role: string) {
  if (role === 'TECHNICIAN') return 'role-technician';
  if (['BRANCH_USER', 'BRANCH_MANAGER'].includes(role)) return 'role-branch';
  if (role === 'AUDITOR') return 'role-auditor';
  return '';
}

/** Color-coded role badge */
function RoleBadge({ role }: { role: string }) {
  const cls = role.toLowerCase().replace(/ /g, '_');
  return (
    <span className={`role-badge role-${cls}`}>
      {roleLabel(role)}
    </span>
  );
}

/** User initials from full_name or username */
function initials(user: UserRow) {
  const name = user.full_name || user.username;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => listResource<UserRow>('/users/'),
  });
  const roles = useRoles();
  const roleOptions = roles.data || [];

  const toggleActive = useMutation({
    mutationFn: (user: UserRow) => api.patch(`/users/${user.id}/`, { is_active: !user.is_active }),
    onSuccess: async () => {
      setError('');
      showToast('User updated');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(extractError(err, 'Unable to update the user account.')),
  });

  const allRows = users.data || [];
  const canEdit = canManageUsers(currentUser);

  // Client-side filtering — must stay before any early returns to preserve hook order
  const rows = useMemo(() => {
    let filtered = allRows;
    if (searchInput.trim()) {
      const q = searchInput.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          (u.full_name || '').toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.branch_name || '').toLowerCase().includes(q),
      );
    }
    if (roleFilter) {
      filtered = filtered.filter((u) => u.role === roleFilter);
    }
    return filtered;
  }, [allRows, searchInput, roleFilter]);

  const totalUsers = allRows.length;
  const activeUsers = allRows.filter((u) => u.is_active).length;
  const technicians = allRows.filter((u) => u.role === 'TECHNICIAN').length;
  const branchUsers = allRows.filter((u) => ['BRANCH_USER', 'BRANCH_MANAGER'].includes(u.role)).length;

  if (users.isLoading) return <LoadingState label="Loading users..." />;
  if (users.isError) {
    return <ErrorState message="Unable to load users." onRetry={() => users.refetch()} />;
  }

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Organization</p>
          <h1>Users</h1>
          <p className="page-copy">{FIXED_DISTRICT_NAME} — assign roles for ATM operations.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button secondary" onClick={() => users.refetch()}>
            Refresh
          </button>
          {hasPermission(currentUser, 'user.create') ? (
            <button type="button" className="button primary" onClick={() => setOpen(true)}>
              + Create User
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="error-banner" role="alert">
          <strong>{error}</strong>
        </div>
      ) : null}

      {/* KPI row — proper MetricCards */}
      <div className="kpi-grid compact" style={{ marginBottom: 20 }}>
        <MetricCard label="Total Users" value={totalUsers} icon={<Users size={18} />} hint="in district" />
        <MetricCard label="Active" value={activeUsers} icon={<ShieldCheck size={18} />} tone="success" hint="accounts enabled" />
        <MetricCard label="Technicians" value={technicians} icon={<Wrench size={18} />} hint="field engineers" />
        <MetricCard label="Branch Users" value={branchUsers} icon={<UserX size={18} />} hint="branch-level roles" />
      </div>

      {/* Search + filter bar */}
      <div className="filter-bar">
        <div className="page-search-bar" style={{ flex: 1, minWidth: 220, margin: 0 }}>
          <Search size={15} aria-hidden />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name, username, email, or branch..."
            aria-label="Search by name, username, email, or branch"
          />
        </div>
        <select
          className="field-input"
          style={{ width: 200 }}
          value={roleFilter}
          aria-label="Filter by role"
          onChange={(event) => setRoleFilter(event.target.value)}
        >
          <option value="">All roles</option>
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        {(searchInput || roleFilter) && (
          <button type="button" className="button secondary small" onClick={() => { setSearchInput(''); setRoleFilter(''); }}>
            Clear
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={searchInput || roleFilter ? 'No users match your search' : 'No users'}
          description={searchInput || roleFilter ? 'Try a different name, email, or role.' : 'Create users for district operations.'}
        />
      ) : (
        <div className="table-wrap panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Branch</th>
                <th>District</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="user-avatar-row">
                      <span className={`user-avatar-sm ${avatarClass(user.role)}`}>
                        {initials(user)}
                      </span>
                      <div className="user-info-cell">
                        <strong>{user.full_name || user.username}</strong>
                        <small>{user.email}</small>
                      </div>
                    </div>
                  </td>
                  <td><RoleBadge role={user.role} /></td>
                  <td>{user.branch_name || <span style={{ color: 'var(--text-3)' }}>District-wide</span>}</td>
                  <td>{FIXED_DISTRICT_NAME}</td>
                  <td>
                    <StatusBadge value={user.is_active ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td>
                    {canEdit && currentUser?.id !== user.id ? (
                      <div className="table-actions" style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="button secondary small" onClick={() => setEditing(user)}>
                          Edit
                        </button>
                        <button
                          className={`button ${user.is_active ? 'secondary' : 'ghost'} small`}
                          disabled={toggleActive.isPending}
                          onClick={() => toggleActive.mutate(user)}
                        >
                          {user.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length < allRows.length && (
            <p style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-3)' }}>
              Showing {rows.length} of {allRows.length} users
            </p>
          )}
        </div>
      )}

      {open ? <CreateUserDialog roles={roleOptions} onClose={() => setOpen(false)} /> : null}
      {editing ? <EditUserDialog user={editing} roles={roleOptions} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function roleDescription(role: string) {
  switch (role) {
    case 'DISTRICT_ADMIN':
      return 'Full administrative access across all district ATMs, user accounts, and system configurations.';
    case 'OPERATIONS_OFFICER':
      return 'Full oversight of ATM health monitoring, incident management, maintenance jobs, and reporting.';
    case 'MAINTENANCE_SUPERVISOR':
      return 'Dispatches maintenance jobs, assigns field technicians, and verifies completion of repairs.';
    case 'TECHNICIAN':
      return 'Field engineer access to assigned incidents, technical status updates, and repair logs.';
    case 'BRANCH_MANAGER':
      return 'Manages branch ATM issues, monitors local uptime, and reviews branch fault submissions.';
    case 'BRANCH_USER':
      return 'Submits branch ATM fault reports and monitors status for assigned branch units.';
    case 'AUDITOR':
      return 'Read-only compliance access to audit logs, incident histories, and operational reports.';
    default:
      return 'Controls system access and operational capabilities.';
  }
}

function CreateUserDialog({ roles, onClose }: { roles: RoleOption[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [role, setRole] = useState('BRANCH_USER');
  const branches = useQuery({
    queryKey: ['branches', 'user-form'],
    queryFn: () => listResource<BranchRow>('/branches/?ordering=name'),
  });
  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/users/', payload),
    onSuccess: async () => {
      showToast(`User created for ${FIXED_DISTRICT_NAME}`);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });

  const needsBranch = ['BRANCH_USER', 'BRANCH_MANAGER'].includes(role);

  return (
    <Dialog
      kicker="USER MANAGEMENT"
      title="Create User Account"
      description={`Create an operational account for ${FIXED_DISTRICT_NAME}.`}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const value = (name: string) =>
          (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement)?.value;
        create.mutate({
          username: value('username'),
          email: value('email'),
          full_name: value('full_name'),
          phone: value('phone'),
          role: value('role'),
          branch: value('branch') ? Number(value('branch')) : null,
          password: value('password'),
          is_active: true,
        });
      }}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create User'}
          </button>
        </>
      }
    >
      <Field label="Full Name" required>
        <TextInput name="full_name" required placeholder="e.g. Abebe Kebede" />
      </Field>
      <FormGrid>
        <Field label="Username" required>
          <TextInput name="username" required placeholder="e.g. abebe.k" />
        </Field>
        <Field label="Email Address" required>
          <TextInput name="email" type="email" required placeholder="user@example.com" />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Phone Number">
          <TextInput name="phone" type="tel" placeholder="+251 9..." />
        </Field>
        <Field label="Temporary Password" required hint="Min 8 characters — required on first sign in">
          <TextInput name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
        </Field>
      </FormGrid>
      <Field label="Assigned Role" required>
        <SelectInput name="role" value={role} onChange={(event) => setRole(event.target.value)} required>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </SelectInput>
      </Field>
      <div className="readonly-card" style={{ marginTop: 4, marginBottom: 12 }}>
        <span>Role Permissions & Scope</span>
        <div style={{ marginTop: 4, marginBottom: 6 }}>
          <RoleBadge role={role} />
        </div>
        <small>{roleDescription(role)}</small>
      </div>
      {needsBranch ? (
        <Field label="Assigned Branch" required hint="Required for branch-level roles">
          <SelectInput name="branch" required>
            <option value="">Select branch</option>
            {(branches.data || []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </SelectInput>
        </Field>
      ) : (
        <input type="hidden" name="branch" value="" />
      )}
      {error ? (
        <div className="error-banner" role="alert">
          <strong>{error}</strong>
        </div>
      ) : null}
    </Dialog>
  );
}

function EditUserDialog({ user, roles, onClose }: { user: UserRow; roles: RoleOption[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [role, setRole] = useState(user.role);
  const branches = useQuery({
    queryKey: ['branches', 'user-form'],
    queryFn: () => listResource<BranchRow>('/branches/?ordering=name'),
  });
  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch(`/users/${user.id}/`, payload),
    onSuccess: async () => {
      showToast('User profile updated');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });

  const needsBranch = ['BRANCH_USER', 'BRANCH_MANAGER'].includes(role);

  return (
    <Dialog
      kicker="USER MANAGEMENT"
      title={`Edit ${user.full_name || user.username}`}
      description="Update user credentials and role assignments. Username cannot be modified."
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const value = (name: string) =>
          (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
        const payload: Record<string, unknown> = {
          full_name: value('full_name'),
          email: value('email'),
          phone: value('phone'),
          role: value('role'),
          branch: needsBranch ? (value('branch') ? Number(value('branch')) : null) : null,
          is_active: user.is_active,
        };
        if (value('password')) payload.password = value('password');
        update.mutate(payload);
      }}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      <Field label="Full Name" required>
        <TextInput name="full_name" required defaultValue={user.full_name || ''} />
      </Field>
      <FormGrid>
        <Field label="Email Address" required>
          <TextInput name="email" type="email" required defaultValue={user.email || ''} />
        </Field>
        <Field label="Phone Number">
          <TextInput name="phone" defaultValue={user.phone || ''} />
        </Field>
      </FormGrid>
      <Field label="Assigned Role" required>
        <SelectInput name="role" value={role} onChange={(event) => setRole(event.target.value)} required>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </SelectInput>
      </Field>
      <div className="readonly-card" style={{ marginTop: 4, marginBottom: 12 }}>
        <span>Role Permissions & Scope</span>
        <div style={{ marginTop: 4, marginBottom: 6 }}>
          <RoleBadge role={role} />
        </div>
        <small>{roleDescription(role)}</small>
      </div>
      {needsBranch ? (
        <Field label="Assigned Branch" required>
          <SelectInput name="branch" defaultValue={user.branch || ''} required>
            <option value="">Select branch</option>
            {(branches.data || []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </SelectInput>
        </Field>
      ) : null}
      <Field label="New Password" hint="Leave blank to keep current password unchanged">
        <TextInput name="password" type="password" minLength={8} autoComplete="new-password" placeholder="••••••••" />
      </Field>
      {error ? (
        <div className="error-banner" role="alert">
          <strong>{error}</strong>
        </div>
      ) : null}
    </Dialog>
  );
}
