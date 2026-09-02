import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Building2, Camera, CheckCircle2, ClipboardList, Clock, FileSearch, FileWarning, History, Info, Search } from 'lucide-react';

import { api } from '../lib/api';
import { extractError, listResource } from '../lib/utils';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { EvidenceUpload } from '../components/ui/Evidence';
import { Field, FormGrid, SelectInput, TextArea, TextInput } from '../components/ui/form';
import { DualStatus, PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';
import type { ATM, BranchReport } from '../types/api';

const PROBLEM_TYPES = [
  'NETWORK_COMMUNICATION',
  'POWER',
  'DISPLAY',
  'CARD_READER',
  'CASH_DISPENSER',
  'RECEIPT_PRINTER',
  'SOFTWARE',
  'HARDWARE',
  'SECURITY',
  'GENERAL',
  'UNKNOWN',
];

const IMPACT_OPTIONS = ['None', 'Minor inconvenience', 'Service degraded', 'ATM unavailable', 'Branch service disrupted'];

function FormSection({
  step,
  title,
  subtitle,
  icon,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="hr-section">
      <div className="hr-section-head">
        <div className="hr-section-icon">{icon}</div>
        <div>
          <span className="hr-section-step">STEP {step}</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function BranchReportFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [selectedAtm, setSelectedAtm] = useState(params.get('atm') || '');

  const atms = useQuery({
    queryKey: ['branch-atms-report'],
    queryFn: () => listResource<ATM>('/atms/?ordering=reference'),
  });

  const activeCheck = useQuery({
    queryKey: ['atm-active-incident', selectedAtm],
    queryFn: async () => {
      const atm = (atms.data || []).find((row) => String(row.id) === selectedAtm);
      return atm?.active_incident || null;
    },
    enabled: Boolean(selectedAtm) && Boolean(atms.data),
  });

  const create = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const value = (name: string) =>
        (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)?.value;
      const payload = new FormData();
      payload.append('atm', value('atm'));
      payload.append('problem_type', value('problem_type'));
      payload.append('severity', value('severity'));
      payload.append('atm_currently_working', value('atm_currently_working'));
      payload.append('description', value('description'));
      payload.append('observed_error', value('observed_error'));
      payload.append('customer_impact', value('customer_impact'));
      if (value('problem_started_at')) payload.append('problem_started_at', value('problem_started_at'));
      if (evidence) payload.append('evidence', evidence);
      return api.post<BranchReport>('/branch-reports/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: async (response) => {
      showToast('ATM problem report submitted');
      await queryClient.invalidateQueries({ queryKey: ['branch-reports'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      navigate(`/branch/reports/${response.data.id}`);
    },
    onError: (mutationError) => setError(extractError(mutationError, 'Action could not be completed.')),
  });

  const selected = useMemo(
    () => (atms.data || []).find((atm) => String(atm.id) === selectedAtm) || null,
    [atms.data, selectedAtm],
  );

  if (atms.isLoading) return <LoadingState label="Loading branch ATMs..." />;
  if (atms.isError) return <ErrorState message="Unable to load ATM information." onRetry={() => atms.refetch()} />;
  if ((atms.data || []).length === 0) {
    return <EmptyState title="No ATMs available" description="Your branch has no ATMs registered for reporting." />;
  }

  return (
    <section className="page-content">
      <Link className="breadcrumb-back" to="/branch/atms">
        <ArrowLeft size={13} /> Back to My ATMs
      </Link>

      <div className="portal-hero">
        <div>
          <p className="page-kicker">Reporting</p>
          <h1>Report ATM Problem</h1>
          <p className="page-copy">
            Submit a fault or crash report for an ATM at your branch. Operations will review severity
            {selected ? ` — reporting on ${selected.reference}` : ''}.
          </p>
          <span className="live-updated">
            <span className="live-dot" />
            {selected
              ? `${selected.reference} · ${(selected.active_incident ? 'active incident' : 'no active incident')} · updated ${new Date().toLocaleTimeString()}`
              : `select an ATM to begin · updated ${new Date().toLocaleTimeString()}`}
          </span>
        </div>
        <div className="page-actions">
          <Link className="button ghost light" to="/branch">Cancel</Link>
          <button className="button primary" type="submit" form="atm-report-form" disabled={create.isPending}>
            {create.isPending ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>

      {activeCheck.data ? (
        <div className="info-banner" style={{ marginBottom: 18 }}>
          <strong>ACTIVE INCIDENT EXISTS</strong>
          <p>
            {activeCheck.data.incident_number} · {activeCheck.data.title} · {activeCheck.data.priority} ·{' '}
            {activeCheck.data.status}
          </p>
          <Link className="button secondary small" to={`/branch/reports`}>
            View existing reports
          </Link>
          <p className="helper-text">
            You may still submit additional information, but a duplicate incident will not be created automatically.
          </p>
        </div>
      ) : null}

      <form
        id="atm-report-form"
        className="panel form-panel"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          setError('');
          create.mutate(event.currentTarget);
        }}
      >
        <FormSection step="1" title="ATM & Branch" subtitle="Identify the ATM unit that is experiencing the problem." icon={<Building2 size={16} />}>
          <FormGrid cols={2}>
            <Field label="Branch">
              <TextInput value={selected?.branch_name || 'Your branch'} disabled />
              <input type="hidden" name="branch" value={selected?.branch_name || ''} />
            </Field>
            <Field label="ATM" required hint="Select the affected ATM unit">
              <SelectInput
                name="atm"
                required
                value={selectedAtm}
                onChange={(event) => setSelectedAtm(event.target.value)}
              >
                <option value="">Select ATM</option>
                {(atms.data || []).map((atm) => (
                  <option key={atm.id} value={atm.id}>
                    {atm.reference} · {atm.status.replaceAll('_', ' ')}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </FormGrid>

          {selected ? (
            <div className="atm-context-card">
              <div className="atm-context-copy">
                <span className="context-chip"><DualStatus active={selected.is_active !== false} technical={selected.status} /></span>
                <span className="context-chip"><StatusBadge value={selected.health} /></span>
              </div>
              <p className="helper-text">
                {selected.name || selected.reference} · {selected.location || selected.branch_name}
                {selected.active_incident ? ` · Active: ${selected.active_incident.incident_number}` : ' · No active incident'}
              </p>
            </div>
          ) : (
            <div className="atm-context-card muted">
              <Info size={14} />
              <span>Select an ATM to see its current technical status and any active incident.</span>
            </div>
          )}
        </FormSection>

        <FormSection step="2" title="Problem Details" subtitle="Describe the fault and how severe it appears from the branch." icon={<AlertTriangle size={16} />}>
          <FormGrid cols={2}>
            <Field label="Problem Type" required>
              <SelectInput name="problem_type" required defaultValue="NETWORK_COMMUNICATION">
                {PROBLEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll('_', ' ')}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Severity" required hint="Branch severity is advisory — operations confirms critical status">
              <SelectInput name="severity" required defaultValue="MEDIUM">
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="ATM Currently Working?" required>
              <SelectInput name="atm_currently_working" required defaultValue="UNKNOWN">
                <option value="YES">Yes — operating normally</option>
                <option value="NO">No — out of service</option>
                <option value="UNKNOWN">Unknown</option>
              </SelectInput>
            </Field>
            <Field label="When did the problem start?">
              <TextInput type="datetime-local" name="problem_started_at" />
            </Field>
          </FormGrid>

          <Field label="Problem Description" required hint="Describe what is happening at the ATM">
            <TextArea name="description" rows={4} required placeholder="e.g. The cash dispenser stopped paying out and shows a jam error." />
          </Field>

          <div className="form-grid">
            <Field label="Observed Error" hint="Any error message or behaviour observed">
              <TextArea name="observed_error" rows={3} placeholder="e.g. Dispenser module EPP4 error 51" />
            </Field>
            <Field label="Customer / service impact" hint="How customers or the branch are affected">
              <SelectInput name="customer_impact" defaultValue="">
                <option value="">Select impact</option>
                {IMPACT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        </FormSection>

        <FormSection step="3" title="Evidence" subtitle="Attach a photo showing the issue to help the district team diagnose it faster." icon={<Camera size={16} />}>
          <EvidenceUpload file={evidence} onChange={setEvidence} />
        </FormSection>

        {error ? (
          <div className="error-banner">
            <strong>{error}</strong>
          </div>
        ) : null}
      </form>
    </section>
  );
}

export function BranchReportsListPage() {
  const [params, setParams] = useSearchParams();
  const history = params.get('history') === '1';
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const reports = useQuery({
    queryKey: ['branch-reports-list', history],
    queryFn: () => listResource<BranchReport>('/branch-reports/?ordering=-created_at'),
  });

  if (reports.isLoading) return <LoadingState label="Loading reports..." />;
  if (reports.isError) {
    return <ErrorState message="Unable to load ATM information." onRetry={() => reports.refetch()} />;
  }

  const all = reports.data || [];
  const activeRows = all.filter((report) => !['CLOSED', 'DISMISSED', 'RESOLVED', 'VERIFIED'].includes(report.status));
  const closedRows = all.filter((report) => ['CLOSED', 'DISMISSED', 'RESOLVED', 'VERIFIED'].includes(report.status));
  const base = history ? closedRows : activeRows;

  const filteredRows = base
    .filter((report) => !status || report.status === status)
    .filter((report) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        (report.report_id || '').toLowerCase().includes(q) ||
        (report.atm_reference || '').toLowerCase().includes(q) ||
        (report.problem_type || '').toLowerCase().includes(q)
      );
    });

  const submitted = activeRows.filter((r) => r.status === 'SUBMITTED').length;
  const inReview = activeRows.filter((r) => ['RECEIVED', 'REVIEWING'].includes(r.status)).length;
  const converted = all.filter((r) => r.status === 'CONVERTED_TO_INCIDENT').length;
  const dismissed = all.filter((r) => r.status === 'DISMISSED').length;

  const ACTIVE_CHIPS = [
    { key: '', label: 'All open' },
    { key: 'SUBMITTED', label: 'Submitted' },
    { key: 'RECEIVED', label: 'Received' },
    { key: 'REVIEWING', label: 'In review' },
    { key: 'CONVERTED_TO_INCIDENT', label: 'Incident created' },
  ];
  const HISTORY_CHIPS = [
    { key: '', label: 'All closed' },
    { key: 'CLOSED', label: 'Closed' },
    { key: 'RESOLVED', label: 'Resolved' },
    { key: 'DISMISSED', label: 'Dismissed' },
    { key: 'VERIFIED', label: 'Verified' },
  ];
  const CHIPS = history ? HISTORY_CHIPS : ACTIVE_CHIPS;

  return (
    <section className="page-content">
      <Link className="breadcrumb-back" to="/branch">
        <ArrowLeft size={13} /> Back to Dashboard
      </Link>

      <div className="portal-hero">
        <div>
          <p className="page-kicker">Branch Reporting</p>
          <h1>{history ? 'Report History' : 'My Reports'}</h1>
          <p className="page-copy">
            {history
              ? 'Completed and closed ATM fault reports for your branch.'
              : 'Track your submitted ATM fault reports and what happens next.'}
          </p>
          <span className="live-updated">
            <span className="live-dot" />
            {activeRows.length} active · {closedRows.length} on record
          </span>
        </div>
        <div className="page-actions">
          <Link className="button primary" to="/branch/report">
            <AlertTriangle size={16} /> Report ATM Problem
          </Link>
        </div>
      </div>

      <div className="tab-strip" style={{ marginBottom: 18 }}>
        <Link className={`tab-strip-btn ${!history ? 'active' : ''}`} to="/branch/reports">
          <ClipboardList size={13} /> Active Reports
        </Link>
        <Link className={`tab-strip-btn ${history ? 'active' : ''}`} to="/branch/reports?history=1">
          <History size={13} /> Report History
        </Link>
      </div>

      <div className="kpi-grid reports-kpi-grid" aria-label="Branch reports summary">
        <MetricCard label="Awaiting review" value={submitted} icon={<Clock size={18} />} tone={submitted > 0 ? 'warning' : 'default'} hint="just submitted" />
        <MetricCard label="In review" value={inReview} icon={<FileSearch size={18} />} tone={inReview > 0 ? 'info' : 'default'} hint="being assessed" />
        <MetricCard label="Incident created" value={converted} icon={<CheckCircle2 size={18} />} tone="success" hint="converted by ops" />
        <MetricCard label="Dismissed" value={dismissed} icon={<FileWarning size={18} />} hint="closed as non-issue" />
      </div>

      <div className="filter-bar" style={{ marginBottom: 14 }}>
        <div className="page-search-bar" style={{ flex: 1, minWidth: 220, maxWidth: 380, margin: 0 }}>
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by report ID, ATM, or problem..."
          />
        </div>
        {(query || status) ? (
          <button
            className="button secondary small"
            onClick={() => { setQuery(''); setStatus(''); }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="filter-chips" aria-label="Report status filters">
        {CHIPS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`chip ${status === item.key ? 'active' : ''}`}
            onClick={() => setStatus(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState
          title={query || status ? 'No reports match your filters' : history ? 'No completed report history' : 'No active branch reports'}
          description={query || status ? 'Try a different search term or status filter.' : history ? 'Closed and resolved reports will appear here.' : 'Submitted ATM problem reports will appear here.'}
        />
      ) : (
        <div className="table-wrap panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>ATM</th>
                <th>Problem</th>
                <th>Severity</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Linked Incident</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((report) => (
                <tr key={report.id}>
                  <td>
                    <strong>{report.report_id}</strong>
                  </td>
                  <td>{report.atm_reference}</td>
                  <td>{report.problem_type.replaceAll('_', ' ')}</td>
                  <td>
                    <PriorityBadge value={report.severity} />
                  </td>
                  <td>{new Date(report.created_at).toLocaleString()}</td>
                  <td>
                    <StatusBadge value={report.status} />
                  </td>
                  <td>{report.linked_incident_number || '—'}</td>
                  <td>
                    <Link className="button secondary small" to={`/branch/reports/${report.id}`}>
                      View
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
