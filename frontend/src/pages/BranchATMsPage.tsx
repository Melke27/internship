import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, Landmark, Search, ShieldCheck, Wifi, Wrench } from 'lucide-react';

import { api } from '../lib/api';
import { listResource } from '../lib/utils';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { DualStatus, StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';
import ATMFleetCard from '../components/atms/FleetCard';
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

const PAGE_FILTERS = [
  { key: '', label: 'All ATMs' },
  { key: 'OPERATIONAL', label: 'Operational' },
  { key: 'WARNING', label: 'Warning' },
  { key: 'DEGRADED', label: 'Degraded' },
  { key: 'FAULT', label: 'Fault' },
  { key: 'OFFLINE', label: 'Offline' },
  { key: 'CRITICAL', label: 'Critical' },
  { key: 'UNDER_REPAIR', label: 'Under Repair' },
];

function BranchATMStatusPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const filter = params.get('status') || '';
  const atms = useQuery({
    queryKey: ['branch-atms-page'],
    queryFn: () => listResource<ATM>('/atms/?ordering=reference'),
  });

  const fleet = atms.data || [];

  const operational = fleet.filter((a) => a.status === 'OPERATIONAL').length;
  const attention = fleet.filter((a) => ['FAULT', 'CRITICAL', 'OFFLINE', 'WARNING', 'DEGRADED'].includes(a.status)).length;
  const offline = fleet.filter((a) => a.status === 'OFFLINE').length;
  const withIncident = fleet.filter((a) => a.active_incident).length;

  const rows = useMemo(() => {
    let out = fleet;
    if (filter) out = out.filter((atm) => atm.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (atm) =>
          atm.reference.toLowerCase().includes(q) ||
          (atm.location || '').toLowerCase().includes(q) ||
          (atm.name || '').toLowerCase().includes(q),
      );
    }
    const danger = ['CRITICAL', 'FAULT', 'OFFLINE'];
    return [...out].sort((a, b) => {
      const rank = (x: ATM) => (danger.includes(x.status) ? 0 : x.status === 'OPERATIONAL' ? 2 : 1);
      return rank(a) - rank(b);
    });
  }, [fleet, filter, query]);

  if (atms.isLoading) return <LoadingState label="Loading branch ATMs..." />;
  if (atms.isError) return <ErrorState message="Unable to load ATM information." onRetry={() => atms.refetch()} />;

  return (
    <section className="page-content">
      <Link className="breadcrumb-back" to="/branch">
        <ArrowLeft size={13} /> Back to Dashboard
      </Link>

      <div className="portal-hero">
        <div>
          <p className="page-kicker">Branch ATMs · Live Fleet Supply</p>
          <h1>My ATMs</h1>
          <p className="page-copy">Live status of the ATM units at your branch with network, power and hardware signals.</p>
          <span className="live-updated">
            <span className="live-dot" />
            {fleet.length} ATM{fleet.length === 1 ? '' : 's'} · Updated {atms.dataUpdatedAt ? new Date(atms.dataUpdatedAt).toLocaleTimeString() : '—'}
          </span>
        </div>
        <div className="page-actions">
          <Link className="button primary" to="/branch/report">
            <CircleAlert size={16} /> Report ATM Problem
          </Link>
        </div>
      </div>

      <div className="kpi-grid branch-kpi-grid" aria-label="Branch ATM summary">
        <MetricCard label="Total ATMs" value={fleet.length} to="/branch/atms" icon={<Landmark size={18} />} hint="assigned to branch" />
        <MetricCard label="Operational" value={operational} tone="success" icon={<ShieldCheck size={18} />} hint="serving normally" />
        <MetricCard label="Need attention" value={attention} tone={attention > 0 ? 'danger' : 'default'} icon={<CircleAlert size={18} />} hint="warnings & faults" />
        <MetricCard label="Offline" value={offline} tone={offline > 0 ? 'warning' : 'default'} icon={<Wifi size={18} />} hint="no communication" />
        <MetricCard label="Open incidents" value={withIncident} tone="info" icon={<Wrench size={18} />} hint="linked incidents" />
      </div>

      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div className="page-search-bar" style={{ flex: 1, minWidth: 220, maxWidth: 380, margin: 0 }}>
          <Search size={15} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by reference, name, or location..."
            aria-label="Search by reference, name, or location"
          />
        </div>
        {(query || filter) ? (
          <button
            className="button secondary small"
            onClick={() => { setQuery(''); setParams(new URLSearchParams()); }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="filter-chips" aria-label="ATM status filters">
        {PAGE_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`chip ${filter === item.key ? 'active' : ''}`}
            onClick={() => {
              const next = new URLSearchParams();
              if (item.key) next.set('status', item.key);
              setParams(next);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={filter || query ? 'No ATMs match your filters' : 'No ATMs found'}
          description={filter || query ? 'Try a different status filter or search term.' : 'No ATMs are registered for your branch yet.'}
        />
      ) : (
        <div className="atm-fleet-grid">
          {rows.map((atm) => (
            <ATMFleetCard
              key={atm.id}
              atm={atm}
              to={`/branch/atms/${atm.id}`}
              actions={
                <>
                  <Link className="button secondary small" to={`/branch/atms/${atm.id}`}>
                    View Status
                  </Link>
                  <Link className="button primary small" to={`/branch/report?atm=${atm.id}`}>
                    Report Problem
                  </Link>
                </>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function BranchATMsPage() {
  return <BranchATMStatusPage />;
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
      <Link className="breadcrumb-back" to="/branch/atms">
        <ArrowLeft size={13} /> Back to My ATMs
      </Link>
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
