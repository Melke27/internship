import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { extractError, listResource } from '../lib/utils';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { EvidenceUpload } from '../components/ui/Evidence';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
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
    <section className="page-content narrow">
      <div className="page-header">
        <div>
          <p className="page-kicker">Reporting</p>
          <h1>Report ATM Problem</h1>
          <p className="page-copy">
            Submit a fault or crash report for an ATM at your branch. Operations will review severity.
          </p>
        </div>
        <Link className="button secondary" to="/branch">
          Cancel
        </Link>
      </div>

      {activeCheck.data ? (
        <div className="info-banner">
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
        className="panel form-panel"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          setError('');
          create.mutate(event.currentTarget);
        }}
      >
        <label>
          Branch
          <input value={selected?.branch_name || 'Your branch'} disabled />
        </label>
        <label>
          ATM *
          <select
            name="atm"
            required
            value={selectedAtm}
            onChange={(event) => setSelectedAtm(event.target.value)}
          >
            <option value="">Select ATM</option>
            {(atms.data || []).map((atm) => (
              <option key={atm.id} value={atm.id}>
                {atm.reference} · {atm.status}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Problem Type *
            <select name="problem_type" required defaultValue="NETWORK_COMMUNICATION">
              {PROBLEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Severity *
            <select name="severity" required defaultValue="MEDIUM">
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            ATM Currently Working? *
            <select name="atm_currently_working" required defaultValue="UNKNOWN">
              <option value="YES">YES</option>
              <option value="NO">NO</option>
              <option value="UNKNOWN">UNKNOWN</option>
            </select>
          </label>
          <label>
            When did the problem start?
            <input type="datetime-local" name="problem_started_at" />
          </label>
        </div>
        <label>
          Problem Description *
          <textarea name="description" rows={4} required placeholder="Describe what is happening at the ATM." />
        </label>
        <label>
          Observed Error
          <textarea name="observed_error" rows={3} placeholder="Any error message or observed behavior." />
        </label>
        <label>
          Customer / service impact
          <select name="customer_impact" defaultValue="">
            <option value="">Select impact</option>
            <option value="None">None</option>
            <option value="Minor inconvenience">Minor inconvenience</option>
            <option value="Service degraded">Service degraded</option>
            <option value="ATM unavailable">ATM unavailable</option>
            <option value="Branch service disrupted">Branch service disrupted</option>
          </select>
        </label>
        <EvidenceUpload file={evidence} onChange={setEvidence} />
        <p className="helper-text">
          Branch severity is advisory. District operations confirms whether the issue is officially critical.
        </p>
        {error ? (
          <div className="error-banner">
            <strong>{error}</strong>
          </div>
        ) : null}
        <div className="dialog-actions">
          <Link className="button secondary" to="/branch">
            Cancel
          </Link>
          <button className="button primary" disabled={create.isPending}>
            {create.isPending ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function BranchReportsListPage() {
  const [params] = useSearchParams();
  const history = params.get('history') === '1';
  const reports = useQuery({
    queryKey: ['branch-reports-list', history],
    queryFn: () => listResource<BranchReport>('/branch-reports/?ordering=-created_at'),
  });

  if (reports.isLoading) return <LoadingState label="Loading reports..." />;
  if (reports.isError) {
    return <ErrorState message="Unable to load ATM information." onRetry={() => reports.refetch()} />;
  }

  const rows = (reports.data || []).filter((report) =>
    history ? ['CLOSED', 'DISMISSED', 'RESOLVED', 'VERIFIED'].includes(report.status) : true,
  );

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Reporting</p>
          <h1>{history ? 'Report History' : 'My Reports'}</h1>
          <p className="page-copy">Track submitted ATM fault reports and resolution status.</p>
        </div>
        <Link className="button primary" to="/branch/report">
          Report ATM Problem
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title={history ? 'No completed report history' : 'No branch reports'}
          description={history ? 'Closed and resolved reports will appear here.' : 'Submitted ATM problem reports will appear here.'}
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
              {rows.map((report) => (
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
