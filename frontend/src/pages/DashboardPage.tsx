import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ClipboardList,
  FileBarChart2,
  Landmark,
  ShieldAlert,
  Users,
  Wrench,
} from 'lucide-react';

import { hasPermission, useAuth } from '../context/AuthContext';
import { FIXED_DISTRICT_NAME } from '../lib/navigation';
import { api } from '../lib/api';
import { formatDuration } from '../lib/utils';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { DualStatus, PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';
import { Panel } from '../components/ui/Panel';
import { BarList, ChartLegend, DonutChart, Sparkline, statusColor, TrendChart } from '../components/ui/Charts';
import type { ATM, DashboardSummary } from '../types/api';

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function relativeTime(iso?: string) {
  if (!iso) return 'unknown';
  const diff = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function DashboardPage() {
  const { currentUser } = useAuth();
  const [tick, setTick] = useState(0);
  const summary = useQuery({
    queryKey: ['dashboard-summary', tick],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((response) => response.data),
    refetchInterval: 60000,
  });
  const atms = useQuery({
    queryKey: ['dashboard-atms'],
    queryFn: () => list<ATM>('/atms/?ordering=reference'),
  });

  const statusSegments = useMemo(() => {
    const data = summary.data;
    if (!data) return [];
    const order = ['OPERATIONAL', 'WARNING', 'DEGRADED', 'FAULT', 'OFFLINE', 'CRITICAL', 'MAINTENANCE', 'UNDER_REPAIR'];
    return order
      .map((s) => ({ label: s.replaceAll('_', ' '), value: data.atm_status[s] || 0, color: statusColor(s) }))
      .filter((s) => s.value > 0);
  }, [summary.data]);

  const incidentSpark = useMemo(
    () => (summary.data?.trends?.incidents || []).map((d) => d.created),
    [summary.data],
  );

  const availTrend = useMemo(() => {
    const totalUnits = summary.data?.total_atms ?? summary.data?.atms ?? 0;
    if (!totalUnits) return [];
    let open = 0;
    return (summary.data?.trends?.incidents || []).map((d) => {
      open = Math.max(0, open + d.created - d.resolved);
      const value = Math.max(0, Math.min(100, Math.round(((totalUnits - open) / totalUnits) * 100)));
      return { date: d.date, label: d.label, value };
    });
  }, [summary.data]);

  if (summary.isLoading) return <LoadingState label="Loading ATM district dashboard..." />;
  if (summary.isError || !summary.data) {
    return (
      <ErrorState
        message="Unable to load ATM dashboard data. Please try again."
        onRetry={() => summary.refetch()}
      />
    );
  }

  const data = summary.data;
  const total = data.total_atms ?? data.atms;
  const active = data.active_atms ?? total;
  const inactive = data.inactive_atms ?? 0;
  const critical = data.critical_atms ?? data.atm_status.CRITICAL ?? 0;
  const pendingReports = data.pending_branch_reports ?? 0;
  const underRepair = data.under_repair ?? data.atm_status.UNDER_REPAIR ?? 0;
  const fleet = atms.data || [];
  const faults = data.active_faults || [];
  const availability = total ? Math.round((active / total) * 100) : 0;
  const incidentTrend = data.trends?.incidents || [];
  const workload = data.technician_workload || [];
  const maintenance = data.maintenance_kpis;
  const priorityBars = [
    { label: 'Critical', value: data.incidents_by_priority?.CRITICAL ?? 0, color: '#dc2626' },
    { label: 'High', value: data.incidents_by_priority?.HIGH ?? 0, color: '#ea580c' },
    { label: 'Medium', value: data.incidents_by_priority?.MEDIUM ?? 0, color: '#d97706' },
    { label: 'Low', value: data.incidents_by_priority?.LOW ?? 0, color: '#2563eb' },
  ];
  const priorities = data.incidents_by_priority || {};
  const openTotal = Object.values(priorities).reduce<number>((a, b) => a + (typeof b === 'number' ? b : 0), 0);

  return (
    <section className="page-content">
      <div className="portal-hero">
        <div>
          <p className="page-kicker">ATM District Operations · {todayLabel()}</p>
          <h1>{greeting()}, {currentUser?.full_name?.split(' ')[0] || 'Operator'}</h1>
          <p className="page-copy">
            Live view of {FIXED_DISTRICT_NAME} — ATM availability, critical faults, incidents and maintenance.
          </p>
          <span className="live-updated">
            <span className="live-dot" />
            Updated {relativeTime(data.last_updated)}
          </span>
        </div>
        <div className="page-actions">
          <span className={`health-pill ${availability >= 90 ? 'ok' : 'danger'}`}>
            <Activity size={13} /> {availability}% availability
          </span>
          <button
            className="button ghost light"
            onClick={() => {
              summary.refetch();
              atms.refetch();
              setTick((t) => t + 1);
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="quick-actions" aria-label="Quick actions">
        <Link className="quick-action" to="/incidents?new=1"><AlertTriangle size={14} /> Create Incident</Link>
        <Link className="quick-action" to="/branch-reports?pending=1"><ClipboardList size={14} /> Review Reports</Link>
        <Link className="quick-action" to="/monitoring"><Activity size={14} /> Live Monitoring</Link>
        <Link className="quick-action" to="/active-faults?priority=CRITICAL"><ShieldAlert size={14} /> Critical Faults</Link>
      </div>

      <div className="kpi-grid kpi-grid-8" aria-label="District ATM summary">
        <MetricCard label="Total ATMs" value={total} to="/atms" icon={<Activity size={18} />} hint="registered units" />
        <MetricCard label="Active" value={active} to="/atms?active=1" tone="success" icon={<CheckCircle2 size={18} />} hint={`${availability}% of fleet`} />
        <MetricCard label="Inactive" value={inactive} to="/atms?active=0" icon={<Activity size={18} />} hint="currently offline" />
        <MetricCard label="Critical" value={critical} to="/active-faults?priority=CRITICAL" tone="danger" icon={<ShieldAlert size={18} />} hint="need attention" />
        <MetricCard label="Open incidents" value={data.open_incidents} to="/incidents?open=1" tone="warning" icon={<AlertTriangle size={18} />} hint={`${data.critical_incidents} critical`} />
        <MetricCard label="Resolved today" value={data.resolved_today} to="/incidents?status=RESOLVED" tone="success" icon={<CheckCircle2 size={18} />} hint="incidents closed" />
        <MetricCard label="Pending reports" value={pendingReports} to="/branch-reports?pending=1" tone="warning" icon={<ClipboardList size={18} />} hint="awaiting review" />
        <MetricCard label="Under repair" value={underRepair} to="/maintenance?status=UNDER_REPAIR" tone="danger" icon={<Wrench size={18} />} hint="being serviced" />
      </div>

      <div className="dashboard-charts-row">
        <Panel
          title="Fleet Health"
          subtitle="Technical status across the district fleet."
          action={<span className={`health-pill ${availability >= 90 ? 'ok' : 'danger'}`}>{availability}% available</span>}
        >
          {total === 0 ? (
            <EmptyState title="No ATMs registered" description="ATMs will appear here once registered." />
          ) : (
            <div className="donut-wrap">
              <DonutChart
                segments={statusSegments}
                centerValue={`${availability}%`}
                centerLabel="available"
              />
              <ChartLegend segments={statusSegments} total={total} />
            </div>
          )}
          {incidentSpark.length > 1 ? (
            <div className="panel-foot">
              <span className="panel-foot-label">Incident trend</span>
              <Sparkline values={incidentSpark} color="#3b4fd8" />
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Incidents by Priority"
          subtitle="Open incidents currently being worked."
          action={<Link className="text-link" to="/incidents?open=1">View all</Link>}
        >
          {openTotal === 0 ? (
            <EmptyState title="No open incidents" description="All ATMs are running without open incidents." />
          ) : (
            <BarList rows={priorityBars} />
          )}
        </Panel>

        <Panel
          className="panel-wide"
          title="14-Day Incident Activity"
          subtitle="Created vs resolved incidents over the last two weeks."
          action={
            <div className="badge-group">
              <span className="legend-row" style={{ display: 'inline-flex' }}><i style={{ width: 10, height: 10, borderRadius: 999, background: '#3b4fd8' }} /><span>Created</span></span>
              <span className="legend-row" style={{ display: 'inline-flex' }}><i style={{ width: 10, height: 10, borderRadius: 999, background: '#16a34a' }} /><span>Resolved</span></span>
            </div>
          }
        >
          <div className="trend-duo">
            <TrendChart
              series={incidentTrend.map((d) => ({ date: d.date, label: d.label, value: d.created }))}
              color="#3b4fd8"
            />
            <TrendChart
              series={incidentTrend.map((d) => ({ date: d.date, label: d.label, value: d.resolved }))}
              color="#16a34a"
            />
          </div>
        </Panel>
      </div>

      {availTrend.length > 1 ? (
        <Panel
          className="panel-wide"
          title="14-Day ATM Availability"
          subtitle="Modelled daily fleet availability from the open incident backlog."
          action={
            <div className="badge-group">
              <span className="legend-row" style={{ display: 'inline-flex' }}><i style={{ width: 10, height: 10, borderRadius: 999, background: '#16a34a' }} /><span>Available %</span></span>
              <span className="legend-row" style={{ display: 'inline-flex' }}><i style={{ width: 10, height: 10, borderRadius: 999, background: '#2563eb' }} /><span>Target 95%</span></span>
            </div>
          }
        >
          <TrendChart series={availTrend} color="#16a34a" />
          <div className="panel-foot">
            <span className={`health-pill ${availability >= 90 ? 'ok' : 'danger'}`}>{availability}% current availability</span>
            <span className="panel-foot-label">Based on {total} registered ATMs and currently open incidents.</span>
          </div>
        </Panel>
      ) : null}

      {maintenance ? (
        <Panel
          title="Maintenance Pipeline"
          subtitle="Scheduled and active maintenance workload."
          icon={<Briefcase size={15} />}
          action={
            <>
              <span className="pipeline-overdue">Overdue {maintenance.overdue ?? 0}</span>
              <Link className="text-link" to="/maintenance">Open</Link>
            </>
          }
          tone={maintenance.overdue ? 'danger' : undefined}
        >
          <div className="stat-chips">
            <span className="stat-chip"><Landmark size={14} /><span>Total jobs</span><b>{maintenance.total ?? 0}</b></span>
            <span className="stat-chip"><span>Pending</span><b>{maintenance.pending ?? 0}</b></span>
            <span className="stat-chip"><span>Assigned</span><b>{maintenance.assigned ?? 0}</b></span>
            <span className="stat-chip"><Wrench size={14} /><span>In progress</span><b>{maintenance.in_progress ?? 0}</b></span>
            <span className="stat-chip"><AlertTriangle size={14} /><span>Under repair</span><b>{maintenance.under_repair ?? 0}</b></span>
            <span className="stat-chip"><span>Testing</span><b>{maintenance.testing ?? 0}</b></span>
            <span className="stat-chip"><CheckCircle2 size={14} /><span>Completed</span><b>{maintenance.completed ?? 0}</b></span>
            <span className="stat-chip"><ShieldAlert size={14} /><span>Emergency</span><b>{maintenance.emergency ?? 0}</b></span>
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Critical Action Center"
        subtitle="ATMs in critical condition — immediate attention required."
        action={<Link className="text-link" to="/active-faults?priority=CRITICAL">View all</Link>}
        tone="danger"
      >
        {data.attention_atms.length === 0 ? (
          <EmptyState title="No critical ATM issues" description="All monitored ATMs are currently operating normally." />
        ) : (
          <div className="critical-grid">
            {data.attention_atms.map((atm) => (
              <div className="critical-card" key={atm.id}>
                <div className="critical-card-head">
                  <div>
                    <Link to={`/atms/${atm.id}`}><strong>{atm.reference}</strong></Link>
                    <small>{atm.branch}</small>
                  </div>
                  <StatusBadge value="CRITICAL" />
                </div>
                <p className="critical-problem">{atm.problem || 'Critical ATM condition'}</p>
                <div className="meta-grid">
                  <div>
                    <span>Incident</span>
                    <strong>{atm.active_incident || '—'}</strong>
                  </div>
                  <div>
                    <span>Duration</span>
                    <strong>{formatDuration(atm.duration_minutes)}</strong>
                  </div>
                  <div>
                    <span>Assigned</span>
                    <strong>{atm.assigned || 'Unassigned'}</strong>
                  </div>
                </div>
                <div className="row-actions">
                  <Link className="button secondary small" to={`/atms/${atm.id}`}>View ATM</Link>
                  {atm.active_incident_id ? (
                    <Link className="button primary small" to={`/incidents/${atm.active_incident_id}`}>Open Incident</Link>
                  ) : hasPermission(currentUser, 'incident.create') ? (
                    <Link className="button primary small" to={`/incidents?atm=${atm.id}&new=1`}>Create Incident</Link>
                  ) : null}
                  {atm.active_incident_id && hasPermission(currentUser, 'incident.escalate') ? (
                    <Link className="button secondary small" to={`/incidents/${atm.active_incident_id}?action=escalate`}>Escalate</Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="content-grid">
        <Panel
          title="Active Faults"
          subtitle="ATMs in warning, fault, offline or critical condition."
          action={<Link className="text-link" to="/active-faults">View all faults</Link>}
        >
          {faults.length === 0 ? (
            <EmptyState title="No active ATM faults" description="All monitored ATMs are currently operating normally." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ATM</th>
                    <th>Branch</th>
                    <th>Fault</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Reported</th>
                    <th>Assigned</th>
                    <th>Duration</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {faults.slice(0, 6).map((row) => (
                    <tr key={row.id}>
                      <td><Link to={`/atms/${row.id}`}><strong>{row.reference}</strong></Link></td>
                      <td>{row.branch}</td>
                      <td style={{ textTransform: 'capitalize' }}>{row.fault.replaceAll('_', ' ')}</td>
                      <td><PriorityBadge value={row.priority} /></td>
                      <td><StatusBadge value={row.status} /></td>
                      <td>{row.reported ? new Date(row.reported).toLocaleTimeString() : '—'}</td>
                      <td>{row.assigned || 'Unassigned'}</td>
                      <td>{formatDuration(row.duration_minutes)}</td>
                      <td>
                        <div className="row-actions">
                          <Link className="button secondary small" to={`/atms/${row.id}`}>View</Link>
                          {row.active_incident_id ? (
                            <Link className="button secondary small" to={`/incidents/${row.active_incident_id}`}>Investigate</Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Technician Workload"
          subtitle="Assigned load for the technical team."
          action={<Users size={16} />}
        >
          {workload.length === 0 ? (
            <EmptyState title="No assigned technicians" description="Technicians appear here once incidents are assigned." />
          ) : (
            <BarList
              rows={workload.slice(0, 6).map((t) => ({
                label: t.name,
                value: t.assigned_incidents,
                color: t.critical_incidents > 0 ? '#dc2626' : '#3b4fd8',
              }))}
            />
          )}
        </Panel>
      </div>

      <Panel
        title="Live ATM Monitoring"
        subtitle="Current district ATM fleet with technical status and active incidents."
        action={<Link className="text-link" to="/monitoring">Open live monitoring</Link>}
      >
        {atms.isLoading ? <LoadingState label="Loading ATM fleet..." /> : null}
        {atms.isError ? <ErrorState message="Unable to load ATM information." onRetry={() => atms.refetch()} /> : null}
        {!atms.isLoading && !atms.isError && fleet.length === 0 ? (
          <EmptyState title="No ATMs registered" description="ATM units will appear here once registered for this district." />
        ) : null}
        {!atms.isLoading && !atms.isError && fleet.length > 0 ? (
          <div className="monitor-grid">
            {fleet.slice(0, 12).map((atm) => (
              <Link to={`/atms/${atm.id}`} className="monitor-card" key={atm.id}>
                <div className="monitor-card-head">
                  <strong>{atm.reference}</strong>
                  <DualStatus active={atm.is_active !== false} technical={atm.status} />
                </div>
                <small>{atm.branch_name}</small>
                <div className="meta-grid compact">
                  <div>
                    <span>Health</span>
                    <strong style={{ color: statusColor(atm.health) }}>{atm.health.replaceAll('_', ' ')}</strong>
                  </div>
                  <div>
                    <span>Last check</span>
                    <strong>{atm.last_checked ? new Date(atm.last_checked).toLocaleTimeString() : '—'}</strong>
                  </div>
                </div>
                <small>
                  {atm.active_incident
                    ? `${atm.active_incident.incident_number} · ${atm.active_incident.status}`
                    : 'No active incident'}
                </small>
              </Link>
            ))}
          </div>
        ) : null}
      </Panel>

      <div className="content-grid">
        <Panel
          title="Recent Branch Reports"
          subtitle="Fault and crash reports submitted by branches."
          action={<Link className="text-link" to="/branch-reports">View all</Link>}
        >
          {(data.recent_branch_reports || []).length === 0 ? (
            <EmptyState title="No new branch reports" description="Branch ATM problem reports will appear here." />
          ) : (
            <div className="list-stack">
              {(data.recent_branch_reports || []).slice(0, 6).map((report) => (
                <Link className="list-card" to={`/branch-reports/${report.id}`} key={report.id}>
                  <div>
                    <strong>{report.report_id}</strong>
                    <small>{report.atm_reference} · {report.branch}</small>
                    <small>{report.problem_type.replaceAll('_', ' ')} · {new Date(report.created_at).toLocaleString()}</small>
                  </div>
                  <div className="badge-group">
                    <PriorityBadge value={report.severity} />
                    <StatusBadge value={report.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Active Incidents"
          subtitle="Open district incidents and ownership."
          action={<Link className="text-link" to="/incidents"><FileBarChart2 size={14} /> View all</Link>}
        >
          {data.recent_incidents.length === 0 ? (
            <EmptyState title="No open incidents" description="All ATMs are currently without open technical incidents." />
          ) : (
            <div className="list-stack">
              {data.recent_incidents.slice(0, 6).map((incident) => (
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
        </Panel>
      </div>

      <div className="content-grid">
        <Panel title="Recent Technical Actions" subtitle="Recorded troubleshooting and verification activity.">
          {data.recent_actions.length === 0 ? (
            <EmptyState title="No technical actions yet" description="Actions appear here as technicians record them." />
          ) : (
            <div className="timeline">
              {data.recent_actions.slice(0, 6).map((action) => (
                <div className="timeline-item" key={action.id}>
                  <div className="timeline-dot" />
                  <div>
                    <strong>{action.action}</strong>
                    <small>{action.atm} · {action.incident_id} · {action.technician}</small>
                    <small>{action.result || 'Result not recorded'} · {new Date(action.created_at).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent Status Changes" subtitle="Latest ATM status transitions across the district.">
          {data.recent_status_changes.length === 0 ? (
            <EmptyState title="No status changes yet" description="ATM status transitions will appear here." />
          ) : (
            <div className="list-stack">
              {data.recent_status_changes.slice(0, 6).map((row) => (
                <div className="list-card" key={row.id}>
                  <div>
                    <strong>{row.atm_reference}</strong>
                    <small>
                      <StatusBadge value={row.old_status} /> → <StatusBadge value={row.new_status} />
                    </small>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {row.changed_by_name ? <small>{row.changed_by_name}</small> : null}
                    <small>{new Date(row.created_at).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}