import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import type { ATM, DashboardSummary, Incident } from '../types/api';

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

export default function MonitoringPage() {
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

  if (summary.isLoading || atms.isLoading) {
    return <LoadingState label="Loading live ATM monitoring..." />;
  }
  if (summary.isError || atms.isError) {
    return <ErrorState message="Unable to load monitoring data. Please try again." />;
  }

  const data = summary.data!;
  const fleet = atms.data || [];
  const openIncidents = (incidents.data || []).filter((incident) => incident.status !== 'CLOSED');
  const criticalAtms = fleet.filter((atm) =>
    ['OFFLINE', 'FAULT', 'COMMUNICATION_PROBLEM', 'ERROR', 'UNAVAILABLE'].includes(atm.status),
  );
  const offlineAtms = fleet.filter((atm) => atm.status === 'OFFLINE');

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Monitoring</p>
          <h1>Live ATM Monitoring</h1>
          <p className="page-copy">
            Real-time ATM availability, status changes, critical units and open incidents for {data.district_name}.
          </p>
        </div>
        <div className="page-actions">
          <span className="helper-text">Last updated: {new Date(data.last_updated).toLocaleString()}</span>
          <button className="button secondary" onClick={() => { summary.refetch(); atms.refetch(); incidents.refetch(); }}>
            Refresh
          </button>
        </div>
      </div>

      <div className="kpi-grid compact">
        <article className="metric-card"><span>Total ATMs</span><strong>{data.atms}</strong></article>
        <article className="metric-card success"><span>Operational</span><strong>{(data.atm_status.OPERATIONAL || 0) + (data.atm_status.AVAILABLE || 0)}</strong></article>
        <article className="metric-card danger"><span>Offline</span><strong>{data.atm_status.OFFLINE || 0}</strong></article>
        <article className="metric-card danger"><span>Fault</span><strong>{data.atm_status.FAULT || 0}</strong></article>
        <article className="metric-card warning"><span>Open Incidents</span><strong>{data.open_incidents}</strong></article>
        <article className="metric-card"><span>Maintenance</span><strong>{data.maintenance_count}</strong></article>
      </div>

      <div className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>ATM Status Board</h2>
              <p>Current status for every ATM in the district.</p>
            </div>
          </div>
          {fleet.length === 0 ? (
            <EmptyState title="No ATMs in scope" description="No ATM records are available for monitoring." />
          ) : (
            <div className="monitor-grid">
              {fleet.map((atm) => (
                <Link key={atm.id} to={`/atms/${atm.id}`} className="monitor-card">
                  <strong>{atm.reference}</strong>
                  <small>{atm.branch_name}</small>
                  <StatusBadge value={atm.status} />
                  <small>Network: {atm.network_status.replaceAll('_', ' ')}</small>
                  <small>Hardware: {atm.hardware_status.replaceAll('_', ' ')}</small>
                </Link>
              ))}
            </div>
          )}
        </article>

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
      </div>

      <div className="content-grid">
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
                    <small>{row.old_status} → {row.new_status}</small>
                    <small>{row.changed_by_name || 'System'} · {new Date(row.created_at).toLocaleString()}</small>
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
