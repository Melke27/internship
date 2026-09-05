import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Landmark, RefreshCw, Search, ShieldCheck, Wifi, Wrench } from 'lucide-react';

import { api } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';
import ATMFleetCard from '../components/atms/FleetCard';
import type { ATM, DashboardSummary, Incident } from '../types/api';

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
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

const CRITICAL_STATUSES = ['OFFLINE', 'FAULT', 'CRITICAL', 'COMMUNICATION_PROBLEM', 'ERROR', 'UNAVAILABLE'];

export default function MonitoringPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');

  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((response) => response.data),
    refetchInterval: 30000,
  });
  const atms = useQuery({
    queryKey: ['monitoring-atms'],
    queryFn: () => list<ATM>('/atms/?ordering=reference'),
    refetchInterval: 30000,
  });
  const incidents = useQuery({
    queryKey: ['monitoring-incidents'],
    queryFn: () => list<Incident>('/incidents/?ordering=-created_at'),
    refetchInterval: 30000,
  });

  const fleet = atms.data || [];

  const rows = useMemo(() => {
    let out = fleet;
    if (filter) out = out.filter((atm) => atm.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (atm) =>
          atm.reference.toLowerCase().includes(q) ||
          (atm.location || '').toLowerCase().includes(q) ||
          (atm.branch_name || '').toLowerCase().includes(q),
      );
    }
    return [...out].sort(
      (a, b) =>
        (CRITICAL_STATUSES.includes(b.status) ? 1 : b.status === 'OPERATIONAL' ? 0 : 0.5) -
        (CRITICAL_STATUSES.includes(a.status) ? 1 : a.status === 'OPERATIONAL' ? 0 : 0.5),
    );
  }, [fleet, filter, query]);

  const refreshAll = () => {
    summary.refetch();
    atms.refetch();
    incidents.refetch();
  };

  if (summary.isLoading || atms.isLoading) {
    return <LoadingState label="Loading live ATM monitoring..." />;
  }
  if (summary.isError || atms.isError) {
    return <ErrorState message="Unable to load monitoring data. Please try again." onRetry={refreshAll} />;
  }

  const data = summary.data!;
  const openIncidents = (incidents.data || []).filter((incident) => incident.status !== 'CLOSED');
  const criticalAtms = fleet.filter((atm) => CRITICAL_STATUSES.includes(atm.status));
  const offlineAtms = fleet.filter((atm) => atm.status === 'OFFLINE');

  const operationalCount = data.atm_status?.OPERATIONAL || 0;

  const statusBreakdown = PAGE_FILTERS.filter((f) => f.key).map((f) => ({
    key: f.key,
    label: f.label,
    count: fleet.filter((atm) => atm.status === f.key).length,
  }));
  const distributionTotal = statusBreakdown.reduce((sum, s) => sum + s.count, 0) || 1;

  return (
    <section className="page-content">
      <div className="portal-hero">
        <div>
          <p className="page-kicker">Monitoring · {data.district_name}</p>
          <h1>Live ATM Monitoring</h1>
          <p className="page-copy">
            Real-time ATM availability, sub-system signals, critical units and open incidents across the district.
          </p>
          <span className="live-updated">
            <span className="live-dot" />
            Updated {new Date(data.last_updated).toLocaleTimeString()} · auto-refreshes every 30s
          </span>
        </div>
        <div className="page-actions">
          <button type="button" className="button secondary" onClick={refreshAll}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="kpi-grid monitoring-kpi-grid" aria-label="District ATM summary">
        <MetricCard label="Total ATMs" value={data.atms} icon={<Landmark size={18} />} hint="in district" />
        <MetricCard label="Operational" value={operationalCount} tone="success" icon={<ShieldCheck size={18} />} hint="serving normally" />
        <MetricCard label="Offline" value={data.atm_status?.OFFLINE || 0} tone={(data.atm_status?.OFFLINE || 0) > 0 ? 'warning' : 'default'} icon={<Wifi size={18} />} hint="no communication" />
        <MetricCard label="Fault" value={data.atm_status?.FAULT || 0} tone={(data.atm_status?.FAULT || 0) > 0 ? 'danger' : 'default'} icon={<CircleAlert size={18} />} hint="needs repair" />
        <MetricCard label="Open Incidents" value={data.open_incidents} tone="info" icon={<Wrench size={18} />} hint="active incidents" to="/incidents" />
      </div>

      <article className="panel">
        <div className="panel-header" style={{ flexWrap: 'wrap' }}>
          <div>
            <h2>ATM Status Board</h2>
            <p>Current technical status for every ATM in the district.</p>
          </div>
          <div className="page-search-bar">
            <Search size={15} aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by reference, branch, or location..."
              aria-label="Search by reference, branch, or location"
            />
          </div>
        </div>

        <div className="filter-chips" aria-label="ATM status filters">
          {PAGE_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`chip ${filter === item.key ? 'active' : ''}`}
              onClick={() => setFilter(item.key)}
              aria-pressed={filter === item.key}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="status-distribution" aria-label="ATM status distribution">
          <div className="status-distribution-bar" role="img" aria-label="Proportion of ATMs by status">
            {statusBreakdown.map((s) => (
              <span
                key={s.key}
                className={`status-distribution-seg seg-${s.key.toLowerCase().replace('_', '-')}`}
                style={{ width: `${(s.count / distributionTotal) * 100}%` }}
                title={`${s.label}: ${s.count}`}
              />
            ))}
          </div>
          <div className="status-distribution-legend">
            {statusBreakdown.map((s) => (
              <span className="status-distribution-item" key={s.key}>
                <i className={`seg-${s.key.toLowerCase().replace('_', '-')}`} aria-hidden />
                <span>{s.label}</span>
                <strong>{s.count}</strong>
              </span>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={filter || query ? 'No ATMs match your filters' : 'No ATMs in scope'}
            description={filter || query ? 'Try a different status filter or search term.' : 'No ATM records are available for monitoring.'}
          />
        ) : (
          <div className="atm-fleet-grid">
            {rows.map((atm) => (
              <ATMFleetCard
                key={atm.id}
                atm={atm}
                to={`/atms/${atm.id}`}
                actions={
                  <>
                    <Link className="button secondary small" to={`/atms/${atm.id}`}>
                      View Details
                    </Link>
                    <Link className="button primary small" to={`/incidents?atm=${atm.id}&new=1`}>
                      Report Problem
                    </Link>
                  </>
                }
              />
            ))}
          </div>
        )}
      </article>

      <div className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Critical &amp; Offline ATMs</h2>
              <p>Units requiring immediate attention.</p>
            </div>
          </div>
          {criticalAtms.length === 0 ? (
            <EmptyState title="District operating normally" description="No ATMs currently require critical attention." />
          ) : (
            <div className="list-stack">
              {criticalAtms.map((atm) => (
                <div className="list-card" key={atm.id}>
                  <div>
                    <Link to={`/atms/${atm.id}`}><strong>{atm.reference}</strong></Link>
                    <small>{atm.branch_name}</small>
                    {atm.active_incident ? (
                      <small>
                        <Link to={`/incidents/${atm.active_incident.id}`}>{atm.active_incident.incident_number}</Link>
                      </small>
                    ) : null}
                  </div>
                  <StatusBadge value={atm.status} />
                </div>
              ))}
            </div>
          )}
          {offlineAtms.length > 0 ? (
            <div className="description-block">
              <strong>{offlineAtms.length} offline ATM(s)</strong>
              <p>{offlineAtms.map((atm) => atm.reference).join(', ')}</p>
            </div>
          ) : null}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Open Incidents</h2>
              <p>Active technical incidents affecting district ATMs.</p>
            </div>
            <Link className="text-link" to="/incidents">View all</Link>
          </div>
          {openIncidents.length === 0 ? (
            <EmptyState title="No active incidents" description="All ATMs are currently operating without reported technical issues." />
          ) : (
            <div className="list-stack">
              {openIncidents.slice(0, 10).map((incident) => (
                <Link className="list-card" to={`/incidents/${incident.id}`} key={incident.id}>
                  <div>
                    <strong>{incident.incident_id}</strong>
                    <small>{incident.atm_reference} · {incident.title}</small>
                  </div>
                  <div className="badge-group">
                    <PriorityBadge value={incident.priority} />
                    <StatusBadge value={incident.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </article>
      </div>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent Status Changes</h2>
            <p>Latest ATM status transitions logged by the backend.</p>
          </div>
        </div>
        {(data.recent_status_changes || []).length === 0 ? (
          <EmptyState title="No recent changes" description="Status history will appear here after ATM status updates." />
        ) : (
          <div className="timeline">
            {data.recent_status_changes.map((row) => (
              <div className="timeline-item" key={row.id}>
                <div className="timeline-dot" />
                <div>
                  <strong>{row.atm_reference}</strong>
                  <small><StatusBadge value={row.old_status} /> <span aria-hidden>→</span> <StatusBadge value={row.new_status} /></small>
                  <small>{row.changed_by_name || 'System'} · {new Date(row.created_at).toLocaleString()}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}