import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Landmark, ShieldAlert, Wrench } from 'lucide-react';

import { hasPermission, useAuth } from '../context/AuthContext';
import { FIXED_DISTRICT_NAME } from '../lib/navigation';
import { extractError, listResource } from '../lib/utils';
import { api } from '../lib/api';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { DualStatus, StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';
import { Dialog, Field, FormGrid, SelectInput, TextArea, TextInput } from '../components/ui/form';
import ATMDialog from '../components/atms/ATMDialog';
import type { ATM } from '../types/api';

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
  const totalATMs = rows.reduce((sum, b) => sum + (b.atm_count || 0), 0);
  const totalOperational = rows.reduce((sum, b) => sum + (b.operational_count || 0), 0);
  const totalFaults = rows.reduce((sum, b) => sum + (b.fault_count || 0), 0);

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

      {/* District KPI summary */}
      <div className="kpi-grid compact" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', marginBottom: 20 }}>
        <MetricCard label="Total Branches" value={rows.length} icon={<Landmark size={18} />} hint="active in district" />
        <MetricCard label="Total ATMs" value={totalATMs} icon={<Activity size={18} />} hint="across all branches" />
        <MetricCard label="Operational ATMs" value={totalOperational} icon={<CheckCircle2 size={18} />} tone="success" hint="fully functional" />
        <MetricCard label="Branch Faults" value={totalFaults} icon={<AlertTriangle size={18} />} tone={totalFaults > 0 ? 'warning' : 'default'} hint="reported issues" />
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
                  <td><strong>{branch.code}</strong></td>
                  <td>{branch.atm_count ?? 0}</td>
                  <td>
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                      {branch.operational_count ?? 0}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: branch.fault_count ? 'var(--warning)' : 'inherit' }}>
                      {branch.fault_count ?? 0}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: branch.critical_count ? 'var(--danger)' : 'inherit', fontWeight: branch.critical_count ? 700 : 400 }}>
                      {branch.critical_count ?? 0}
                    </span>
                  </td>
                  <td>{branch.maintenance_count ?? 0}</td>
                  <td>
                    <StatusBadge value={branch.status} />
                  </td>
                  <td>
                    <Link className="button secondary small" to={`/branches/${branch.id}`}>
                      View Branch
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
      showToast('Branch created for Yeka District', 'success');
      await queryClient.invalidateQueries({ queryKey: ['branches'] });
      onClose();
      navigate(`/branches/${response.data.id}`);
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });

  return (
    <Dialog
      title="Create Branch"
      description="Create a new branch and configure its contact information."
      onClose={onClose}
      onSubmit={(event) => {
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
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create Branch'}
          </button>
        </>
      }
    >
      <FormGrid>
        <Field label="Branch Name" required hint="Full branch name as shown in the district">
          <TextInput name="name" required placeholder="e.g. Saris Branch" />
        </Field>
        <Field label="Branch Code" required hint="Short unique code, e.g. SRS">
          <TextInput name="code" required placeholder="e.g. SRS" />
        </Field>
      </FormGrid>
      <Field label="Address">
        <TextInput name="address" placeholder="Street or building address" />
      </Field>
      <FormGrid>
        <Field label="Phone">
          <TextInput name="phone" type="tel" placeholder="+251 11 ..." />
        </Field>
        <Field label="Email">
          <TextInput name="email" type="email" placeholder="branch@example.com" />
        </Field>
      </FormGrid>
      <Field label="Status" hint={FIXED_DISTRICT_NAME} required>
        <SelectInput name="status" defaultValue="ACTIVE">
          <option value="ACTIVE">Active</option>
          <option value="SETUP">Setup</option>
          <option value="INACTIVE">Inactive</option>
        </SelectInput>
      </Field>
      {error ? (
        <div className="error-banner">
          <strong>{error}</strong>
        </div>
      ) : null}
    </Dialog>
  );
}

