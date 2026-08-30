import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { canManageUsers, hasPermission, roleLabel, useAuth } from '../context/AuthContext';
import { FIXED_DISTRICT_NAME } from '../lib/navigation';
import { api } from '../lib/api';
import { extractError, listResource } from '../lib/utils';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { StatusBadge } from '../components/ui/StatusBadge';
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

const ROLES = [
  'DISTRICT_ADMIN',
  'OPERATIONS_OFFICER',
  'MAINTENANCE_SUPERVISOR',
  'TECHNICIAN',
  'BRANCH_MANAGER',
  'BRANCH_USER',
  'AUDITOR',
];

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => listResource<UserRow>('/users/'),
  });

  const toggleActive = useMutation({
    mutationFn: (user: UserRow) => api.patch(`/users/${user.id}/`, { is_active: !user.is_active }),
    onSuccess: async () => {
      setError('');
      showToast('User updated');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(extractError(err, 'Unable to update the user account.')),
  });

  if (users.isLoading) return <LoadingState label="Loading users..." />;
  if (users.isError) {
    return <ErrorState message="Unable to load users." onRetry={() => users.refetch()} />;
  }

  const rows = users.data || [];
  const canEdit = canManageUsers(currentUser);

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Organization</p>
          <h1>Users</h1>
          <p className="page-copy">{FIXED_DISTRICT_NAME} — assign roles for ATM operations.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" onClick={() => users.refetch()}>
            Refresh
          </button>
          {hasPermission(currentUser, 'user.create') ? (
            <button className="button primary" onClick={() => setOpen(true)}>
              + Create User
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="error-banner">
          <strong>{error}</strong>
        </div>
      ) : null}

      <div className="kpi-grid compact">
        <article className="metric-card"><span>Total Users</span><strong>{rows.length}</strong></article>
        <article className="metric-card success"><span>Active</span><strong>{rows.filter((user) => user.is_active).length}</strong></article>
        <article className="metric-card"><span>Technicians</span><strong>{rows.filter((user) => user.role === 'TECHNICIAN').length}</strong></article>
        <article className="metric-card"><span>Branch Users</span><strong>{rows.filter((user) => ['BRANCH_USER', 'BRANCH_MANAGER'].includes(user.role)).length}</strong></article>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No users" description="Create users for Yeka District operations." />
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
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.full_name || user.username}</strong>
                    <small>{user.email}</small>
                  </td>
                  <td>{roleLabel(user.role)}</td>
                  <td>{user.branch_name || 'District-wide'}</td>
                  <td>{FIXED_DISTRICT_NAME}</td>
                  <td>
                    <StatusBadge value={user.is_active ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td>
                    {canEdit && currentUser?.id !== user.id ? (
                      <button
                        className="button secondary small"
                        disabled={toggleActive.isPending}
                        onClick={() => toggleActive.mutate(user)}
                      >
                        {user.is_active ? 'Disable' : 'Enable'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? <CreateUserDialog onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
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
      showToast('User created for Yeka District');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });

  const needsBranch = ['BRANCH_USER', 'BRANCH_MANAGER'].includes(role);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form
        className="dialog-panel"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
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
      >
        <div className="dialog-header">
          <h2>Create User</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="helper-text">District is fixed: {FIXED_DISTRICT_NAME}</p>
        <label>
          Full Name *
          <input name="full_name" required />
        </label>
        <div className="form-grid">
          <label>
            Username *
            <input name="username" required />
          </label>
          <label>
            Email *
            <input name="email" type="email" required />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Phone
            <input name="phone" />
          </label>
          <label>
            Password *
            <input name="password" type="password" required minLength={8} />
          </label>
        </div>
        <label>
          Role *
          <select name="role" value={role} onChange={(event) => setRole(event.target.value)} required>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel(value)}
              </option>
            ))}
          </select>
        </label>
        {needsBranch ? (
          <label>
            Branch *
            <select name="branch" required>
              <option value="">Select branch</option>
              {(branches.data || []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="branch" value="" />
        )}
        {error ? (
          <div className="error-banner">
            <strong>{error}</strong>
          </div>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  );
}
