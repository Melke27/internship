import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { CheckCircle2, Circle } from 'lucide-react';

import { api } from '../lib/api';
import { hasPermission, useAuth } from '../context/AuthContext';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import type { Incident, TroubleshootingAction } from '../types/api';

const CHECKLIST = [
  { key: 'IDENTIFY', label: 'Identify problem', match: [] as string[] },
  { key: 'PHYSICAL_INSPECTION', label: 'Physical inspection', match: ['PHYSICAL_INSPECTION'] },
  { key: 'CHECK_POWER', label: 'Check power', match: ['CHECK_POWER'] },
  { key: 'CHECK_CONNECTION', label: 'Check permitted connections', match: ['CHECK_CONNECTION', 'CHECK_NETWORK'] },
  { key: 'CHECK_COMMUNICATION', label: 'Check communication', match: ['CHECK_COMMUNICATION'] },
  { key: 'CHECK_HARDWARE', label: 'Check relevant hardware', match: ['CHECK_HARDWARE', 'CHECK_DISPLAY', 'CHECK_CARD_READER', 'CHECK_CASH_DISPENSER', 'CHECK_RECEIPT_PRINTER'] },
  { key: 'PERFORM_AUTHORIZED_ACTION', label: 'Perform authorized action', match: ['PERFORM_AUTHORIZED_ACTION', 'RECORD_ERROR'] },
  { key: 'RETEST_ATM', label: 'Retest ATM', match: ['RETEST_ATM'] },
  { key: 'VERIFY_SERVICE', label: 'Verify service', match: ['VERIFY_SERVICE'] },
];

const ACTION_TYPES = [
  'CHECK_STATUS',
  'CHECK_ATM_STATUS',
  'PHYSICAL_INSPECTION',
  'CHECK_POWER',
  'CHECK_CONNECTION',
  'CHECK_NETWORK',
  'CHECK_COMMUNICATION',
  'CHECK_HARDWARE',
  'CHECK_DISPLAY',
  'CHECK_CARD_READER',
  'CHECK_CASH_DISPENSER',
  'CHECK_RECEIPT_PRINTER',
  'CHECK_SOFTWARE_ERROR',
  'RECORD_OBSERVATION',
  'RECORD_ERROR',
  'AUTHORIZED_TROUBLESHOOTING',
  'PERFORM_AUTHORIZED_ACTION',
  'RETEST_ATM',
  'VERIFY_SERVICE',
];

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

