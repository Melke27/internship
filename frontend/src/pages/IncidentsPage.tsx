import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AlertTriangle, CheckCircle2, Filter, Search, ShieldAlert, Users } from 'lucide-react';

import { api } from '../lib/api';
import { useDebounce } from '../lib/useDebounce';
import { hasPermission, useAuth } from '../context/AuthContext';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';
import { Dialog, Field, FormGrid, SelectInput, TextArea, TextInput } from '../components/ui/form';
import type { ATM, Incident, User } from '../types/api';

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) => Array.isArray(response.data) ? response.data : response.data.results);
}

function extractError(error: unknown, fallback: string) {
  if (isAxiosError(error) && error.response?.data) {
    const data = error.response.data as Record<string, unknown>;
    if (typeof data.detail === 'string') return data.detail;
    return Object.values(data).flat().join(' ') || fallback;
  }
  return fallback;
}

function CreateIncidentDialog({ initialAtmId, onClose }: { initialAtmId?: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState<{ id: number; incident_number: string; title: string; priority: string; status: string } | null>(null);
  const atms = useQuery({ queryKey: ['incident-atms'], queryFn: () => list<ATM>('/atms/?ordering=reference') });
  const technicians = useQuery({ queryKey: ['incident-technicians'], queryFn: () => list<User>('/users/technicians/'), retry: false });
  const [atmId, setAtmId] = useState(initialAtmId || '');
  const selectedATM = useMemo(() => (atms.data || []).find((atm) => String(atm.id) === String(atmId)), [atms.data, atmId]);
  const createIncident = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/incidents/', payload).then((response) => response.data),
    onSuccess: async () => {
      showToast('Incident created');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['incidents'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['atms'] }),
      ]);
      onClose();
    },
    onError: (mutationError) => {
      if (isAxiosError(mutationError)) {
        const payload = mutationError.response?.data as { existing_incident?: { id: number; incident_number: string; title: string; priority: string; status: string } } | undefined;
        if (payload?.existing_incident) setDuplicate(payload.existing_incident);
      }
      setError(extractError(mutationError, 'Unable to create incident. The incident was not saved.'));
    },
  });

  return (
    <Dialog
      title="Create ATM Incident"
      description="Report an ATM problem and assign it for resolution."
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)?.value;
        setError('');
        setDuplicate(null);
        createIncident.mutate({
          atm: Number(value('atm')),
          category: value('category'),
          priority: value('priority'),
          title: value('title'),
          error_message: value('error_message'),
          description: value('description'),
          service_impact: value('service_impact'),
          assigned_to: value('assigned_to') ? Number(value('assigned_to')) : undefined,
        });
      }}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={createIncident.isPending}>{createIncident.isPending ? 'Creating…' : 'Create Incident'}</button>
        </>
      }
    >
      <Field label="ATM" required>
        <SelectInput name="atm" value={atmId} onChange={(event) => setAtmId(event.target.value)} required>
          <option value="">Select ATM</option>
          {(atms.data || []).map((atm) => (
            <option key={atm.id} value={atm.id}>{atm.reference} · {atm.branch_name}</option>
          ))}
        </SelectInput>
      </Field>
      <div className="readonly-card">
        <span>Current ATM Status</span>
        <div>{selectedATM ? <StatusBadge value={selectedATM.status} /> : <em className="empty-inline">Select an ATM to view status</em>}</div>
        {selectedATM ? (
          <div className="badge-group">
            <StatusBadge value={selectedATM.network_status} />
            <StatusBadge value={selectedATM.hardware_status} />
          </div>
        ) : null}
      </div>
      <FormGrid cols={2}>
        <Field label="Category" required>
          <SelectInput name="category" required>
            {['NETWORK / COMMUNICATION', 'POWER', 'HARDWARE', 'DISPLAY', 'CARD READER', 'CASH DISPENSER', 'RECEIPT PRINTER', 'GENERAL ATM ERROR', 'OTHER TECHNICAL ISSUE'].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Priority" required>
          <SelectInput name="priority" required>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value}</option>)}
          </SelectInput>
        </Field>
      </FormGrid>
      <Field label="Incident Title" required>
        <TextInput name="title" required placeholder="Brief technical summary" />
      </Field>
      <Field label="Error Message" hint="Optional backend or terminal error message">
        <TextInput name="error_message" placeholder="e.g. Cash dispenser jammed — error 04" />
      </Field>
      <Field label="Service Impact" hint="Describe ATM availability or service impact">
        <TextArea name="service_impact" rows={2} placeholder="Describe ATM availability or service impact" />
      </Field>
      <Field label="Problem Description" required>
        <TextArea name="description" rows={4} required placeholder="Describe the actual ATM problem" />
      </Field>
      {technicians.data && technicians.data.length > 0 ? (
        <Field label="Assignable Technicians" hint="Optional — pick a technician or auto-assign later.">
          <div className="technician-picker">
            <label className="tech-option">
              <input type="radio" name="assigned_to" value="" defaultChecked />
              <span className="tech-avatar">±</span>
              <strong>Auto-assign later<small>Leave unassigned for now</small></strong>
              <span className="check-mark">✓</span>
            </label>
            {technicians.data.map((tech) => (
              <label key={tech.id} className="tech-option">
                <input type="radio" name="assigned_to" value={tech.id} />
                <span className="tech-avatar">{(tech.full_name || tech.username).slice(0, 2).toUpperCase()}</span>
                <strong>{tech.full_name || tech.username}<small>{tech.username}</small></strong>
                <span className="check-mark">✓</span>
              </label>
            ))}
          </div>
        </Field>
      ) : null}
      {duplicate ? (
        <div className="error-banner" role="alert">
          <strong>{selectedATM?.reference} already has an active incident.</strong>
          <small>{duplicate.incident_number} · {duplicate.title} · {duplicate.priority} · {duplicate.status}</small>
          <Link className="text-link" to={`/incidents/${duplicate.id}`}>Open Existing Incident</Link>
        </div>
      ) : null}
      {error ? <div className="error-banner" role="alert"><strong>{error}</strong></div> : null}
    </Dialog>
  );
}