export function BranchDetailPage() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [registerATMOpen, setRegisterATMOpen] = useState(false);
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

  const branchATMs = useQuery({
    queryKey: ['branch-atms', id],
    queryFn: () =>
      api
        .get<ATM[] | { results: ATM[] }>(`/atms/?branch=${id}`)
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results)),
    enabled: Boolean(id),
  });

  const deactivate = useMutation({
    mutationFn: (reason: string) => api.post(`/branches/${id}/deactivate/`, { reason }),
    onSuccess: async () => {
      showToast('Branch deactivated', 'warning');
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
  const atms = branchATMs.data || [];

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">{FIXED_DISTRICT_NAME}</p>
          <h1>{data.name}</h1>
          <p className="page-copy">
            Code: <strong>{data.code}</strong> · {FIXED_DISTRICT_NAME}
          </p>
        </div>
        <div className="page-actions">
          <StatusBadge value={data.status} />
          {hasPermission(currentUser, 'atm.create') ? (
            <button className="button primary" onClick={() => setRegisterATMOpen(true)}>
              + Register ATM
            </button>
          ) : null}
          {hasPermission(currentUser, 'branch.deactivate') && data.status !== 'INACTIVE' ? (
            <button className="button danger-outline" onClick={() => setDeactivateOpen(true)}>
              Deactivate
            </button>
          ) : null}
        </div>
      </div>

      <div className="kpi-grid compact" style={{ marginBottom: 20 }}>
        <MetricCard label="Total ATMs" value={stats?.total_atms ?? data.atm_count ?? 0} icon={<Activity size={18} />} hint="linked to branch" />
        <MetricCard label="Operational" value={stats?.operational ?? data.operational_count ?? 0} icon={<CheckCircle2 size={18} />} tone="success" hint="fully functional" />
        <MetricCard label="Faults" value={stats?.faults ?? data.fault_count ?? 0} icon={<AlertTriangle size={18} />} tone={(stats?.faults ?? 0) > 0 ? 'warning' : 'default'} hint="technical faults" />
        <MetricCard label="Critical" value={stats?.critical ?? data.critical_count ?? 0} icon={<ShieldAlert size={18} />} tone={(stats?.critical ?? 0) > 0 ? 'danger' : 'default'} hint="needs urgent fix" />
        <MetricCard label="Maintenance" value={stats?.maintenance ?? data.maintenance_count ?? 0} icon={<Wrench size={18} />} hint="under service" />
      </div>

      <article className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <div>
            <h2>Branch Information</h2>
            <p>Contact and location details for {data.name}</p>
          </div>
        </div>
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
      </article>

      {/* Embedded Branch ATMs section */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>ATMs at {data.name} ({atms.length})</h2>
            <p>All registered ATMs physically located or assigned to this branch.</p>
          </div>
          {hasPermission(currentUser, 'atm.create') && (
            <button className="button secondary small" onClick={() => setRegisterATMOpen(true)}>
              + Add ATM to Branch
            </button>
          )}
        </div>
        {branchATMs.isLoading ? <LoadingState label="Loading branch ATMs..." /> : null}
        {!branchATMs.isLoading && atms.length === 0 ? (
          <EmptyState
            title="No ATMs registered at this branch"
            description="Click '+ Register ATM' above to add an ATM unit to this branch."
          />
        ) : null}
        {!branchATMs.isLoading && atms.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ATM Reference</th>
                  <th>Model / Name</th>
                  <th>Status</th>
                  <th>Health</th>
                  <th>Active Incident</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {atms.map((atm) => (
                  <tr key={atm.id}>
                    <td>
                      <Link to={`/atms/${atm.id}`}><strong>{atm.reference}</strong></Link>
                    </td>
                    <td>{atm.name || atm.model || 'ATM Unit'}</td>
                    <td><DualStatus active={atm.is_active !== false} technical={atm.status} /></td>
                    <td><StatusBadge value={atm.health} /></td>
                    <td>
                      {atm.active_incident ? (
                        <Link to={`/incidents/${atm.active_incident.id}`} style={{ color: 'var(--danger)', fontWeight: 600 }}>
                          {atm.active_incident.incident_number}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="table-actions" style={{ display: 'flex', gap: 6 }}>
                        <Link className="button secondary small" to={`/atms/${atm.id}`}>View</Link>
                        {hasPermission(currentUser, 'incident.create') && (
                          <Link className="button ghost small" to={`/incidents?atm=${atm.id}&new=1`}>+ Incident</Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="error-banner" style={{ marginTop: 14 }}>
          <strong>{error}</strong>
        </div>
      ) : null}

      {registerATMOpen ? (
        <ATMDialog
          initialBranchId={data.id}
          onClose={() => setRegisterATMOpen(false)}
        />
      ) : null}

      {deactivateOpen ? (
        <Dialog
          title="Deactivate Branch?"
          description={`${stats?.total_atms ?? data.atm_count ?? 0} ATMs remain linked. Historical records will stay available.`}
          onClose={() => setDeactivateOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            const reason = (event.currentTarget.elements.namedItem('reason') as HTMLTextAreaElement).value;
            deactivate.mutate(reason);
          }}
          footer={
            <>
              <button type="button" className="button secondary" onClick={() => setDeactivateOpen(false)}>
                Cancel
              </button>
              <button className="button primary" disabled={deactivate.isPending}>
                {deactivate.isPending ? 'Deactivating…' : 'Deactivate Branch'}
              </button>
            </>
          }
        >
          <Field label="Reason" required hint={`Enter the reason for deactivating ${data.name}.`}>
            <TextArea name="reason" rows={3} required placeholder="Why is this branch being deactivated?" />
          </Field>
        </Dialog>
      ) : null}
    </section>
  );
}
