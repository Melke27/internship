import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, Wrench } from 'lucide-react';

import { hasPermission, isTechnicianUser, useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { extractError, listResource } from '../lib/utils';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog, Dialog, Field, FormGrid, SelectInput, TextArea } from '../components/ui/form';
import { MetricCard } from '../components/ui/MetricCard';
import { Panel } from '../components/ui/Panel';
import { BarList, DonutChart, TrendChart } from '../components/ui/Charts';
import type { ATM, DashboardSummary, Maintenance, User } from '../types/api';

const NEXT: Record<string, Array<{ status: string; label: string; needsTest?: boolean; needsConfirm?: boolean }>> = {
  REQUESTED: [{ status: 'APPROVED', label: 'Approve' }],
  APPROVED: [
    { status: 'SCHEDULED', label: 'Schedule' },
    { status: 'ASSIGNED', label: 'Mark Assigned' },
  ],
  SCHEDULED: [{ status: 'ASSIGNED', label: 'Assign' }, { status: 'IN_PROGRESS', label: 'Start' }],
  ASSIGNED: [{ status: 'IN_PROGRESS', label: 'Start Job' }],
  STARTED: [{ status: 'IN_PROGRESS', label: 'Continue' }],
  IN_PROGRESS: [
    { status: 'UNDER_REPAIR', label: 'Under Repair' },
    { status: 'TESTING', label: 'Start Testing' },
  ],
  ON_HOLD: [{ status: 'IN_PROGRESS', label: 'Resume' }],
  UNDER_REPAIR: [{ status: 'TESTING', label: 'Test ATM' }],
  TESTING: [
    { status: 'COMPLETED', label: 'Complete (Passed)', needsTest: true },
    { status: 'UNDER_REPAIR', label: 'Test Failed' },
  ],
  COMPLETED: [{ status: 'VERIFIED', label: 'Verify', needsConfirm: true }],
};

function CreateMaintenanceDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const atms = useQuery({ queryKey: ['maintenance-atms'], queryFn: () => listResource<ATM>('/atms/?ordering=reference') });
  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/maintenance/', payload).then((r) => r.data),
    onSuccess: async () => {
      showToast('Maintenance request created');
      await queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onClose();
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });

  return (
    <Dialog
      title="Create Maintenance"
      description="Request ATM maintenance work for the district team."
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const value = (name: string) =>
          (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)?.value;
        create.mutate({
          atm: Number(value('atm')),
          maintenance_type: value('maintenance_type'),
          priority: value('priority'),
          reason: value('reason'),
          remarks: value('remarks'),
          status: 'REQUESTED',
        });
      }}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create Request'}
          </button>
        </>
      }
    >
      <Field label="ATM" required>
        <SelectInput name="atm" required>
          <option value="">Select ATM</option>
          {(atms.data || []).map((atm) => (
            <option key={atm.id} value={atm.id}>
              {atm.reference} · {atm.branch_name}
            </option>
          ))}
        </SelectInput>
      </Field>
      <FormGrid cols={2}>
        <Field label="Type" required>
          <SelectInput name="maintenance_type" required>
            {['PREVENTIVE', 'CORRECTIVE', 'EMERGENCY', 'INSPECTION', 'NETWORK', 'HARDWARE', 'SOFTWARE'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Priority" required>
          <SelectInput name="priority" defaultValue="MEDIUM" required>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectInput>
        </Field>
      </FormGrid>
      <Field label="Reason" required hint="Describe why maintenance is required on this ATM">
        <TextArea name="reason" rows={3} required placeholder="e.g. Repeated cash dispenser jams" />
      </Field>
      <Field label="Remarks" hint="Optional — extra instructions for the technician">
        <TextArea name="remarks" rows={2} placeholder="Optional notes for the assigned technician" />
      </Field>
      {error ? (
        <div className="error-banner">
          <strong>{error}</strong>
        </div>
      ) : null}
    </Dialog>
  );
}