export default function TroubleshootingPage() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showActionForm, setShowActionForm] = useState(false);
  const [formError, setFormError] = useState('');

  const incidents = useQuery({
    queryKey: ['troubleshooting-incidents'],
    queryFn: () => list<Incident>('/incidents/?ordering=-created_at'),
  });

  const rows = useMemo(
    () =>
      (incidents.data || []).filter((incident) =>
        ['ASSIGNED', 'INVESTIGATING', 'TROUBLESHOOTING', 'WAITING', 'ESCALATED', 'RESOLVED'].includes(incident.status),
      ),
    [incidents.data],
  );

  const selected = useMemo(
    () => rows.find((incident) => incident.id === selectedId) || rows[0] || null,
    [rows, selectedId],
  );

  const detail = useQuery({
    queryKey: ['incident', selected?.id],
    queryFn: () => api.get<Incident>(`/incidents/${selected!.id}/`).then((response) => response.data),
    enabled: Boolean(selected?.id),
  });

  const actions = detail.data?.actions || [];
  const completedTypes = new Set(actions.map((action) => action.action_type));

  const saveAction = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post(`/incidents/${selected!.id}/troubleshooting/`, payload).then((response) => response.data),
    onSuccess: async () => {
      showToast('Action recorded');
      setShowActionForm(false);
      setFormError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['incident', selected?.id] }),
        queryClient.invalidateQueries({ queryKey: ['troubleshooting-incidents'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
    },
    onError: (error) => setFormError(extractError(error, 'Unable to save technical action.')),
  });

  if (incidents.isLoading) return <LoadingState label="Loading troubleshooting queue..." />;
  if (incidents.isError) return <ErrorState message="Unable to load troubleshooting queue." />;

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Operations</p>
          <h1>Troubleshooting</h1>
          <p className="page-copy">
            Structured technical work for ATM investigation, authorized actions, retest, and service verification.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No troubleshooting work"
            description="There are no incidents currently in investigation, troubleshooting, or retest flow."
          />
        </div>
      ) : (
        <div className="content-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Work Queue</h2>
                <p>Select an incident to follow the structured checklist.</p>
              </div>
            </div>
            <div className="list-stack">
              {rows.map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  className={`list-card button-card ${selected?.id === incident.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedId(incident.id);
                    setShowActionForm(false);
                  }}
                >
                  <div>
                    <strong>{incident.incident_id}</strong>
                    <small>{incident.atm_reference} · {incident.category}</small>
                    <small>{incident.assigned_to_name || 'Unassigned'}</small>
                  </div>
                  <div className="badge-group">
                    <PriorityBadge value={incident.priority} />
                    <StatusBadge value={incident.status} />
                  </div>
                </button>
              ))}
            </div>
          </article>

          <article className="panel">
            {!selected ? (
              <EmptyState title="Select an incident" description="Choose an incident from the queue to begin troubleshooting." />
            ) : detail.isLoading ? (
              <LoadingState label="Loading incident troubleshooting..." />
            ) : detail.isError || !detail.data ? (
              <ErrorState message="Unable to load incident detail." />
            ) : (
              <>
                <div className="panel-header">
                  <div>
                    <h2>Troubleshooting · {detail.data.incident_id}</h2>
                    <p>{detail.data.atm_reference} · {detail.data.title}</p>
                  </div>
                  <Link className="text-link" to={`/incidents/${detail.data.id}`}>Open incident</Link>
                </div>

                <div className="checklist">
                  {CHECKLIST.map((step, index) => {
                    const done =
                      step.key === 'IDENTIFY' ||
                      step.match.some((type) => completedTypes.has(type));
                    return (
                      <div className={`checklist-item ${done ? 'done' : ''}`} key={step.key}>
                        {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                        <div>
                          <strong>{index + 1}. {step.label}</strong>
                          <small>{done ? 'Completed' : 'Pending'}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {hasPermission(currentUser, 'troubleshooting.create') &&
                ['ASSIGNED', 'INVESTIGATING', 'TROUBLESHOOTING', 'WAITING', 'ESCALATED'].includes(detail.data.status) ? (
                  <div className="page-actions" style={{ marginTop: 16 }}>
                    <button className="button primary" onClick={() => setShowActionForm((value) => !value)}>
                      {showActionForm ? 'Hide Action Form' : 'Record Technical Action'}
                    </button>
                    <Link className="button secondary" to={`/incidents/${detail.data.id}`}>
                      Retest / Escalate / Resolve
                    </Link>
                  </div>
                ) : null}

                {showActionForm ? (
                  <ActionForm
                    error={formError}
                    pending={saveAction.isPending}
                    onCancel={() => setShowActionForm(false)}
                    onSubmit={(payload) => saveAction.mutate(payload)}
                  />
                ) : null}

                <h3 className="section-title">Action Timeline</h3>
                {actions.length === 0 ? (
                  <EmptyState title="No actions recorded yet" description="Record authorized technical actions with observed results." />
                ) : (
                  <div className="timeline">
                    {actions.map((action: TroubleshootingAction) => (
                      <div className="timeline-item" key={action.id}>
                        <div className="timeline-dot" />
                        <div>
                          <strong>{action.action_type.replaceAll('_', ' ')}</strong>
                          <small>{action.technician_name || 'Technician'} · {new Date(action.created_at).toLocaleString()}</small>
                          <small>{action.observation || action.action}</small>
                          <small>Result: {action.result || 'Not recorded'}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </article>
        </div>
      )}
    </section>
  );
}

function ActionForm({
  error,
  pending,
  onCancel,
  onSubmit,
}: {
  error: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const value = (name: string) =>
          (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)?.value;
        const actionType = value('action_type');
        onSubmit({
          action_type: actionType,
          action: actionType.replaceAll('_', ' '),
          observation: value('observation'),
          result: value('result'),
          remarks: value('remarks'),
        });
      }}
    >
      <h3>Record Technical Action</h3>
      <label>
        Technical Action *
        <select name="action_type" required>
          {ACTION_TYPES.map((value) => (
            <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
          ))}
        </select>
      </label>
      <label>
        Observation *
        <textarea name="observation" rows={3} required placeholder="What was observed during this check?" />
      </label>
      <label>
        Result *
        <select name="result" required>
          <option value="Normal">Normal</option>
          <option value="Problem Found">Problem Found</option>
        </select>
      </label>
      <label>
        Remarks
        <textarea name="remarks" rows={2} />
      </label>
      {error ? <div className="error-banner"><strong>{error}</strong></div> : null}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
        <button className="button primary" disabled={pending}>{pending ? 'Saving...' : 'Save Action'}</button>
      </div>
    </form>
  );
}
