import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { hasPermission, useAuth } from '../context/AuthContext';
import { FIXED_DISTRICT_NAME } from '../lib/navigation';
import { extractError, listResource } from '../lib/utils';
import { api } from '../lib/api';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { StatusBadge } from '../components/ui/StatusBadge';

export interface BranchRow {
  id: number;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  status: string;
  district_name?: string;
  atm_count?: number;
  operational_count?: number;
  fault_count?: number;
  critical_count?: number;
  maintenance_count?: number;
}

export default function BranchesPage() {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => listResource<BranchRow>('/branches/?ordering=name'),
  });

  if (branches.isLoading) return <LoadingState label="Loading branches..." />;
  if (branches.isError) {
    return <ErrorState message="Unable to load branch information." onRetry={() => branches.refetch()} />;
  }

  const rows = branches.data || [];

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Organization</p>
          <h1>Branches</h1>
          <p className="page-copy">{FIXED_DISTRICT_NAME} — manage branches and ATM coverage.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" onClick={() => branches.refetch()}>
            Refresh
          </button>
          {hasPermission(currentUser, 'branch.create') ? (
            <button className="button primary" onClick={() => setOpen(true)}>
              + Create Branch
            </button>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No branches yet" description="Create the first branch for Yeka District." />
      ) : (
        <div className="table-wrap panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Code</th>
                <th>ATMs</th>
                <th>Operational</th>
                <th>Faults</th>
                <th>Critical</th>
                <th>Maintenance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((branch) => (
                <tr key={branch.id}>
                  <td>
                    <Link to={`/branches/${branch.id}`}>
                      <strong>{branch.name}</strong>
                    </Link>
                    <small>{FIXED_DISTRICT_NAME}</small>
                  </td>
                  <td>{branch.code}</td>
                  <td>{branch.atm_count ?? 0}</td>
                  <td>{branch.operational_count ?? 0}</td>
                  <td>{branch.fault_count ?? 0}</td>
                  <td>{branch.critical_count ?? 0}</td>
                  <td>{branch.maintenance_count ?? 0}</td>
                  <td>
                    <StatusBadge value={branch.status} />
                  </td>
                  <td>
                    <Link className="button secondary small" to={`/branches/${branch.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? <CreateBranchDialog onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function CreateBranchDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/branches/', payload),
    onSuccess: async (response) => {
      showToast('Branch created for Yeka District');
      await queryClient.invalidateQueries({ queryKey: ['branches'] });
      onClose();
      navigate(`/branches/${response.data.id}`);
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });

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
            name: value('name'),
            code: value('code'),
            address: value('address'),
            phone: value('phone'),
            email: value('email'),
            status: value('status'),
          });
        }}
      >
        <div className="dialog-header">
          <h2>Create Branch</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="helper-text">District is fixed: {FIXED_DISTRICT_NAME}</p>
        <label>
          Branch Name *
          <input name="name" required />
        </label>
        <label>
          Branch Code *
          <input name="code" required />
        </label>
        <label>
          Address
          <input name="address" />
        </label>
        <div className="form-grid">
          <label>
            Phone
            <input name="phone" />
          </label>
          <label>
            Email
            <input name="email" type="email" />
          </label>
        </div>
        <label>
          Status
          <select name="status" defaultValue="ACTIVE">
            <option value="ACTIVE">ACTIVE</option>
            <option value="SETUP">SETUP</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </label>
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
            {create.isPending ? 'Creating…' : 'Create Branch'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function BranchDetailPage() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [error, setError] = useState('');

  const branch = useQuery({
    queryKey: ['branch', id],
    queryFn: () => api.get<BranchRow>(`/branches/${id}/`).then((r) => r.data),
    enabled: Boolean(id),
  });
  const summary = useQuery({
    queryKey: ['branch-summary', id],
    queryFn: () =>
      api
        .get<{
          total_atms: number;
          operational: number;
          faults: number;
          critical: number;
          maintenance: number;
        }>(`/branches/${id}/summary/`)
        .then((r) => r.data),
    enabled: Boolean(id),
  });

  const deactivate = useMutation({
    mutationFn: (reason: string) => api.post(`/branches/${id}/deactivate/`, { reason }),
    onSuccess: async () => {
      showToast('Branch deactivated');
      setDeactivateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['branch', id] });
      await queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });

  if (branch.isLoading) return <LoadingState label="Loading branch..." />;
  if (branch.isError || !branch.data) {
    return <ErrorState message="Unable to load branch information." onRetry={() => branch.refetch()} />;
  }

  const data = branch.data;
  const stats = summary.data;

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">{FIXED_DISTRICT_NAME}</p>
          <h1>{data.name}</h1>
          <p className="page-copy">
            {data.code} · {FIXED_DISTRICT_NAME}
          </p>
        </div>
        <div className="page-actions">
          <StatusBadge value={data.status} />
          {hasPermission(currentUser, 'atm.create') ? (
            <Link className="button primary" to={`/atms?register=1&branch=${data.id}`}>
              Register ATM
            </Link>
          ) : null}
          {hasPermission(currentUser, 'branch.deactivate') && data.status !== 'INACTIVE' ? (
            <button className="button danger-outline" onClick={() => setDeactivateOpen(true)}>
              Deactivate
            </button>
          ) : null}
        </div>
      </div>

      <div className="kpi-grid">
        <article className="metric-card">
          <span>TOTAL ATMs</span>
          <strong>{stats?.total_atms ?? data.atm_count ?? 0}</strong>
        </article>
        <article className="metric-card success">
          <span>OPERATIONAL</span>
          <strong>{stats?.operational ?? data.operational_count ?? 0}</strong>
        </article>
        <article className="metric-card warning">
          <span>FAULTS</span>
          <strong>{stats?.faults ?? data.fault_count ?? 0}</strong>
        </article>
        <article className="metric-card danger">
          <span>CRITICAL</span>
          <strong>{stats?.critical ?? data.critical_count ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>MAINTENANCE</span>
          <strong>{stats?.maintenance ?? data.maintenance_count ?? 0}</strong>
        </article>
      </div>

      <article className="panel">
        <h2>Branch Information</h2>
        <div className="detail-grid">
          <div>
            <span>Address</span>
            <strong>{data.address || '—'}</strong>
          </div>
          <div>
            <span>Phone</span>
            <strong>{data.phone || '—'}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{data.email || '—'}</strong>
          </div>
          <div>
            <span>District</span>
            <strong>{FIXED_DISTRICT_NAME}</strong>
          </div>
        </div>
        <div className="row-actions">
          <Link className="button secondary" to={`/atms?branch=${data.id}`}>
            View ATMs
          </Link>
          <Link className="button secondary" to={`/branch-reports?branch=${data.id}`}>
            View Reports
          </Link>
          <Link className="button secondary" to={`/incidents?branch=${data.id}`}>
            View Incidents
          </Link>
        </div>
      </article>

      {error ? (
        <div className="error-banner">
          <strong>{error}</strong>
        </div>
      ) : null}

      {deactivateOpen ? (
        <div className="dialog-backdrop" onClick={() => setDeactivateOpen(false)}>
          <form
            className="dialog-panel"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const reason = (event.currentTarget.elements.namedItem('reason') as HTMLTextAreaElement).value;
              deactivate.mutate(reason);
            }}
          >
            <div className="dialog-header">
              <h2>Deactivate Branch?</h2>
              <button type="button" className="icon-button" onClick={() => setDeactivateOpen(false)}>
                ×
              </button>
            </div>
            <p className="helper-text">
              {stats?.total_atms ?? 0} ATMs remain linked. Historical records will stay available.
            </p>
            <label>
              Reason *
              <textarea name="reason" rows={3} required />
            </label>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={() => setDeactivateOpen(false)}>
                Cancel
              </button>
              <button className="button primary" disabled={deactivate.isPending}>
                Deactivate
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