const STATUS_OPTIONS = ['REPORTED', 'ACKNOWLEDGED', 'ASSIGNED', 'INVESTIGATING', 'TROUBLESHOOTING', 'WAITING', 'ESCALATED', 'RESOLVED', 'VERIFIED', 'CLOSED'];
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function priorityRowClass(priority: string) {
  switch (priority) {
    case 'CRITICAL': return 'row-priority-critical';
    case 'HIGH': return 'row-priority-high';
    case 'MEDIUM': return 'row-priority-medium';
    case 'LOW': return 'row-priority-low';
    default: return '';
  }
}

export default function IncidentsPage() {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const search = useDebounce(searchInput, 400);
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [priority, setPriority] = useState(searchParams.get('priority') || '');
  const openNew = searchParams.get('new') === '1';
  const atmId = searchParams.get('atm');

  const incidents = useQuery({
    queryKey: ['incidents', search, status, priority],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      params.set('ordering', '-created_at');
      return list<Incident>(`/incidents/?${params.toString()}`);
    },
  });

  const rows = useMemo(() => incidents.data || [], [incidents.data]);
  const openRows = rows.filter((incident) => incident.status !== 'CLOSED');
  const closedRows = rows.filter((incident) => ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(incident.status));
  const criticalOpen = openRows.filter((i) => i.priority === 'CRITICAL').length;
  const highOpen = openRows.filter((i) => i.priority === 'HIGH').length;
  const unassigned = openRows.filter((i) => !i.assigned_to_name).length;

  const hasFilters = Boolean(search || status || priority);

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Operations</p>
          <h1>Incidents</h1>
          <p className="page-copy">Create, assign, investigate, retest, resolve, verify and close ATM incidents from one workflow.</p>
        </div>
        <div className="page-actions">
          {hasPermission(currentUser, 'incident.create') ? (
            <button type="button" className="button primary" onClick={() => setSearchParams((params) => { params.set('new', '1'); return params; })}>
              <AlertTriangle size={14} /> Create Incident
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI summary row */}
      <div className="kpi-grid compact" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', marginBottom: 20 }}>
        <MetricCard label="Open Incidents" value={openRows.length} icon={<AlertTriangle size={18} />} hint="currently active" tone="warning" />
        <MetricCard label="Critical Open" value={criticalOpen} icon={<ShieldAlert size={18} />} hint="need immediate action" tone="danger" />
        <MetricCard label="High Open" value={highOpen} icon={<AlertTriangle size={18} />} hint="elevated priority" tone={highOpen > 0 ? 'warning' : 'default'} />
        <MetricCard label="Unassigned" value={unassigned} icon={<Users size={18} />} hint="no technician yet" tone={unassigned > 0 ? 'warning' : 'default'} />
        <MetricCard label="Resolved / Closed" value={closedRows.length} icon={<CheckCircle2 size={18} />} hint="incidents closed" tone="success" />
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="page-search-bar" style={{ flex: 1, minWidth: 220, margin: 0 }}>
          <Search size={15} aria-hidden />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search ATM, incident ID, error message..."
            aria-label="Search ATM, incident ID, error message"
          />
        </div>
        <select
          className="field-input"
          style={{ width: 180 }}
          value={status}
          aria-label="Filter by status"
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
          ))}
        </select>
        <select
          className="field-input"
          style={{ width: 160 }}
          value={priority}
          aria-label="Filter by priority"
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        {hasFilters && (
          <button
            type="button"
            className="button secondary small"
            onClick={() => { setSearchInput(''); setStatus(''); setPriority(''); }}
          >
            Clear filters
          </button>
        )}
        <button type="button" className="button secondary" onClick={() => incidents.refetch()}>
          <Filter size={14} /> Refresh
        </button>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Incident Register</h2>
            <p>Showing {rows.length} incidents — {openRows.length} still open.</p>
          </div>
        </div>
        {incidents.isLoading ? <LoadingState label="Loading incidents..." /> : null}
        {incidents.isError ? <ErrorState message="Unable to load incident data. Please try again." /> : null}
        {!incidents.isLoading && !incidents.isError && rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No incidents match your filters' : 'No incidents'}
            description={hasFilters ? 'Try adjusting the search or filter criteria above.' : 'Incidents will appear here once ATM problems are reported.'}
          />
        ) : null}
        {!incidents.isLoading && !incidents.isError && rows.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>ATM</th>
                  <th>Branch</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned Technician</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((incident) => (
                  <tr key={incident.id} className={priorityRowClass(incident.priority)}>
                    <td>
                      <Link to={`/incidents/${incident.id}`}><strong>{incident.incident_id}</strong></Link>
                      <small>{incident.title}</small>
                    </td>
                    <td><Link className="text-link" to={`/atms/${incident.atm}`}>{incident.atm_reference}</Link></td>
                    <td>{incident.branch_name}</td>
                    <td><PriorityBadge value={incident.priority} /></td>
                    <td><StatusBadge value={incident.status} /></td>
                    <td>
                      {incident.assigned_to_name ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                            {(incident.assigned_to_name || '').trim().slice(0, 2).toUpperCase()}
                          </span>
                          {incident.assigned_to_name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Unassigned</span>
                      )}
                    </td>
                    <td>{new Date(incident.created_at).toLocaleString()}</td>
                    <td>
                      <Link className="button secondary small" to={`/incidents/${incident.id}`}>
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {openNew ? (
        <CreateIncidentDialog
          initialAtmId={atmId}
          onClose={() =>
            setSearchParams((params) => {
              params.delete('new');
              params.delete('atm');
              return params;
            })
          }
        />
      ) : null}
    </section>
  );
}