function CompleteJobDialog({ job, onClose }: { job: Maintenance; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [result, setResult] = useState('PASSED');
  const complete = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api
        .post(`/maintenance/${job.id}/status/`, { status: 'COMPLETED', ...payload })
        .then((r) => r.data),
    onSuccess: async () => {
      showToast('Maintenance job completed');
      await queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['atms'] });
      onClose();
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });

  return (
    <Dialog
      title="Complete Maintenance"
      description={`${job.maintenance_id || `MJ-${job.id}`} · ${job.atm_reference} — record the result of this job before closing it.`}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const value = (name: string) =>
          (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value ?? '';
        complete.mutate({
          test_result: result,
          work_performed: value('work_performed'),
          result: value('result'),
          remarks: value('remarks'),
        });
      }}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={complete.isPending}>
            {complete.isPending ? 'Saving…' : 'Complete Job'}
          </button>
        </>
      }
    >
      <Field label="Test Result" required hint="Was the ATM restored to full service after testing?">
        <SelectInput name="test_result" value={result} onChange={(event) => setResult(event.target.value)} required>
          <option value="PASSED">PASSED — ATM is fully operational</option>
          <option value="PARTIAL">PARTIAL — service restored with known limitations</option>
        </SelectInput>
      </Field>
      <Field label="Work Performed" required hint="Summarise the repair work you carried out">
        <TextArea name="work_performed" rows={3} required placeholder="e.g. Replaced cash dispenser half-plate, ran test withdrawals OK." />
      </Field>
      <Field label="Result / Outcome" hint="Optional — outcome notes for the record">
        <TextArea name="result" rows={2} placeholder="e.g. ATM returned to operational status." />
      </Field>
      <Field label="Remarks" hint="Optional — additional remarks">
        <TextArea name="remarks" rows={2} placeholder="Optional notes" />
      </Field>
      {error ? (
        <div className="error-banner">
          <strong>{error}</strong>
        </div>
      ) : null}
    </Dialog>
  );
}

