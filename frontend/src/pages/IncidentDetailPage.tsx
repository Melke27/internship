import type { ReactNode } from 'react';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { api } from '../lib/api';
import { hasPermission, useAuth } from '../context/AuthContext';
import { showToast } from '../lib/toast';
import { ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import type { Incident, User } from '../types/api';

type DialogKind = null | 'assign' | 'action' | 'escalate' | 'resolve' | 'retest' | 'verify' | 'close';

function extractError(err: unknown, fallback: string) {
  if (isAxiosError(err) && err.response?.data) {
    const data = err.response.data as Record<string, unknown>;
    if (typeof data.detail === 'string') return data.detail;
    return Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join(' · ') || fallback;
  }
  return fallback;
}

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) => Array.isArray(response.data) ? response.data : response.data.results);
}

function WorkflowDialog({ kind, incident, onClose }: { kind: Exclude<DialogKind, null>; incident: Incident; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const technicians = useQuery({
    queryKey: ['technicians', incident.id],
    queryFn: () => list<User>('/users/technicians/'),
    enabled: kind === 'assign',
  });
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['incident', incident.id] }),
    queryClient.invalidateQueries({ queryKey: ['incident-timeline', incident.id] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
    queryClient.invalidateQueries({ queryKey: ['incidents'] }),
    queryClient.invalidateQueries({ queryKey: ['atms'] }),
  ]);
  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (kind === 'assign') return api.post(`/incidents/${incident.id}/assign/`, payload);
      if (kind === 'action') return api.post(`/incidents/${incident.id}/troubleshooting/`, payload);
      if (kind === 'escalate') return api.post(`/incidents/${incident.id}/escalate/`, payload);
      if (kind === 'resolve') return api.post(`/incidents/${incident.id}/resolve/`, payload);
      if (kind === 'retest') return api.post(`/incidents/${incident.id}/retest/`, payload);
      if (kind === 'verify') return api.post(`/incidents/${incident.id}/verify/`, payload);
      return api.post(`/incidents/${incident.id}/close/`, payload);
    },
    onSuccess: async () => {
      showToast({
        assign: 'Technician assigned',
        action: 'Action recorded',
        escalate: 'Incident escalated',
        resolve: 'Incident resolved',
        retest: 'Retest recorded',
        verify: 'Resolution verified',
        close: 'Incident closed',
      }[kind]);
      await refresh();
      onClose();
    },
    onError: (mutationError) => setError(extractError(mutationError, 'Action failed.')),
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
          const checked = (name: string) => (form.elements.namedItem(name) as HTMLInputElement)?.checked;
          if (kind === 'assign') mutation.mutate({ assigned_to: Number(value('assigned_to')) });
          if (kind === 'action') mutation.mutate({
            action_type: value('action_type'),
            action: value('action'),
            observation: value('observation'),
            result: value('result'),
            next_action: value('next_action'),
            remarks: value('remarks'),
          });
          if (kind === 'escalate') mutation.mutate({
            reason: value('reason'),
            technical_findings: value('technical_findings'),
            required_team: value('required_team'),
            assigned_team: value('assigned_team'),
            priority: value('priority'),
            remarks: value('remarks'),
          });
          if (kind === 'resolve') mutation.mutate({
            description: value('description'),
            action_performed: value('action_performed'),
            final_status: value('final_status'),
            final_result: value('final_result'),
          });
          if (kind === 'retest') mutation.mutate({
            outcome: value('outcome'),
            notes: value('notes'),
            description: value('description'),
            action_performed: value('action_performed'),
            final_status: value('final_status'),
            final_result: value('final_result'),
          });
          if (kind === 'verify') mutation.mutate({
            atm_available: checked('atm_available'),
            issue_cleared: checked('issue_cleared'),
            communication_working: checked('communication_working'),
            approved_test_completed: checked('approved_test_completed'),
            notes: value('notes'),
          });
          if (kind === 'close') mutation.mutate({});
        }}
      >
        <div className="dialog-header">
          <h2>{dialogTitle(kind)}</h2>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        {kind === 'assign' ? (
          <label>
            Assign Technician *
            <select name="assigned_to" required defaultValue="">
              <option value="" disabled>Select technician</option>
              {(technicians.data || []).map((tech) => <option key={tech.id} value={tech.id}>{tech.full_name || tech.username}</option>)}
            </select>
          </label>
        ) : null}
        {kind === 'action' ? (
          <>
            <label>
              Technical Action *
              <select name="action_type" required>
                {['CHECK_ATM_STATUS', 'PHYSICAL_INSPECTION', 'CHECK_POWER', 'CHECK_CONNECTION', 'CHECK_NETWORK', 'CHECK_COMMUNICATION', 'CHECK_HARDWARE', 'CHECK_DISPLAY', 'CHECK_CARD_READER', 'CHECK_CASH_DISPENSER', 'CHECK_RECEIPT_PRINTER', 'RECORD_ERROR', 'PERFORM_AUTHORIZED_ACTION', 'VERIFY_SERVICE'].map((value) => (
                  <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label>Action Summary *<textarea name="action" rows={2} required /></label>
            <label>Observation *<textarea name="observation" rows={3} required /></label>
            <label>Result *<textarea name="result" rows={2} required placeholder="Normal or problem found" /></label>
            <label>Next Step<textarea name="next_action" rows={2} /></label>
            <label>Remarks<textarea name="remarks" rows={2} /></label>
          </>
        ) : null}
        {kind === 'escalate' ? (
          <>
            <label>Reason *<textarea name="reason" rows={3} required /></label>
            <label>Technical Findings<textarea name="technical_findings" rows={3} /></label>
            <label>Escalate To *<input name="required_team" required placeholder="Select team or user" /></label>
            <label>Assigned Team<input name="assigned_team" placeholder="Optional assigned team" /></label>
            <label>Priority<select name="priority">{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>Remarks<textarea name="remarks" rows={2} /></label>
          </>
        ) : null}
        {kind === 'resolve' ? (
          <>
            <label>Resolution Description *<textarea name="description" rows={3} required /></label>
            <label>Authorized Action Performed *<textarea name="action_performed" rows={3} required /></label>
            <label>Final Status *<input name="final_status" required placeholder="Service restored" /></label>
            <label>Final Result *<textarea name="final_result" rows={2} required /></label>
          </>
        ) : null}
        {kind === 'retest' ? (
          <>
            <div className="readonly-card">
              <span>Current Status</span>
              <div><StatusBadge value={incident.status} /></div>
            </div>
            <label>
              Retest Result *
              <select name="outcome" required>
                <option value="PROBLEM_REMAINS">Problem remains</option>
                <option value="SERVICE_RESTORED">Service restored</option>
              </select>
            </label>
            <label>Retest Notes *<textarea name="notes" rows={3} required /></label>
            <label>Resolution Description<textarea name="description" rows={2} /></label>
            <label>Action Performed<textarea name="action_performed" rows={2} /></label>
            <label>Final Status<input name="final_status" placeholder="Operational" /></label>
            <label>Final Result<textarea name="final_result" rows={2} /></label>
          </>
        ) : null}
        {kind === 'verify' ? (
          <>
            {[
              ['atm_available', 'ATM Status Operational'],
              ['issue_cleared', 'Previous Error No Longer Present'],
              ['communication_working', 'Communication Available'],
              ['approved_test_completed', 'Functional Test Passed'],
            ].map(([name, label]) => (
              <label key={name} className="check-row"><input type="checkbox" name={name} /> {label}</label>
            ))}
            <label>Verification Notes<textarea name="notes" rows={3} /></label>
          </>
        ) : null}
        {kind === 'close' ? (
          <div className="readonly-card">
            <span>Close Incident</span>
            <small>{incident.incident_id} has been verified. This action will close the incident.</small>
          </div>
        ) : null}
        {error ? <div className="error-banner"><strong>{error}</strong></div> : null}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : submitLabel(kind)}</button>
        </div>
      </form>
    </div>
  );
}

export default function IncidentDetailPage() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [error, setError] = useState('');
  const incidentQuery = useQuery({
    queryKey: ['incident', Number(id)],
    queryFn: () => api.get<Incident>(`/incidents/${id}/`).then((response) => response.data),
    enabled: Boolean(id),
  });
  const timeline = useQuery({
    queryKey: ['incident-timeline', Number(id)],
    queryFn: () => api.get<{ time: string; type: string; actor: string; summary: string; details: string }[]>(`/incidents/${id}/timeline/`).then((response) => response.data),
    enabled: Boolean(id),
  });
  const client = useQueryClient();
  const transition = useMutation({
    mutationFn: (payload: { status: string }) => api.post(`/incidents/${id}/status/`, payload),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['incident', Number(id)] });
      client.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (transitionError) => setError(extractError(transitionError, 'Transition rejected by the server.')),
  });

  if (incidentQuery.isLoading) return <LoadingState label="Loading incident details..." />;
  if (incidentQuery.isError || !incidentQuery.data) return <ErrorState message="Incident not found or outside your authorized scope." />;

  const incident = incidentQuery.data;
  const canInvestigate = ['ACKNOWLEDGED', 'ASSIGNED', 'WAITING', 'ESCALATED'].includes(incident.status);
  const canTroubleshoot = ['INVESTIGATING', 'TROUBLESHOOTING', 'WAITING', 'ESCALATED'].includes(incident.status);

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">{incident.district_name} · {incident.branch_name} · {incident.atm_reference}</p>
          <h1>{incident.incident_id}</h1>
          <p className="page-copy">{incident.title}</p>
        </div>
        <div className="badge-group">
          <PriorityBadge value={incident.priority} />
          <StatusBadge value={incident.status} />
        </div>
      </div>

      <div className="details-grid">
        <article className="panel">
          <h2>Incident Overview</h2>
          <dl className="detail-grid">
            <Field label="ATM" value={<Link to={`/atms/${incident.atm}`}>{incident.atm_reference}</Link>} />
            <Field label="Branch" value={incident.branch_name} />
            <Field label="District" value={incident.district_name} />
            <Field label="Reported By" value={incident.reported_by_name || '—'} />
            <Field label="Assigned Technician" value={incident.assigned_to_name || 'Unassigned'} />
            <Field label="Category" value={incident.category} />
            <Field label="Priority" value={<PriorityBadge value={incident.priority} />} />
            <Field label="Status" value={<StatusBadge value={incident.status} />} />
            <Field label="Error Message" value={incident.error_message || '—'} />
            <Field label="Service Impact" value={incident.service_impact || '—'} />
            <Field label="Created At" value={new Date(incident.created_at).toLocaleString()} />
            <Field label="Resolved At" value={incident.resolved_at ? new Date(incident.resolved_at).toLocaleString() : '—'} />
          </dl>
          <div className="description-block">
            <strong>Problem Description</strong>
            <p>{incident.description}</p>
            <strong>Final Result</strong>
            <p>{incident.final_result || 'Not yet recorded.'}</p>
          </div>
        </article>

        <article className="panel">
          <h2>Workflow Actions</h2>
          <div className="action-grid">
            {hasPermission(currentUser, 'incident.assign') && incident.status === 'REPORTED' ? (
              <button className="button primary" onClick={() => transition.mutate({ status: 'ACKNOWLEDGED' })}>Acknowledge</button>
            ) : null}
            {hasPermission(currentUser, 'incident.assign') && incident.status === 'ACKNOWLEDGED' ? (
              <button className="button primary" onClick={() => setDialog('assign')}>Assign Technician</button>
            ) : null}
            {hasPermission(currentUser, 'troubleshooting.create') && canInvestigate ? (
              <button className="button secondary" onClick={() => transition.mutate({ status: 'INVESTIGATING' })}>Start Investigation</button>
            ) : null}
            {hasPermission(currentUser, 'troubleshooting.create') && canTroubleshoot ? (
              <button className="button secondary" onClick={() => setDialog('action')}>Add Technical Action</button>
            ) : null}
            {hasPermission(currentUser, 'incident.retest') && canTroubleshoot ? (
              <button className="button secondary" onClick={() => setDialog('retest')}>Retest ATM</button>
            ) : null}
            {hasPermission(currentUser, 'incident.escalate') && canTroubleshoot ? (
              <button className="button secondary" onClick={() => setDialog('escalate')}>Escalate Incident</button>
            ) : null}
            {hasPermission(currentUser, 'incident.resolve') && canTroubleshoot ? (
              <button className="button secondary" onClick={() => setDialog('resolve')}>Record Resolution</button>
            ) : null}
            {hasPermission(currentUser, 'incident.verify') && incident.status === 'RESOLVED' ? (
              <button className="button primary" onClick={() => setDialog('verify')}>Verify Resolution</button>
            ) : null}
            {hasPermission(currentUser, 'incident.close') && incident.status === 'VERIFIED' ? (
              <button className="button primary" onClick={() => setDialog('close')}>Close Incident</button>
            ) : null}
          </div>
          {error ? <div className="error-banner"><strong>{error}</strong></div> : null}
          <div className="timeline">
            {(incident.actions || []).map((action) => (
              <div className="timeline-item" key={action.id}>
                <div className="timeline-dot" />
                <div>
                  <strong>{action.action_type.replaceAll('_', ' ')}</strong>
                  <small>{action.technician_name || 'Technician'} · {new Date(action.created_at).toLocaleString()}</small>
                  <small>{action.result || action.observation}</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="content-grid">
        <article className="panel">
          <h2>Incident Timeline</h2>
          {timeline.isLoading ? <LoadingState label="Loading incident timeline..." /> : null}
          {timeline.isError ? <ErrorState message="Unable to load incident timeline." /> : null}
          {(timeline.data || []).map((item, index) => (
            <div className="timeline-item" key={`${item.time}-${index}`}>
              <div className="timeline-dot" />
              <div>
                <strong>{item.summary}</strong>
                <small>{item.actor} · {new Date(item.time).toLocaleString()}</small>
                <small>{item.details || 'No additional details'}</small>
              </div>
            </div>
          ))}
        </article>

        <article className="panel">
          <h2>Escalation and Verification</h2>
          <div className="description-block">
            <strong>Escalations</strong>
            <p>{incident.escalations?.length ? `${incident.escalations.length} escalation record(s) logged.` : 'No escalation recorded.'}</p>
            {incident.escalations?.map((escalation) => (
              <div key={escalation.id} className="readonly-card">
                <span>{escalation.required_team}</span>
                <small>{escalation.reason}</small>
              </div>
            ))}
            <strong>Verification</strong>
            <p>{incident.verification ? incident.verification.notes || 'Verification recorded.' : 'Resolution not yet verified.'}</p>
          </div>
        </article>
      </div>

      {dialog ? <WorkflowDialog kind={dialog} incident={incident} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function dialogTitle(kind: Exclude<DialogKind, null>) {
  return {
    assign: 'Assign Incident',
    action: 'Technical Action',
    escalate: 'Escalate Incident',
    resolve: 'Record Resolution',
    retest: 'Retest ATM',
    verify: 'Resolution Verification',
    close: 'Close Incident',
  }[kind];
}

function submitLabel(kind: Exclude<DialogKind, null>) {
  return {
    assign: 'Assign',
    action: 'Save Action',
    escalate: 'Escalate',
    resolve: 'Save Resolution',
    retest: 'Perform Test',
    verify: 'Verify Resolution',
    close: 'Close Incident',
  }[kind];
}
