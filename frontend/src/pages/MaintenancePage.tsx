import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { api } from '../lib/api';
import { hasPermission, useAuth } from '../context/AuthContext';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { StatusBadge } from '../components/ui/StatusBadge';
import type { ATM, Maintenance } from '../types/api';

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

function extractError(error: unknown, fallback: string) {
  if (isAxiosError(error) && error.response?.data) {
    const data = error.response.data as Record<string, unknown>;
    if (typeof data.detail === 'string') return data.detail;
    return Object.values(data).flat().join(' ') || fallback;
  }
  return fallback;
}

function CreateMaintenanceDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const atms = useQuery({ queryKey: ['maintenance-atms'], queryFn: () => list<ATM>('/atms/?ordering=reference') });
  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/maintenance/', payload).then((response) => response.data),
    onSuccess: async () => {
      showToast('Maintenance scheduled');
      await queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onClose();
    },
    onError: (mutationError) => setError(extractError(mutationError, 'Unable to schedule maintenance.')),
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
            (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)?.value;
          create.mutate({
            atm: Number(value('atm')),
            maintenance_type: value('maintenance_type'),
            reason: value('reason'),
            remarks: value('remarks'),
            status: 'SCHEDULED',
          });
        }}
      >
        <div className="dialog-header">
          <h2>Schedule Maintenance</h2>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        <label>
          ATM *
          <select name="atm" required>
            <option value="">Select ATM</option>
            {(atms.data || []).map((atm) => (
              <option key={atm.id} value={atm.id}>{atm.reference} · {atm.branch_name}</option>
            ))}
          </select>
        </label>
        <label>
          Maintenance Type *
          <select name="maintenance_type" required>
            {['PREVENTIVE', 'CORRECTIVE', 'EMERGENCY', 'INSPECTION', 'NETWORK', 'HARDWARE'].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>Reason *<textarea name="reason" rows={3} required /></label>
        <label>Remarks<textarea name="remarks" rows={2} /></label>
        {error ? <div className="error-banner"><strong>{error}</strong></div> : null}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={create.isPending}>
            {create.isPending ? 'Saving...' : 'Schedule Maintenance'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function MaintenancePage() {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const queryClient = useQueryClient();
  const maintenance = useQuery({
    queryKey: ['maintenance', statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('ordering', '-created_at');
      return list<Maintenance>(`/maintenance/?${params.toString()}`);
    },
  });
  const updateStatus = useMutation({
    mutationFn: ({ id, status, confirmed }: { id: number; status: string; confirmed?: boolean }) =>
      api.post(`/maintenance/${id}/status/`, { status, confirmed_operational: confirmed }).then((response) => response.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['atms'] });
    },
  });

  const nextStatus: Record<string, string | null> = {
    SCHEDULED: 'STARTED',
    STARTED: 'IN_PROGRESS',
    IN_PROGRESS: 'COMPLETED',
    COMPLETED: 'VERIFIED',
  };

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Operations</p>
          <h1>Maintenance</h1>
          <p className="page-copy">Schedule, track, complete and verify ATM maintenance work across the district.</p>
        </div>
        <div className="page-actions">
          <select className="field-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            {['SCHEDULED', 'STARTED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED'].map((value) => (
              <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
            ))}
          </select>
          <button className="button secondary" onClick={() => maintenance.refetch()}>Refresh</button>
          {hasPermission(currentUser, 'maintenance.create') ? (
            <button className="button primary" onClick={() => setOpen(true)}>Schedule Maintenance</button>
          ) : null}
        </div>
      </div>

      <div className="panel">
        {maintenance.isLoading ? <LoadingState label="Loading maintenance records..." /> : null}
        {maintenance.isError ? <ErrorState message="Unable to load maintenance data." /> : null}
        {!maintenance.isLoading && !maintenance.isError && (maintenance.data || []).length === 0 ? (
          <EmptyState title="No maintenance scheduled" description="No maintenance records match the current filters." />
        ) : null}
        {!maintenance.isLoading && !maintenance.isError && (maintenance.data || []).length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ATM</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Technician</th>
                  <th>Reason</th>
                  <th>Start</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(maintenance.data || []).map((record) => {
                  const next = nextStatus[record.status];
                  return (
                    <tr key={record.id}>
                      <td>
                        <Link to={`/atms/${record.atm}`}><strong>{record.atm_reference}</strong></Link>
                        <small>{record.branch_name}</small>
                      </td>
                      <td>{record.maintenance_type}</td>
                      <td><StatusBadge value={record.status} /></td>
                      <td>{record.technician_name || '—'}</td>
                      <td>{record.reason}</td>
                      <td>{record.start_date ? new Date(record.start_date).toLocaleString() : '—'}</td>
                      <td>
                        {next && hasPermission(currentUser, 'maintenance.update') ? (
                          <button
                            className="button secondary small"
                            disabled={updateStatus.isPending}
                            onClick={() => {
                              const confirmed = next === 'VERIFIED'
                                ? window.confirm('Confirm the ATM is operational after maintenance?')
                                : undefined;
                              if (next === 'VERIFIED' && !confirmed) return;
                              updateStatus.mutate({ id: record.id, status: next, confirmed: confirmed || false });
                            }}
                          >
                            {next === 'STARTED' ? 'Start' : next === 'IN_PROGRESS' ? 'Mark In Progress' : next === 'COMPLETED' ? 'Complete' : 'Verify'}
                          </button>
                        ) : '—'}
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
    </section>
  );
}
