import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { hasPermission, useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import type { ATM, DashboardSummary } from '../types/api';

const STATUS_ORDER = ['OPERATIONAL', 'AVAILABLE', 'OFFLINE', 'UNAVAILABLE', 'FAULT', 'COMMUNICATION_PROBLEM', 'MAINTENANCE', 'ERROR'];

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

export default function DashboardPage() {
  const { currentUser } = useAuth();
  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((response) => response.data),
  });
  const atms = useQuery({
    queryKey: ['dashboard-atms'],
    queryFn: () => list<ATM>('/atms/?ordering=reference'),
  });

  if (summary.isLoading) return <LoadingState label="Loading ATM district dashboard..." />;
  if (summary.isError || !summary.data) {
    return <ErrorState message="Unable to load ATM dashboard data. Please try again." onRetry={() => summary.refetch()} />;
  }

  const data = summary.data;
  const operational = (data.atm_status.OPERATIONAL || 0) + (data.atm_status.AVAILABLE || 0);
  const availability = data.atms ? Math.round((operational / data.atms) * 100) : 0;
  const fleet = atms.data || [];

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">ATM Operations</p>
          <h1>{data.district_name}</h1>
          <p className="page-copy">Monitor ATM availability, incidents, maintenance, technical actions and service restoration.</p>
        </div>
        <div className="page-actions">
          <span className="helper-text">Last updated: {new Date(data.last_updated).toLocaleString()}</span>
          <button
            className="button secondary"
            onClick={() => {
              summary.refetch();
              atms.refetch();
            }}
          >
            Refresh
          </button>
          {hasPermission(currentUser, 'incident.create') && (
            <Link className="button primary" to="/incidents?new=1">Create Incident</Link>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <MetricCard label="TOTAL ATMs" value={data.atms} note={`${data.branches} branches`} />
        <MetricCard label="OPERATIONAL" value={operational} note={`${availability}% availability`} tone="success" />
        <MetricCard label="OFFLINE" value={data.atm_status.OFFLINE || 0} note="Unavailable to service" tone="danger" />
        <MetricCard label="FAULT" value={data.atm_status.FAULT || 0} note="Technical faults recorded" tone="danger" />
        <MetricCard label="OPEN INCIDENTS" value={data.open_incidents} note={`${data.critical_incidents} critical`} tone="warning" />
        <MetricCard label="MAINTENANCE" value={data.maintenance_count} note="Scheduled or in progress" />
      </div>

      <div className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>ATM Health</h2>
              <p>Operational, offline, fault, maintenance and communication status counts.</p>
            </div>
          </div>
          <div className="stat-list">
            {STATUS_ORDER.map((status) => (
              <div className="stat-row" key={status}>
                <div>
                  <strong>{status.replaceAll('_', ' ')}</strong>
                  <small>{data.atms ? Math.round(((data.atm_status[status] || 0) / data.atms) * 100) : 0}% of district fleet</small>
                </div>
                <span>{data.atm_status[status] || 0}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Critical Attention</h2>
              <p>Only ATMs that currently need immediate attention.</p>
            </div>
          </div>
          {data.attention_atms.length === 0 ? (
            <EmptyState title="District operating normally" description="No critical technical issues require attention." />
          ) : (
            <div className="list-stack">
              {data.attention_atms.map((atm) => (
                <div className="list-card" key={atm.id}>
                  <div>
                    <Link to={`/atms/${atm.id}`}><strong>{atm.reference}</strong></Link>
                    <small>{atm.branch} {atm.active_incident ? `· ${atm.active_incident}` : ''}</small>
                    <small>Last seen: {atm.last_checked ? new Date(atm.last_checked).toLocaleString() : 'Not yet checked'}</small>
                    <div className="row-actions" style={{ marginTop: 8 }}>
                      {atm.active_incident_id ? (
                        <Link className="button secondary small" to={`/incidents/${atm.active_incident_id}`}>
                          View Incident
                        </Link>
                      ) : (
                        <Link className="button secondary small" to={`/incidents?atm=${atm.id}&new=1`}>
                          Report Issue
                        </Link>
                      )}
                      <Link className="button secondary small" to={`/atms/${atm.id}`}>
                        Investigate
                      </Link>
                    </div>
                  </div>
                  <div className="badge-group">
                    <StatusBadge value={atm.status} />
                    <StatusBadge value={atm.health} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>Live ATM Table</h2>
            <p>Current district ATM fleet with network, hardware and active incident status.</p>
          </div>
          <Link className="text-link" to="/atms">View all ATMs</Link>
        </div>
        {atms.isLoading ? <LoadingState label="Loading ATM fleet..." /> : null}
        {atms.isError ? <ErrorState message="Unable to load ATM table." /> : null}
        {!atms.isLoading && !atms.isError && fleet.length === 0 ? (
          <EmptyState title="No ATMs registered" description="ATM units will appear here once they are registered for this district." />
        ) : null}
        {!atms.isLoading && !atms.isError && fleet.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ATM</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Network</th>
                  <th>Hardware</th>
                  <th>Active Incident</th>
                  <th>Last Check</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {fleet.slice(0, 12).map((atm) => (
                  <tr key={atm.id}>
                    <td>
                      <Link to={`/atms/${atm.id}`}><strong>{atm.reference}</strong></Link>
                      <small>{atm.name || 'ATM unit'}</small>
                    </td>
                    <td>{atm.branch_name}</td>
                    <td><StatusBadge value={atm.status} /></td>
                    <td><StatusBadge value={atm.network_status} /></td>
                    <td><StatusBadge value={atm.hardware_status} /></td>
                    <td>
                      {atm.active_incident ? (
                        <Link to={`/incidents/${atm.active_incident.id}`}>{atm.active_incident.incident_number}</Link>
                      ) : '—'}
                    </td>
                    <td>{atm.last_checked ? new Date(atm.last_checked).toLocaleString() : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="button secondary small" to={`/atms/${atm.id}`}>View</Link>
                        <Link
                          className="button secondary small"
                          to={atm.active_incident ? `/incidents/${atm.active_incident.id}` : `/incidents?atm=${atm.id}&new=1`}
                        >
                          Investigate
                        </Link>
                        {hasPermission(currentUser, 'incident.create') ? (
                          <Link className="button secondary small" to={`/incidents?atm=${atm.id}&new=1`}>Report Issue</Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </article>

      <div className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Active Incidents</h2>
              <p>Who is handling incidents and which ones are critical or escalated.</p>
            </div>
            <Link className="text-link" to="/incidents">View all</Link>
          </div>
          {data.recent_incidents.length === 0 ? (
            <EmptyState title="No active incidents" description="All ATMs are currently operating without reported technical issues." />
          ) : (
            <div className="list-stack">
              {data.recent_incidents.map((incident) => (
                <Link className="list-card" to={`/incidents/${incident.id}`} key={incident.id}>
                  <div>
                    <strong>{incident.incident_id}</strong>
                    <small>{incident.atm_reference} · {incident.title}</small>
                    <small>{incident.assigned_to_name || 'Unassigned'} · {new Date(incident.created_at).toLocaleString()}</small>
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
              <h2>Recent Technical Actions</h2>
              <p>Chronological technical work performed on incidents.</p>
            </div>
          </div>
          {data.recent_actions.length === 0 ? (
            <EmptyState title="No technical actions yet" description="Troubleshooting activity will appear here as technicians record it." />
          ) : (
            <div className="timeline">
              {data.recent_actions.map((action) => (
                <div className="timeline-item" key={action.id}>
                  <div className="timeline-dot" />
                  <div>
                    <strong>{action.action}</strong>
                    <small>{action.atm} · {action.incident_id} · {action.technician}</small>
                    <small>{action.result || 'Result not yet recorded'} · {new Date(action.created_at).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <div className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Technician Workload</h2>
              <p>Who is currently handling district incidents.</p>
            </div>
          </div>
          {data.technician_workload.length === 0 ? (
            <EmptyState title="No incident ownership yet" description="Assignments appear here once incidents are assigned." />
          ) : (
            <div className="stat-list">
              {data.technician_workload.map((tech) => (
                <div className="stat-row" key={tech.id}>
                  <div>
                    <strong>{tech.name}</strong>
                    <small>{tech.critical_incidents} critical incidents</small>
                  </div>
                  <span>{tech.assigned_incidents}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent ATM Status Changes</h2>
              <p>Logged status history from the backend.</p>
            </div>
          </div>
          {data.recent_status_changes.length === 0 ? (
            <EmptyState title="No status changes recorded" description="ATM status history will appear here after updates are logged." />
          ) : (
            <div className="timeline">
              {data.recent_status_changes.map((row) => (
                <div className="timeline-item" key={row.id}>
                  <div className="timeline-dot" />
                  <div>
                    <strong>{row.atm_reference}</strong>
                    <small>{row.old_status} to {row.new_status}</small>
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

function MetricCard({ label, value, note, tone = 'default' }: { label: string; value: number; note: string; tone?: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
