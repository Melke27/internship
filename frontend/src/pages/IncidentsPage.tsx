import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { api } from '../lib/api';
import { useDebounce } from '../lib/useDebounce';
import { hasPermission, useAuth } from '../context/AuthContext';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
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
    <div className="dialog-backdrop" onClick={onClose}>
      <form
        className="dialog-panel"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
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
      >
        <div className="dialog-header">
          <h2>Create ATM Incident</h2>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        <label>
          ATM *
          <select name="atm" value={atmId} onChange={(event) => setAtmId(event.target.value)} required>
            <option value="">Select ATM</option>
            {(atms.data || []).map((atm) => (
              <option key={atm.id} value={atm.id}>{atm.reference} · {atm.branch_name}</option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Category *
            <select name="category" required>
              {['NETWORK / COMMUNICATION', 'POWER', 'HARDWARE', 'DISPLAY', 'CARD READER', 'CASH DISPENSER', 'RECEIPT PRINTER', 'GENERAL ATM ERROR', 'OTHER TECHNICAL ISSUE'].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Priority *
            <select name="priority" required>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
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
        <label>
          Incident title *
          <input name="title" required placeholder="Brief technical summary" />
        </label>
        <label>
          Error Message
          <input name="error_message" placeholder="Optional backend or terminal error message" />
        </label>
        <label>
          Service Impact
          <textarea name="service_impact" rows={2} placeholder="Describe ATM availability or service impact" />
        </label>
        <label>
          Problem Description *
          <textarea name="description" rows={4} required placeholder="Describe the actual ATM problem" />
        </label>
{technicians.data && technicians.data.length > 0 ? (
            <label>
              Assignable Technicians
              <small>Optional — pick a technician or auto-assign later.</small>
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
            </label>
          ) : null}
        {duplicate ? (
          <div className="error-banner">
            <strong>{selectedATM?.reference} already has an active incident.</strong>
            <small>{duplicate.incident_number} · {duplicate.title} · {duplicate.priority} · {duplicate.status}</small>
            <Link className="text-link" to={`/incidents/${duplicate.id}`}>Open Existing Incident</Link>
          </div>
        ) : null}
        {error ? <div className="error-banner"><strong>{error}</strong></div> : null}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={createIncident.isPending}>{createIncident.isPending ? 'Creating...' : 'Create Incident'}</button>
        </div>
      </form>
    </div>
  );
}

export default function IncidentsPage() {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  // Debounce the search so we don't fire a request on every keystroke
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

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Operations</p>
          <h1>Incidents</h1>
          <p className="page-copy">Create, assign, investigate, retest, resolve, verify and close ATM incidents from one workflow.</p>
        </div>
        <div className="page-actions">
          <input className="field-input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search ATM, incident, error..." />
          <select className="field-input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {['REPORTED', 'ACKNOWLEDGED', 'ASSIGNED', 'INVESTIGATING', 'TROUBLESHOOTING', 'WAITING', 'ESCALATED', 'RESOLVED', 'VERIFIED', 'CLOSED'].map((value) => (
              <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
            ))}
          </select>
          <select className="field-input" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="">All priorities</option>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <button className="button secondary" onClick={() => incidents.refetch()}>Refresh</button>
          {hasPermission(currentUser, 'incident.create') ? (
            <button className="button primary" onClick={() => setSearchParams((params) => { params.set('new', '1'); return params; })}>Create Incident</button>
          ) : null}
        </div>
      </div>
      <div className="kpi-grid compact">
        <article className="metric-card"><span>Open Incidents</span><strong>{openRows.length}</strong></article>
        <article className="metric-card danger"><span>Critical Open</span><strong>{openRows.filter((incident) => incident.priority === 'CRITICAL').length}</strong></article>
        <article className="metric-card warning"><span>High Open</span><strong>{openRows.filter((incident) => incident.priority === 'HIGH').length}</strong></article>
        <article className="metric-card"><span>Unassigned</span><strong>{openRows.filter((incident) => !incident.assigned_to_name).length}</strong></article>
        <article className="metric-card success"><span>Resolved / Closed</span><strong>{closedRows.length}</strong></article>
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
        {!incidents.isLoading && !incidents.isError && (incidents.data || []).length === 0 ? (
          <EmptyState title="No incidents" description="No incidents match the selected filters." />
        ) : null}
        {!incidents.isLoading && !incidents.isError && (incidents.data || []).length > 0 ? (
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
                </tr>
              </thead>
              <tbody>
                {(incidents.data || []).map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <Link to={`/incidents/${incident.id}`}><strong>{incident.incident_id}</strong></Link>
                      <small>{incident.title}</small>
                    </td>
                    <td><Link className="text-link" to={`/atms/${incident.atm}`}>{incident.atm_reference}</Link></td>
                    <td>{incident.branch_name}</td>
                    <td><PriorityBadge value={incident.priority} /></td>
                    <td><StatusBadge value={incident.status} /></td>
                    <td>{incident.assigned_to_name || 'Unassigned'}</td>
                    <td>{new Date(incident.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {openNew ? <CreateIncidentDialog initialAtmId={atmId} onClose={() => setSearchParams({})} /> : null}
    </section>
  );
}
