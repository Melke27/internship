import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { canManageUsers, hasPermission, roleLabel, useAuth } from '../context/AuthContext';
import { FIXED_DISTRICT_NAME } from '../lib/navigation';
import { api } from '../lib/api';
import { extractError, listResource } from '../lib/utils';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { StatusBadge } from '../components/ui/StatusBadge';
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
  const [editing, setEditing] = useState<UserRow | null>(null);
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
                      <div className="table-actions" style={{ display: 'flex', gap: 6 }}>
                        <button className="button secondary small" onClick={() => setEditing(user)}>
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
        </div>
      )}

      {open ? <CreateUserDialog onClose={() => setOpen(false)} /> : null}
      {editing ? <EditUserDialog user={editing} onClose={() => setEditing(null)} /> : null}
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
    <Dialog
      title="Create User"
      description={`Create an account for ${FIXED_DISTRICT_NAME} operations.`}
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
      <Field label="Full Name" required hint={`District is fixed: ${FIXED_DISTRICT_NAME}`}>
        <TextInput name="full_name" required placeholder="e.g. Abebe Kebede" />
      </Field>
      <FormGrid>
        <Field label="Username" required>
          <TextInput name="username" required placeholder="e.g. abebe.k" />
        </Field>
        <Field label="Email" required>
          <TextInput name="email" type="email" required placeholder="user@example.com" />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Phone">
          <TextInput name="phone" type="tel" placeholder="+251 9..." />
        </Field>
        <Field label="Temporary Password" required hint="Min 8 characters — user will be asked to change it later">
          <TextInput name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
        </Field>
      </FormGrid>
      <Field label="Role" required hint="The role controls which portal and actions this user can access">
        <SelectInput name="role" value={role} onChange={(event) => setRole(event.target.value)} required>
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {roleLabel(value)}
            </option>
          ))}
        </SelectInput>
      </Field>
      {needsBranch ? (
        <Field label="Branch" required hint="Required for branch-level roles">
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
        <div className="error-banner">
          <strong>{error}</strong>
        </div>
      ) : null}
    </Dialog>
  );
}

function EditUserDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
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
      showToast('User updated');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });

  const needsBranch = ['BRANCH_USER', 'BRANCH_MANAGER'].includes(role);

  return (
    <Dialog
      title={`Edit ${user.full_name || user.username}`}
      description="Update profile details. Username is fixed; leave the password blank to keep it unchanged."
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
      <Field label="Full Name" required hint={`District is fixed: ${FIXED_DISTRICT_NAME}`}>
        <TextInput name="full_name" required defaultValue={user.full_name || ''} />
      </Field>
      <FormGrid>
        <Field label="Email" required>
          <TextInput name="email" type="email" required defaultValue={user.email || ''} />
        </Field>
        <Field label="Phone">
          <TextInput name="phone" defaultValue={user.phone || ''} />
        </Field>
      </FormGrid>
      <Field label="Role" required>
        <SelectInput name="role" value={role} onChange={(event) => setRole(event.target.value)} required>
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {roleLabel(value)}
            </option>
          ))}
        </SelectInput>
      </Field>
      {needsBranch ? (
        <Field label="Branch" required>
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
      <Field label="New Password" hint="Leave blank to keep the current password">
        <TextInput name="password" type="password" minLength={8} autoComplete="new-password" placeholder="••••••••" />
      </Field>
      {error ? (
        <div className="error-banner">
          <strong>{error}</strong>
        </div>
      ) : null}
    </Dialog>
  );
}