function AssignDialog({ job, onClose }: { job: Maintenance; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const technicians = useQuery({
    queryKey: ['technicians'],
    queryFn: () => listResource<User>('/users/technicians/'),
  });
  const assign = useMutation({
    mutationFn: (technician: number) => api.post(`/maintenance/${job.id}/assign/`, { technician }),
    onSuccess: async () => {
      showToast('Maintenance assigned');
      await queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      onClose();
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });

  return (
    <Dialog
      title="Assign Maintenance"
      description={`${job.maintenance_id || `MJ-${job.id}`} · ${job.atm_reference}`}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const technician = Number((event.currentTarget.elements.namedItem('technician') as HTMLSelectElement).value);
        assign.mutate(technician);
      }}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={assign.isPending}>
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </button>
        </>
      }
    >
      <Field label="Technician" required hint="Assign a technician to take ownership of this job">
        <SelectInput name="technician" required>
          <option value="">Select technician</option>
          {(technicians.data || []).map((tech) => (
            <option key={tech.id} value={tech.id}>
              {tech.full_name || tech.username}
            </option>
          ))}
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

export default function MaintenancePage() {
  const { currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [assignJob, setAssignJob] = useState<Maintenance | null>(null);
  const [completeJob, setCompleteJob] = useState<Maintenance | null>(null);
  const [actionError, setActionError] = useState('');
  const [confirm, setConfirm] = useState<null | {
    record: Maintenance;
    status: string;
    title: string;
    message: string;
    test_result?: string;
    confirmed?: boolean;
  }>(null);
  const queryClient = useQueryClient();

  const statusFilter = params.get('status') || '';
  const typeFilter = params.get('type') || '';
  const mine = params.get('mine') === '1';
  const tab = params.get('tab') || '';
  const focusedId = params.get('id');

  const isTechnician = isTechnicianUser(currentUser);
  const FILTERS = [
    ...(isTechnician ? [{ label: 'My Jobs', key: 'mine' }] : []),
    { label: 'All', key: '' },
    { label: 'Requests', key: 'requests' },
    { label: 'Assigned', key: 'assigned' },
    { label: 'Active', key: 'active' },
    { label: 'Completed', key: 'completed' },
  ];
  const activeChip = mine ? 'mine' : tab === 'requests' ? 'requests' : tab === 'assigned' ? 'assigned' : tab === 'active' ? 'active' : statusFilter === 'COMPLETED' ? 'completed' : '';

  function applyFilter(key: string) {
    const next = new URLSearchParams();
    if (key === 'mine') next.set('mine', '1');
    else if (key === 'requests') next.set('tab', 'requests');
    else if (key === 'assigned') next.set('tab', 'assigned');
    else if (key === 'active') next.set('tab', 'active');
    else if (key === 'completed') next.set('status', 'COMPLETED');
    setParams(next);
  }

  const maintenance = useQuery({
    queryKey: ['maintenance', statusFilter, typeFilter, mine, tab, focusedId],
    queryFn: () => {
      const query = new URLSearchParams();
      query.set('ordering', '-created_at');
      if (focusedId) query.set('id', focusedId);
      if (statusFilter) query.set('status', statusFilter);
      if (typeFilter) query.set('maintenance_type', typeFilter);
      if (mine) query.set('mine', '1');
      if (tab === 'requests') query.set('status', statusFilter || 'REQUESTED');
      if (tab === 'assigned') query.set('status', 'ASSIGNED');
      if (tab === 'active') {
        /* client filter below */
      }
      return listResource<Maintenance>(`/maintenance/?${query.toString()}`);
    },
  });

  const rows = useMemo(() => {
    let data = maintenance.data || [];
    if (tab === 'active') {
      data = data.filter((row) =>
        ['IN_PROGRESS', 'UNDER_REPAIR', 'TESTING', 'ON_HOLD'].includes(row.status),
      );
    }
    if (tab === 'jobs') {
      data = data.filter((row) =>
        !['REQUESTED', 'CANCELLED'].includes(row.status),
      );
    }
    return data;
  }, [maintenance.data, tab]);

  const updateStatus = useMutation({
    mutationFn: ({
      id,
      status,
      confirmed,
      test_result,
    }: {
      id: number;
      status: string;
      confirmed?: boolean;
      test_result?: string;
    }) =>
      api
        .post(`/maintenance/${id}/status/`, {
          status,
          confirmed_operational: confirmed,
          test_result,
        })
        .then((r) => r.data),
    onSuccess: async () => {
      showToast('Maintenance updated');
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['atms'] });
    },
    onError: (err) => setActionError(extractError(err, 'Action could not be completed.')),
  });

  return (
    <section className="page-content">
      <div className="portal-hero">
        <div>
          <p className="page-kicker">Maintenance</p>
          <h1>Maintenance Jobs</h1>
          <p className="page-copy">Manage ATM maintenance requests, repair jobs, testing and verification.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" onClick={() => maintenance.refetch()}>
            Refresh
          </button>
          {hasPermission(currentUser, 'maintenance.create') ? (
            <button className="button primary" onClick={() => setOpen(true)}>
              Create Maintenance
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <div className="error-banner">
          <strong>{actionError}</strong>
        </div>
      ) : null}

      <div className="filter-chips" aria-label="Maintenance filters">
        {FILTERS.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`chip ${activeChip === item.key ? 'active' : ''}`}
            onClick={() => applyFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {focusedId ? (
        <div className="editable-banner" style={{ marginBottom: 12 }}>
          <span>Showing maintenance job opened from the operations dashboard.</span>
          <button className="button secondary small" onClick={() => setParams(new URLSearchParams())}>
            Show all jobs
          </button>
        </div>
      ) : null}

      <div className="panel">
        {maintenance.isLoading ? <LoadingState label="Loading maintenance records..." /> : null}
        {maintenance.isError ? (
          <ErrorState message="Unable to load ATM information." onRetry={() => maintenance.refetch()} />
        ) : null}
        {!maintenance.isLoading && !maintenance.isError && rows.length === 0 ? (
          <EmptyState title="No maintenance jobs" description="No maintenance records match the current filters." />
        ) : null}
        {!maintenance.isLoading && !maintenance.isError && rows.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>ATM</th>
                  <th>Branch</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Technician</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((record) => {
                  const actions = NEXT[record.status] || [];
                  const isFocused = focusedId && String(record.id) === focusedId;
                  return (
                    <tr key={record.id} className={isFocused ? 'table-row-focused' : undefined}>
                      <td>
                        <strong>{record.maintenance_id || `MJ-${record.id}`}</strong>
                      </td>
                      <td>
                        <Link to={`/atms/${record.atm}`}>
                          <strong>{record.atm_reference}</strong>
                        </Link>
                      </td>
                      <td>{record.branch_name}</td>
                      <td>{record.maintenance_type}</td>
                      <td>{record.priority ? <PriorityBadge value={record.priority} /> : '—'}</td>
                      <td>
                        <StatusBadge value={record.status} />
                      </td>
                      <td>{record.technician_name || 'Unassigned'}</td>
                      <td>{new Date(record.created_at).toLocaleString()}</td>
                      <td>
                        <div className="row-actions">
                          {hasPermission(currentUser, 'maintenance.assign') &&
                          ['REQUESTED', 'APPROVED', 'SCHEDULED', 'ASSIGNED'].includes(record.status) ? (
                            <button className="button secondary small" onClick={() => setAssignJob(record)}>
                              Assign
                            </button>
                          ) : null}
                          {hasPermission(currentUser, 'maintenance.update')
                            ? actions.map((action) => (
                                <button
                                  key={action.status}
                                  className="button secondary small"
                                  disabled={updateStatus.isPending}
                                  onClick={() => {
                                    if (action.status === 'COMPLETED' && action.needsTest) {
                                      setCompleteJob(record);
                                      return;
                                    }
                                    if (action.needsTest) {
                                      setConfirm({
                                        record,
                                        status: action.status,
                                        title: action.label,
                                        message: 'Confirm the ATM test PASSED before completing this maintenance job?',
                                        test_result: 'PASSED',
                                      });
                                      return;
                                    }
                                    if (action.status === 'UNDER_REPAIR' && record.status === 'TESTING') {
                                      setConfirm({
                                        record,
                                        status: action.status,
                                        title: action.label,
                                        message: 'The ATM failed testing and will be sent back under repair.',
                                        test_result: 'FAILED',
                                      });
                                      return;
                                    }
                                    if (action.needsConfirm) {
                                      setConfirm({
                                        record,
                                        status: action.status,
                                        title: action.label,
                                        message: 'Confirm the ATM is back to operational after successful testing?',
                                        confirmed: true,
                                      });
                                      return;
                                    }
                                    updateStatus.mutate({
                                      id: record.id,
                                      status: action.status,
                                    });
                                  }}
                                >
                                  {action.label}
                                </button>
                              ))
                            : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {open ? <CreateMaintenanceDialog onClose={() => setOpen(false)} /> : null}
      {assignJob ? <AssignDialog job={assignJob} onClose={() => setAssignJob(null)} /> : null}
      {completeJob ? <CompleteJobDialog job={completeJob} onClose={() => setCompleteJob(null)} /> : null}
      {confirm ? (
        <ConfirmDialog
          open
          title={`${confirm.title}?`}
          description={confirm.message}
          confirmLabel={confirm.title}
          confirming={updateStatus.isPending}
          onConfirm={() => {
            updateStatus.mutate({
              id: confirm.record.id,
              status: confirm.status,
              confirmed: confirm.confirmed,
              test_result: confirm.test_result,
            });
            setConfirm(null);
          }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </section>
  );
}

export function MaintenanceOpsPage() {
  const summary = useQuery({
    queryKey: ['dashboard-summary', 'maintenance-ops'],
    queryFn: () => api.get<DashboardSummary & { maintenance_kpis?: Record<string, number> }>('/reports/dashboard/').then((r) => r.data),
  });
  const jobs = useQuery({
    queryKey: ['maintenance', 'ops-home'],
    queryFn: () => listResource<Maintenance>('/maintenance/?ordering=-created_at'),
  });

  const refetchDashboard = () => {
    summary.refetch();
    jobs.refetch();
  };

  const byType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const job of jobs.data || []) counts[job.maintenance_type] = (counts[job.maintenance_type] || 0) + 1;
    const order = ['PREVENTIVE', 'CORRECTIVE', 'EMERGENCY', 'INSPECTION', 'NETWORK', 'HARDWARE', 'SOFTWARE'];
    const colors: Record<string, string> = {
      PREVENTIVE: '#16a34a',
      CORRECTIVE: '#3b4fd8',
      EMERGENCY: '#dc2626',
      INSPECTION: '#2563eb',
      NETWORK: '#0ea5e9',
      HARDWARE: '#7c3aed',
      SOFTWARE: '#0891b2',
    };
    return order.filter((t) => counts[t]).map((t) => ({ label: t, value: counts[t], color: colors[t] }));
  }, [jobs.data]);

  if (summary.isLoading || jobs.isLoading) return <LoadingState label="Loading maintenance operations..." />;
  if (summary.isError || jobs.isError || !summary.data) {
    return <ErrorState message="Unable to load maintenance operations. Please try again." onRetry={refetchDashboard} />;
  }

  const kpis = summary.data.maintenance_kpis || {
    total: summary.data.maintenance_count,
    pending: 0,
    assigned: 0,
    in_progress: 0,
    under_repair: summary.data.under_repair || 0,
    testing: 0,
    completed: 0,
    overdue: 0,
    emergency: 0,
  };
  const all = jobs.data || [];
  const emergency = all.filter((j) => j.maintenance_type === 'EMERGENCY' && !['VERIFIED', 'CANCELLED'].includes(j.status));
  const active = all.filter((j) => ['IN_PROGRESS', 'UNDER_REPAIR', 'TESTING'].includes(j.status));
  const pending = all.filter((j) => ['REQUESTED', 'APPROVED', 'SCHEDULED'].includes(j.status));
  const underRepair = all.filter((j) => j.status === 'UNDER_REPAIR');
  const testing = all.filter((j) => j.status === 'TESTING');
  const completed = all.filter((j) => ['COMPLETED', 'VERIFIED'].includes(j.status)).slice(0, 6);

  const pipelineSegments = [
    { label: 'Pending', value: kpis.pending, color: '#eab308' },
    { label: 'Assigned', value: kpis.assigned, color: '#3b4fd8' },
    { label: 'In progress', value: kpis.in_progress, color: '#2563eb' },
    { label: 'Under repair', value: kpis.under_repair, color: '#7c3aed' },
    { label: 'Testing', value: kpis.testing, color: '#0ea5e9' },
    { label: 'Completed', value: kpis.completed, color: '#16a34a' },
  ].filter((s) => s.value > 0);
  const pipelineTotal = pipelineSegments.reduce((a, s) => a + s.value, 0);
  const trend = summary.data.trends?.maintenance || [];
  const openStatuses = ['REQUESTED', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'UNDER_REPAIR', 'TESTING'];
  const mainWorkload = useMemo(() => {
    const byTech = new Map<string, { active: number; completed: number }>();
    for (const j of all) {
      const name = j.technician_name || 'Unassigned';
      const entry = byTech.get(name) || { active: 0, completed: 0 };
      if (openStatuses.includes(j.status)) entry.active += 1;
      else if (['COMPLETED', 'VERIFIED'].includes(j.status)) entry.completed += 1;
      byTech.set(name, entry);
    }
    return Array.from(byTech.entries()).map(([name, counts]) => ({ name, ...counts }));
  }, [all]);
  const today = new Date();
  const overdue = all.filter(
    (j) =>
      j.scheduled_date &&
      new Date(j.scheduled_date) < today &&
      !['COMPLETED', 'VERIFIED', 'CANCELLED'].includes(j.status),
  );

  return (
    <section className="page-content">
      <div className="portal-hero">
        <div>
          <p className="page-kicker">Maintenance Operations</p>
          <h1>{summary.data.district_name}</h1>
          <p className="page-copy">Manage ATM maintenance, repair jobs and technical service restoration.</p>
          <span className="helper-text">
            {kpis.overdue > 0
              ? `${kpis.overdue} jobs overdue · ${kpis.emergency} emergency queues`
              : `${kpis.emergency} emergency queue · All scheduled work on track`}
          </span>
        </div>
        <div className="page-actions">
          <span className={`health-pill ${kpis.overdue > 0 ? 'danger' : 'ok'}`}>
            <CircleAlert size={13} /> {kpis.overdue} overdue
          </span>
          <Link className="button primary" to="/maintenance">Open Jobs</Link>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-8" aria-label="Maintenance summary">
        <MetricCard label="Total" value={kpis.total} to="/maintenance" icon={<ClipboardList size={18} />} hint="all-time jobs" />
        <MetricCard label="Pending" value={kpis.pending} to="/maintenance?tab=requests" tone="warning" icon={<CalendarClock size={18} />} hint="awaiting approval" />
        <MetricCard label="Assigned" value={kpis.assigned} to="/maintenance?status=ASSIGNED" icon={<Wrench size={18} />} hint="allocated to team" />
        <MetricCard label="In progress" value={kpis.in_progress} to="/maintenance?status=IN_PROGRESS" icon={<Activity size={18} />} hint="being worked" />
        <MetricCard label="Under repair" value={kpis.under_repair} to="/maintenance?status=UNDER_REPAIR" tone="danger" icon={<CircleAlert size={18} />} hint="ATMs in service bay" />
        <MetricCard label="Testing" value={kpis.testing} to="/maintenance?status=TESTING" icon={<Wrench size={18} />} hint="verification phase" />
        <MetricCard label="Completed" value={kpis.completed} to="/maintenance?status=COMPLETED" tone="success" icon={<CheckCircle2 size={18} />} hint="verified restorations" />
        <MetricCard label="Overdue" value={kpis.overdue} tone="danger" icon={<AlertTriangle size={18} />} hint="past schedule date" />
      </div>

      <div className="dashboard-charts-row">
        <Panel title="Jobs by Type" subtitle="Work distribution across maintenance categories.">
          {byType.length === 0 ? (
            <EmptyState title="No maintenance jobs" description="Type distribution appears once jobs are created." />
          ) : (
            <BarList rows={byType} />
          )}
        </Panel>

        <Panel title="Live Pipeline" subtitle="Active work flowing through the maintenance stages.">
          {pipelineTotal === 0 ? (
            <EmptyState title="Pipeline empty" description="No active maintenance work in the pipeline." />
          ) : (
            <div className="donut-wrap">
              <DonutChart
                segments={pipelineSegments}
                size={150}
                centerValue={`${kpis.in_progress + kpis.under_repair + kpis.testing}`}
                centerLabel="in work"
              />
              <div className="chart-legend">
                {pipelineSegments.slice(0, 6).map((s) => (
                  <div className="legend-row" key={s.label}>
                    <i style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <b>{s.value}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel
          className="panel-wide"
          title="14-Day Maintenance Activity"
          subtitle="Maintenance requests created vs completed over the last two weeks."
        >
          <div className="trend-duo">
            <TrendChart
              series={trend.map((d) => ({ date: d.date, label: d.label, value: d.created }))}
              color="#3b4fd8"
            />
            <TrendChart
              series={trend.map((d) => ({ date: d.date, label: d.label, value: d.completed }))}
              color="#16a34a"
            />
          </div>
        </Panel>
      </div>

      <div className="maintenance-dashboard-grid">
        <JobSection title="Emergency Maintenance" rows={emergency} empty="No emergency maintenance" />
        <JobSection title="My Active Jobs" rows={active} empty="No active maintenance jobs" />
        <JobSection title="Pending Requests" rows={pending} empty="No pending maintenance requests" />

        {(mainWorkload.some((t) => t.active > 0)) ? (
          <Panel title="Team Workload" subtitle="Current maintenance jobs per technician.">
            <BarList
              rows={mainWorkload.slice(0, 6).map((t) => ({
                label: t.name,
                value: t.active,
                color: t.active > 5 ? '#dc2626' : '#3b4fd8',
              }))}
            />
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
              Active jobs now; {mainWorkload.reduce((a, t) => a + t.completed, 0)} completed by the team.
            </p>
          </Panel>
        ) : null}

        <JobSection title="Under Repair" rows={underRepair} empty="No ATMs under repair" />
        <JobSection title="Testing" rows={testing} empty="No jobs in testing" />

        <Panel title="Overdue Jobs" subtitle="Past their scheduled date and still open.">
          {overdue.length === 0 ? (
            <EmptyState title="Nothing overdue" description="All scheduled work is on track." />
          ) : (
            <div className="list-stack">
              {overdue.slice(0, 6).map((job) => (
                <div className="list-card" key={job.id}>
                  <div>
                    <strong>{job.maintenance_id || `MJ-${job.id}`}</strong>
                    <small>
                      {job.atm_reference} · {job.scheduled_date ? `due ${new Date(job.scheduled_date).toLocaleDateString()}` : 'due date not set'}
                    </small>
                  </div>
                  <div className="badge-group">
                    <StatusBadge value={job.status} />
                    <Link className="button secondary small" to={`/maintenance?id=${job.id}`}>Open Job</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <JobSection title="Recent Completed Work" rows={completed} empty="No completed maintenance yet" />
      </div>
    </section>
  );
}

function JobSection({ title, rows, empty }: { title: string; rows: Maintenance[]; empty: string }) {
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <EmptyState title={empty} description="" />
      ) : (
        <div className="list-stack">
          {rows.slice(0, 6).map((job) => (
            <div className="list-card" key={job.id}>
              <div>
                <strong>{job.maintenance_id || `MJ-${job.id}`}</strong>
                <small>
                  {job.atm_reference} · {job.branch_name} · {job.maintenance_type}
                </small>
                <small>{job.technician_name || 'Unassigned'}</small>
              </div>
              <div className="badge-group">
                {job.priority ? <PriorityBadge value={job.priority} /> : null}
                <StatusBadge value={job.status} />
                <Link className="button secondary small" to={`/maintenance?id=${job.id}`}>
                  Open Job
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
