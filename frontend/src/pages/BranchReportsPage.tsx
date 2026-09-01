import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Clock, FileWarning, Search } from 'lucide-react';

import { hasPermission, useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { extractError, listResource, mediaUrl } from '../lib/utils';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { EvidenceLightbox, EvidenceThumb } from '../components/ui/Evidence';
import { MetricCard } from '../components/ui/MetricCard';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import { CheckField, Dialog, Field, FormGrid, SelectInput, TextArea, TextInput } from '../components/ui/form';
import type { BranchReport } from '../types/api';

export default function BranchReportsPage() {
  const [params] = useSearchParams();
  const pending = params.get('pending') === '1';
  const [search, setSearch] = useState('');
  const reports = useQuery({
    queryKey: ['district-branch-reports', pending],
    queryFn: () =>
      listResource<BranchReport>(
        pending ? '/branch-reports/pending/' : '/branch-reports/?ordering=-created_at',
      ),
  });

  if (reports.isLoading) return <LoadingState label="Loading branch reports..." />;
  if (reports.isError) {
    return <ErrorState message="Unable to load ATM information." onRetry={() => reports.refetch()} />;
  }

  const rows = reports.data || [];

  // Client-side search filter
  const filteredRows = search.trim()
    ? rows.filter((r) =>
        (r.report_id || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.atm_reference || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.branch_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.problem_type || '').toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  // KPI counts (always from full list)
  const pending_count = rows.filter((r) => r.status === 'SUBMITTED').length;
  const reviewing_count = rows.filter((r) => ['RECEIVED', 'REVIEWING'].includes(r.status)).length;
  const converted_count = rows.filter((r) => r.status === 'CONVERTED_TO_INCIDENT').length;
  const dismissed_count = rows.filter((r) => r.status === 'DISMISSED').length;

  function severityRowClass(sev: string) {
    switch (sev) {
      case 'CRITICAL': return 'row-priority-critical';
      case 'HIGH': return 'row-priority-high';
      case 'MEDIUM': return 'row-priority-medium';
      default: return '';
    }
  }

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">ATM Operations</p>
          <h1>Branch Reports</h1>
          <p className="page-copy">Review branch ATM fault reports and convert confirmed issues into incidents.</p>
        </div>
        <div className="page-actions">
          {/* Tab strip toggle */}
          <div className="tab-strip">
            <Link
              className={`tab-strip-btn ${pending ? 'active' : ''}`}
              to="/branch-reports?pending=1"
            >
              <Clock size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              Pending
            </Link>
            <Link
              className={`tab-strip-btn ${!pending ? 'active' : ''}`}
              to="/branch-reports"
            >
              <ClipboardList size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              All Reports
            </Link>
          </div>
        </div>
      </div>

      {/* KPI summary row */}
      <div className="reports-kpi-bar">
        <MetricCard label="Pending Review" value={pending_count} icon={<Clock size={18} />} tone={pending_count > 0 ? 'warning' : 'default'} hint="just submitted" />
        <MetricCard label="Under Review" value={reviewing_count} icon={<FileWarning size={18} />} tone={reviewing_count > 0 ? 'info' : 'default'} hint="being assessed" />
        <MetricCard label="Converted" value={converted_count} icon={<CheckCircle2 size={18} />} tone="success" hint="turned into incident" />
        <MetricCard label="Dismissed" value={dismissed_count} icon={<ClipboardList size={18} />} hint="closed as non-issue" />
      </div>

      {/* Search bar */}
      <div className="filter-bar">
        <div className="page-search-bar" style={{ flex: 1, margin: 0 }}>
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by report ID, ATM, branch, or problem type..."
          />
        </div>
        {search && (
          <button className="button secondary small" onClick={() => setSearch('')}>Clear</button>
        )}
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState
          title={search ? 'No reports match your search' : 'No new branch reports'}
          description={search ? 'Try a different search term.' : 'Branch ATM problem reports will appear here for review.'}
        />
      ) : (
        <div className="table-wrap panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>ATM</th>
                <th>Branch</th>
                <th>Problem</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Incident</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((report) => (
                <tr key={report.id} className={severityRowClass(report.severity)}>
                  <td>
                    <strong>{report.report_id}</strong>
                  </td>
                  <td>{report.atm_reference}</td>
                  <td>{report.branch_name}</td>
                  <td>{report.problem_type.replaceAll('_', ' ')}</td>
                  <td>
                    <PriorityBadge value={report.severity} />
                  </td>
                  <td>
                    <StatusBadge value={report.status} />
                  </td>
                  <td>{new Date(report.created_at).toLocaleString()}</td>
                  <td>{report.linked_incident_number || '—'}</td>
                  <td>
                    <Link className="button secondary small" to={`/branch-reports/${report.id}`}>
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DistrictBranchReportDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const report = useQuery({
    queryKey: ['district-branch-report', id],
    queryFn: () => api.get<BranchReport>(`/branch-reports/${id}/`).then((r) => r.data),
    enabled: Boolean(id),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['district-branch-report', id] });
    await queryClient.invalidateQueries({ queryKey: ['district-branch-reports'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  };

  const receive = useMutation({
    mutationFn: () => api.post(`/branch-reports/${id}/receive/`),
    onSuccess: async () => {
      showToast('Report marked received');
      await refresh();
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });
  const review = useMutation({
    mutationFn: () => api.post(`/branch-reports/${id}/review/`),
    onSuccess: async () => {
      showToast('Report moved to reviewing');
      await refresh();
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });
  const dismiss = useMutation({
    mutationFn: (reason: string) => api.post(`/branch-reports/${id}/dismiss/`, { reason }),
    onSuccess: async () => {
      showToast('Report dismissed');
      setDismissOpen(false);
      await refresh();
    },
    onError: (err) => setError(extractError(err, 'Action could not be completed.')),
  });
  const convert = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post(`/branch-reports/${id}/create-incident/`, payload),
    onSuccess: async (response) => {
      showToast('Incident created from branch report');
      setConvertOpen(false);
      await refresh();
      const incidentId = response.data?.incident?.id;
      if (incidentId) navigate(`/incidents/${incidentId}`);
    },
    onError: (err) => {
      if (
        typeof err === 'object' &&
        err &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string; existing_incident?: { id: number } } } }).response?.data
          ?.detail === 'ACTIVE INCIDENT EXISTS'
      ) {
        const existing = (err as { response: { data: { existing_incident: { id: number; incident_number: string } } } })
          .response.data.existing_incident;
        setError(`ACTIVE INCIDENT EXISTS: ${existing.incident_number}`);
        return;
      }
      setError(extractError(err, 'Action could not be completed.'));
    },
  });

  if (report.isLoading) return <LoadingState label="Loading branch report..." />;
  if (report.isError || !report.data) {
    return <ErrorState message="Unable to load ATM information." onRetry={() => report.refetch()} />;
  }

  const data = report.data;
  const evidence = mediaUrl(data.evidence);
  const canReview = hasPermission(currentUser, 'branch_report.review') || hasPermission(currentUser, 'branch_report.convert');
  const canConvert = hasPermission(currentUser, 'branch_report.convert');
  const canDismiss = hasPermission(currentUser, 'branch_report.dismiss');

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
        
        
          <p className="page-kicker">Branch Report Review</p>
          <h1>{data.report_id}</h1>
          <p className="page-copy">
            {data.atm_reference} · {data.branch_name} · {data.problem_type.replaceAll('_', ' ')}
          </p>
        </div>
        <div className="badge-group">
          <PriorityBadge value={data.severity} />
          <StatusBadge value={data.status} />
        </div>
      </div>

      {data.active_incident && !data.linked_incident_id ? (
        <div className="info-banner">
          <strong>ACTIVE INCIDENT EXISTS</strong>
          <p>
            {data.active_incident.incident_number} · {data.active_incident.title} · {data.active_incident.priority} ·{' '}
            {data.active_incident.status}
          </p>
          <Link className="button secondary small" to={`/incidents/${data.active_incident.id}`}>
            View Existing Incident
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="error-banner">
          <strong>{error}</strong>
        </div>
      ) : null}

      <div className="content-grid">
        <article className="panel">
          <h2>Report</h2>
          <div className="detail-grid">
            <div>
              <span>Reported By</span>
              <strong>{data.reported_by_name || '—'}</strong>
            </div>
            <div>
              <span>Submitted</span>
              <strong>{new Date(data.created_at).toLocaleString()}</strong>
            </div>
            <div>
              <span>ATM Working</span>
              <strong>{data.atm_currently_working}</strong>
            </div>
            <div>
              <span>Service Impact</span>
              <strong>{data.customer_impact || '—'}</strong>
            </div>
          </div>
          <p>{data.description}</p>
          {data.observed_error ? (
            <>
              <h3>Observed Error</h3>
              <p>{data.observed_error}</p>
            </>
          ) : null}
          <h3>Evidence</h3>
          {evidence ? (
            <EvidenceThumb url={evidence} onOpen={() => setLightbox(true)} />
          ) : (
            <p className="empty-inline">No evidence uploaded.</p>
          )}
        </article>

        <article className="panel sticky-actions-panel">
          <h2>Operations Actions</h2>
          <p className="helper-text">
            Branch severity is advisory. Confirm severity before creating an incident and updating ATM status.
          </p>
          <div className="stack-actions">
            {canReview && data.status === 'SUBMITTED' ? (
              <button className="button secondary" onClick={() => receive.mutate()} disabled={receive.isPending}>
                Mark Received
              </button>
            ) : null}
            {canReview && ['SUBMITTED', 'RECEIVED'].includes(data.status) ? (
              <button className="button secondary" onClick={() => review.mutate()} disabled={review.isPending}>
                Start Review
              </button>
            ) : null}
            {canConvert &&
            !['CONVERTED_TO_INCIDENT', 'DISMISSED', 'CLOSED'].includes(data.status) &&
            !data.linked_incident_id ? (
              <button className="button primary" onClick={() => setConvertOpen(true)}>
                Create Incident
              </button>
            ) : null}
            {data.linked_incident_id ? (
              <Link className="button primary" to={`/incidents/${data.linked_incident_id}`}>
                Open Incident {data.linked_incident_number}
              </Link>
            ) : null}
            {canDismiss && !['CONVERTED_TO_INCIDENT', 'DISMISSED', 'CLOSED'].includes(data.status) ? (
              <button className="button danger-outline" onClick={() => setDismissOpen(true)}>
                Dismiss Report
              </button>
            ) : null}
            <Link className="button secondary" to={`/atms/${data.atm}`}>
              View ATM
            </Link>
          </div>
        </article>
      </div>

      {convertOpen ? (
        <Dialog
          title="Create Incident"
          description="Convert this branch report into an ATM incident ticket."
          onClose={() => setConvertOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const value = (name: string) =>
              (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value;
            const checked = (name: string) => (form.elements.namedItem(name) as HTMLInputElement)?.checked;
            convert.mutate({
              confirmed_severity: value('confirmed_severity'),
              title: value('title'),
              apply_atm_status: checked('apply_atm_status'),
            });
          }}
          footer={
            <>
              <button type="button" className="button secondary" onClick={() => setConvertOpen(false)}>
                Cancel
              </button>
              <button className="button primary" disabled={convert.isPending}>
                {convert.isPending ? 'Creating…' : 'Create Incident'}
              </button>
            </>
          }
        >
          <Field label="Confirm Severity" required>
            <SelectInput name="confirmed_severity" defaultValue={data.severity} required>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Incident Title">
            <TextInput name="title" defaultValue={`${data.problem_type.replaceAll('_', ' ')} — ${data.atm_reference}`} />
          </Field>
          <CheckField label="Update ATM technical status" hint="Apply a matching technical status to the ATM based on the confirmed severity.">
            <input name="apply_atm_status" type="checkbox" defaultChecked />
          </CheckField>
        </Dialog>
      ) : null}

      {dismissOpen ? (
        <Dialog
          title="Dismiss Report"
          description="Mark this report as not requiring an incident investigation."
          onClose={() => setDismissOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            const reason = (event.currentTarget.elements.namedItem('reason') as HTMLTextAreaElement).value;
            dismiss.mutate(reason);
          }}
          footer={
            <>
              <button type="button" className="button secondary" onClick={() => setDismissOpen(false)}>
                Cancel
              </button>
              <button className="button primary" disabled={dismiss.isPending}>
                {dismiss.isPending ? 'Dismissing…' : 'Dismiss'}
              </button>
            </>
          }
        >
          <Field label="Reason" required hint="Explain why this report does not require an incident">
            <TextArea name="reason" rows={4} required placeholder="Explain why this report does not require an incident." />
          </Field>
        </Dialog>
      ) : null}

      {lightbox && evidence ? <EvidenceLightbox url={evidence} onClose={() => setLightbox(false)} /> : null}
    </section>
  );
}
