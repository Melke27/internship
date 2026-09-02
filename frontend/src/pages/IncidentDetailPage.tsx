import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { api } from '../lib/api';
import { hasPermission, useAuth } from '../context/AuthContext';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import { CheckField, Dialog, Field, FormGrid, SelectInput, TextArea, TextInput } from '../components/ui/form';
import type { Incident, User } from '../types/api';
import { Check, CheckCircle, Clock, AlertTriangle, Search, ShieldCheck, Lock } from 'lucide-react';

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
    <Dialog
      title={dialogTitle(kind)}
      description={dialogDescription(kind)}
      onClose={onClose}
      onSubmit={(event) => {
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
        if (kind === 'close') mutation.mutate({ final_result: value('final_result') });
      }}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : submitLabel(kind)}</button>
        </>
      }
    >
      {kind === 'assign' ? (
        <Field label="Assign Technician" required hint="Choose who will own and work the incident">
          <SelectInput name="assigned_to" required defaultValue="">
            <option value="" disabled>Select technician</option>
            {(technicians.data || []).map((tech) => <option key={tech.id} value={tech.id}>{tech.full_name || tech.username}</option>)}
          </SelectInput>
        </Field>
      ) : null}
      {kind === 'action' ? (
        <>
          <Field label="Technical Action" required>
            <SelectInput name="action_type" required>
              {['CHECK_ATM_STATUS', 'PHYSICAL_INSPECTION', 'CHECK_POWER', 'CHECK_CONNECTION', 'CHECK_NETWORK', 'CHECK_COMMUNICATION', 'CHECK_HARDWARE', 'CHECK_DISPLAY', 'CHECK_CARD_READER', 'CHECK_CASH_DISPENSER', 'CHECK_RECEIPT_PRINTER', 'RECORD_ERROR', 'PERFORM_AUTHORIZED_ACTION', 'VERIFY_SERVICE'].map((value) => (
                <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Action Summary" required>
            <TextArea name="action" rows={2} required placeholder="Brief summary of what was done" />
          </Field>
          <Field label="Observation" required hint="What was observed during the action">
            <TextArea name="observation" rows={3} required placeholder="What was observed on site" />
          </Field>
          <Field label="Result" required hint="Normal or problem found">
            <TextArea name="result" rows={2} required placeholder="Normal or problem found" />
          </Field>
          <FormGrid cols={2}>
            <Field label="Next Step">
              <TextArea name="next_action" rows={2} placeholder="Planned follow-up" />
            </Field>
            <Field label="Remarks">
              <TextArea name="remarks" rows={2} placeholder="Optional notes" />
            </Field>
          </FormGrid>
        </>
      ) : null}
      {kind === 'escalate' ? (
        <>
          <Field label="Reason" required hint="Why this incident requires a higher team">
            <TextArea name="reason" rows={3} required placeholder="Justification for escalation" />
          </Field>
          <Field label="Technical Findings">
            <TextArea name="technical_findings" rows={3} placeholder="Diagnostic findings so far" />
          </Field>
          <Field label="Escalate To" required>
            <TextInput name="required_team" required placeholder="Select team or user" />
          </Field>
          <FormGrid cols={2}>
            <Field label="Assigned Team">
              <TextInput name="assigned_team" placeholder="Optional assigned team" />
            </Field>
            <Field label="Priority">
              <SelectInput name="priority">{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value}</option>)}</SelectInput>
            </Field>
          </FormGrid>
          <Field label="Remarks">
            <TextArea name="remarks" rows={2} placeholder="Optional notes" />
          </Field>
        </>
      ) : null}
      {kind === 'resolve' ? (
        <>
          <Field label="Resolution Description" required>
            <TextArea name="description" rows={3} required placeholder="How the problem was resolved" />
          </Field>
          <Field label="Authorized Action Performed" required>
            <TextArea name="action_performed" rows={3} required placeholder="The authorized action carried out" />
          </Field>
          <FormGrid cols={2}>
            <Field label="Final Status" required>
              <TextInput name="final_status" required placeholder="Service restored" />
            </Field>
            <Field label="Final Result" required>
              <TextArea name="final_result" rows={2} required placeholder="Outcome of the resolution" />
            </Field>
          </FormGrid>
        </>
      ) : null}
      {kind === 'retest' ? (
        <>
          <div className="readonly-card">
            <span>Current Status</span>
            <div><StatusBadge value={incident.status} /></div>
          </div>
          <Field label="Retest Result" required>
            <SelectInput name="outcome" required>
              <option value="PROBLEM_REMAINS">Problem remains</option>
              <option value="SERVICE_RESTORED">Service restored</option>
            </SelectInput>
          </Field>
          <Field label="Retest Notes" required>
            <TextArea name="notes" rows={3} required placeholder="What the retest found" />
          </Field>
          <Field label="Resolution Description">
            <TextArea name="description" rows={2} placeholder="Optional" />
          </Field>
          <FormGrid cols={2}>
            <Field label="Action Performed">
              <TextArea name="action_performed" rows={2} placeholder="Optional" />
            </Field>
            <Field label="Final Status">
              <TextInput name="final_status" placeholder="Operational" />
            </Field>
          </FormGrid>
          <Field label="Final Result">
            <TextArea name="final_result" rows={2} placeholder="Optional" />
          </Field>
        </>
      ) : null}
      {kind === 'verify' ? (
        <>
          <CheckField label="ATM Status Operational" hint="The ATM is running normally">
            <input type="checkbox" name="atm_available" />
          </CheckField>
          <CheckField label="Previous Error No Longer Present" hint="The reported error has cleared">
            <input type="checkbox" name="issue_cleared" />
          </CheckField>
          <CheckField label="Communication Available" hint="Network / communication is working">
            <input type="checkbox" name="communication_working" />
          </CheckField>
          <CheckField label="Functional Test Passed" hint="Approved test was completed successfully">
            <input type="checkbox" name="approved_test_completed" />
          </CheckField>
          <Field label="Verification Notes">
            <TextArea name="notes" rows={3} placeholder="Anything worth recording about the verification" />
          </Field>
        </>
      ) : null}
      {kind === 'close' ? (
        <>
          <div className="readonly-card">
            <span>Close Incident</span>
            <small>{incident.incident_id} has been verified. This action will close the incident.</small>
          </div>
          <Field label="Final Result" hint="Required before closure. Pre-filled if already recorded.">
            <TextArea name="final_result" rows={3} defaultValue={incident.final_result || ''} placeholder="Record the final outcome of this incident" />
          </Field>
        </>
      ) : null}
      {error ? <div className="error-banner" role="alert"><strong>{error}</strong></div> : null}
    </Dialog>
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

      {/* Visual Incident Lifecycle Step Tracker */}
      <IncidentStepTracker currentStatus={incident.status} />

      <div className="details-grid">
        <article className="panel">
          <h2>Incident Overview</h2>
          <dl className="detail-grid">
            <DetailField label="ATM" value={<Link to={`/atms/${incident.atm}`}>{incident.atm_reference}</Link>} />
            <DetailField label="Branch" value={incident.branch_name} />
            <DetailField label="District" value={incident.district_name} />
            <DetailField label="Reported By" value={incident.reported_by_name || '—'} />
            <DetailField label="Assigned Technician" value={incident.assigned_to_name || 'Unassigned'} />
            <DetailField label="Category" value={incident.category} />
            <DetailField label="Priority" value={<PriorityBadge value={incident.priority} />} />
            <DetailField label="Status" value={<StatusBadge value={incident.status} />} />
            <DetailField label="Error Message" value={incident.error_message || '—'} />
            <DetailField label="Service Impact" value={incident.service_impact || '—'} />
            <DetailField label="Created At" value={new Date(incident.created_at).toLocaleString()} />
            <DetailField label="Resolved At" value={incident.resolved_at ? new Date(incident.resolved_at).toLocaleString() : '—'} />
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
            {hasPermission(currentUser, 'incident.assign') && ['REPORTED', 'ACKNOWLEDGED', 'ASSIGNED', 'INVESTIGATING', 'TROUBLESHOOTING', 'WAITING', 'ESCALATED'].includes(incident.status) ? (
              <button className="button primary" onClick={() => setDialog('assign')}>
                {incident.assigned_to ? 'Reassign Technician' : 'Assign Technician'}
              </button>
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
          {error ? <div className="error-banner" role="alert"><strong>{error}</strong></div> : null}
          {!error && (incident.actions || []).length === 0 ? (
            <EmptyState title="No technical actions yet" description="Technician actions will appear here as the incident is worked on." />
          ) : null}
          {(incident.actions || []).length > 0 ? (
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
          ) : null}
        </article>
      </div>

      <div className="content-grid">
        <article className="panel">
          <h2>Incident Timeline</h2>
          {timeline.isLoading ? <LoadingState label="Loading incident timeline..." /> : null}
          {timeline.isError ? <ErrorState message="Unable to load incident timeline." /> : null}
          {!timeline.isLoading && !timeline.isError && (timeline.data || []).length === 0 ? (
            <EmptyState title="No timeline events" description="Workflow events will appear here as the incident progresses." />
          ) : null}
          {!timeline.isLoading && !timeline.isError && (timeline.data || []).length > 0 ? (
          <div className="timeline">
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
          </div>
          ) : null}
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

function DetailField({ label, value }: { label: string; value: ReactNode }) {
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

function dialogDescription(kind: Exclude<DialogKind, null>) {
  return {
    assign: 'Assign this incident to a technician for investigation and resolution.',
    action: 'Record a troubleshooting action performed on the ATM.',
    escalate: 'Escalate this incident to a higher team or specialist.',
    resolve: 'Record how the incident was resolved and its final status.',
    retest: 'Re-test the ATM after a resolution attempt.',
    verify: 'Confirm the reported problem is cleared and the ATM is back in service.',
    close: 'Close the incident after verification.',
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

const LIFECYCLE_STEPS = [
  { key: 'REPORTED', label: 'Reported', icon: AlertTriangle },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged', icon: Clock },
  { key: 'INVESTIGATING', label: 'Troubleshooting', icon: Search },
  { key: 'RESOLVED', label: 'Resolved', icon: CheckCircle },
  { key: 'VERIFIED', label: 'Verified', icon: ShieldCheck },
  { key: 'CLOSED', label: 'Closed', icon: Lock },
];

function statusStepIndex(status: string): number {
  switch (status) {
    case 'REPORTED': return 0;
    case 'ACKNOWLEDGED':
    case 'ASSIGNED': return 1;
    case 'INVESTIGATING':
    case 'TROUBLESHOOTING':
    case 'WAITING':
    case 'ESCALATED': return 2;
    case 'RESOLVED': return 3;
    case 'VERIFIED': return 4;
    case 'CLOSED': return 5;
    default: return 0;
  }
}

function IncidentStepTracker({ currentStatus }: { currentStatus: string }) {
  const currentIndex = statusStepIndex(currentStatus);

  return (
    <div className="panel" style={{ marginBottom: 20, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
        Incident Lifecycle Progress
      </div>
      <div className="step-tracker" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8, position: 'relative' }}>
        {LIFECYCLE_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isDone = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <div
              key={step.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '10px 6px',
                borderRadius: 8,
                background: isCurrent ? 'var(--brand-surface)' : isDone ? 'var(--surface-2)' : 'transparent',
                border: isCurrent ? '1.5px solid var(--brand)' : '1px dashed var(--border-subtle)',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isDone ? 'var(--success)' : isCurrent ? 'var(--brand)' : 'var(--surface-3)',
                  color: isDone || isCurrent ? '#fff' : 'var(--text-3)',
                  marginBottom: 6,
                }}
              >
                {isDone ? <Check size={14} /> : <Icon size={14} />}
              </div>
              <span style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--brand)' : isDone ? 'var(--text-1)' : 'var(--text-3)' }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
