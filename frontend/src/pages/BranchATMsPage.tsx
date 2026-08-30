import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { listResource } from '../lib/utils';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { DualStatus, StatusBadge } from '../components/ui/StatusBadge';
import type { ATM } from '../types/api';

type StatusHistoryRow = {
  id: number;
  atm: number;
  old_status: string;
  new_status: string;
  reason: string;
  changed_by_name?: string | null;
  created_at: string;
};

export default function StatusHistoryPage() {
  const summary = useQuery({
    queryKey: ['dashboard-summary', 'status-history'],
    queryFn: () =>
      api
        .get<{
          recent_status_changes: Array<{
            id: number;
            atm_reference: string;
            old_status: string;
            new_status: string;
            reason: string;
            changed_by_name: string | null;
            created_at: string;
          }>;
        }>('/reports/dashboard/')
        .then((r) => r.data),
  });

  if (summary.isLoading) return <LoadingState label="Loading ATM status history..." />;
  if (summary.isError || !summary.data) {
    return <ErrorState message="Unable to load ATM information." onRetry={() => summary.refetch()} />;
  }

  const rows = summary.data.recent_status_changes || [];

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Monitoring</p>
          <h1>ATM Status History</h1>
          <p className="page-copy">Recorded technical status changes across the district fleet.</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No status changes recorded" description="ATM status history appears after updates are logged." />
      ) : (
        <div className="panel timeline">
          {rows.map((row) => (
            <div className="timeline-item" key={row.id}>
              <div className="timeline-dot" />
              <div>
                <strong>{row.atm_reference}</strong>
                <small>
                  {row.old_status} → {row.new_status}
                </small>
                <small>
                  {row.changed_by_name || 'System'} · {new Date(row.created_at).toLocaleString()}
                </small>
                {row.reason ? <small>{row.reason}</small> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function BranchATMsPage() {
  const [params] = useSearchParams();
  const filter = params.get('status') || '';
  const atms = useQuery({
    queryKey: ['branch-atms-page'],
    queryFn: () => listResource<ATM>('/atms/?ordering=reference'),
  });

  if (atms.isLoading) return <LoadingState label="Loading branch ATMs..." />;
  if (atms.isError) return <ErrorState message="Unable to load ATM information." onRetry={() => atms.refetch()} />;

  const rows = (atms.data || []).filter((atm) => !filter || atm.status === filter);

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Branch ATMs</p>
          <h1>My ATMs</h1>
          <p className="page-copy">View ATM status for your branch only.</p>
        </div>
        <Link className="button primary" to="/branch/report">
          Report ATM Problem
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No ATMs found" description="No ATMs match the current filters." />
      ) : (
        <div className="monitor-grid">
          {rows.map((atm) => (
            <Link className="monitor-card" key={atm.id} to={`/branch/atms/${atm.id}`}>
              <div className="monitor-card-head">
                <strong>{atm.reference}</strong>
                <DualStatus active={atm.is_active !== false} technical={atm.status} />
              </div>
              <small>{atm.location || atm.branch_name}</small>
              <div className="row-actions">
                <span className="button secondary small">
                  View Status
                </span>
                <Link
                  className="button primary small"
                  to={`/branch/report?atm=${atm.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Report Problem
                </Link>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function BranchATMDetailPage() {
  const { id } = useParams();
  const atm = useQuery({
    queryKey: ['branch-atm', id],
    queryFn: () => api.get<ATM>(`/atms/${id}/`).then((r) => r.data),
    enabled: Boolean(id),
  });
  const history = useQuery({
    queryKey: ['branch-atm-history', id],
    queryFn: () => api.get<StatusHistoryRow[]>(`/atms/${id}/status_history/`).then((r) => r.data),
    enabled: Boolean(id),
  });

  if (atm.isLoading) return <LoadingState label="Loading ATM..." />;
  if (atm.isError || !atm.data) {
    return <ErrorState message="Unable to load ATM information." onRetry={() => atm.refetch()} />;
  }

  const data = atm.data;

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">ATM Status</p>
          <h1>{data.reference}</h1>
          <p className="page-copy">{data.branch_name}</p>
        </div>
        <div className="page-actions">
          <DualStatus active={data.is_active !== false} technical={data.status} />
          <Link className="button primary" to={`/branch/report?atm=${data.id}`}>
            Report Problem
          </Link>
        </div>
      </div>
      <div className="content-grid">
        <article className="panel">
          <h2>ATM Information</h2>
          <div className="detail-grid">
            <div>
              <span>Location</span>
              <strong>{data.location || '—'}</strong>
            </div>
            <div>
              <span>Model</span>
              <strong>{data.model || '—'}</strong>
            </div>
            <div>
              <span>Technical Status</span>
              <StatusBadge value={data.status} />
            </div>
            <div>
              <span>Last Checked</span>
              <strong>{data.last_checked ? new Date(data.last_checked).toLocaleString() : '—'}</strong>
            </div>
          </div>
          {data.active_incident ? (
            <div className="info-banner" style={{ marginTop: 16 }}>
              <strong>{data.active_incident.incident_number}</strong>
              <p>
                {data.active_incident.title} · {data.active_incident.status}
              </p>
            </div>
          ) : (
            <p className="helper-text">No active incident on this ATM.</p>
          )}
        </article>
        <article className="panel">
          <h2>Recent Status History</h2>
          {(history.data || []).length === 0 ? (
            <EmptyState title="No history yet" description="Status changes will appear here." />
          ) : (
            <div className="timeline">
              {(history.data || []).slice(0, 10).map((row) => (
                <div className="timeline-item" key={row.id}>
                  <div className="timeline-dot" />
                  <div>
                    <strong>
                      {row.old_status} → {row.new_status}
                    </strong>
                    <small>{new Date(row.created_at).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
