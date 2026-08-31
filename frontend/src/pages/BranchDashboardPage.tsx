import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CircleAlert, ClipboardList, Landmark, PlusCircle, Wifi } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { listResource } from '../lib/utils';
import { useNow } from '../lib/useNow';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { DualStatus, PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';
import { Panel } from '../components/ui/Panel';
import { ChartLegend, DonutChart, Sparkline, statusColor, TrendChart } from '../components/ui/Charts';
import type { ATM, BranchReport, DashboardSummary, Incident } from '../types/api';

function relativeTime(iso?: string, now = Date.now()) {
  if (!iso) return 'unknown';
  const diff = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function BranchDashboardPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const summary = useQuery({
    queryKey: ['dashboard-summary', 'branch'],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((r) => r.data),
  });
  const atms = useQuery({
    queryKey: ['branch-atms'],
    queryFn: () => listResource<ATM>('/atms/?ordering=reference'),
  });
  const reports = useQuery({
    queryKey: ['branch-reports-mine'],
    queryFn: () => listResource<BranchReport>('/branch-reports/?ordering=-created_at'),
  });
  const incidents = useQuery({
    queryKey: ['branch-incidents'],
    queryFn: () => listResource<Incident>('/incidents/?ordering=-created_at'),
  });

  const refetchDashboard = () => {
    summary.refetch();
    atms.refetch();
    reports.refetch();
    incidents.refetch();
  };

  const fleet = atms.data || [];
  const statusSegments = useMemo(() => {
    const order = ['OPERATIONAL', 'WARNING', 'DEGRADED', 'FAULT', 'OFFLINE', 'CRITICAL', 'MAINTENANCE', 'UNDER_REPAIR'];
    return order
      .map((s) => ({ label: s.replaceAll('_', ' '), value: fleet.filter((a) => a.status === s).length, color: statusColor(s) }))
      .filter((s) => s.value > 0);
  }, [atms.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const healthSpark = useMemo(
    () => (atms.data || []).map((a) => (a.status === 'OPERATIONAL' ? 1 : 0)).slice(-14),
    [atms.data],
  );

  const incidentTrend = useMemo(
    () => summary.data?.trends?.incidents || [],
    [summary.data],
  );

  if (summary.isLoading || atms.isLoading || reports.isLoading || incidents.isLoading) return <LoadingState label="Loading branch ATM portal..." />;
  if (summary.isError || atms.isError || reports.isError || incidents.isError || !summary.data) {
    return <ErrorState message="Unable to load the branch dashboard. Please try again." onRetry={refetchDashboard} />;
  }

  const openReports = (reports.data || []).filter((r) =>
    !['CLOSED', 'DISMISSED', 'VERIFIED', 'RESOLVED'].includes(r.status),
  );
  const operational = fleet.filter((a) => a.status === 'OPERATIONAL').length;
  const faults = fleet.filter((a) => ['FAULT', 'CRITICAL', 'WARNING', 'DEGRADED'].includes(a.status)).length;
  const offline = fleet.filter((a) => a.status === 'OFFLINE').length;
  const activeIncidents = (incidents.data || []).filter((i) => i.status !== 'CLOSED').slice(0, 5);
  const availability = fleet.length ? Math.round((operational / fleet.length) * 100) : 0;

  const branchName = currentUser?.branch_name || summary.data.district_name;

  return (
    <section className="page-content">
      <div className="portal-hero">
        <div>
          <p className="page-kicker">Branch ATM Operations</p>
          <h1>{branchName}</h1>
          <p className="page-copy">View your branch ATMs, report faults, and track incident resolution in real time.</p>
          <span className="live-updated">
            <span className="live-dot" />
            {fleet.length} ATM{fleet.length === 1 ? '' : 's'} · updated {relativeTime(summary.data.last_updated, now)}
          </span>
        </div>
        <div className="page-actions">
          <span className={`health-pill ${availability >= 90 ? 'ok' : 'danger'}`}>
            <Wifi size={13} /> {availability}% healthy
          </span>
          <Link className="button primary" to="/branch/report">
            <AlertTriangle size={16} /> Report ATM Problem
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <div className="quick-actions" aria-label="Quick actions">
        <Link className="quick-action" to="/branch/report">
          <AlertTriangle size={14} /> Report Problem
        </Link>
        <Link className="quick-action" to="/branch/atms">
          <Wifi size={14} /> My ATMs
        </Link>
        <Link className="quick-action" to="/branch/reports">
          <ClipboardList size={14} /> My Reports
        </Link>
        {faults > 0 && (
          <Link className="quick-action" to="/branch/atms">
            <CircleAlert size={14} /> {faults} ATM{faults > 1 ? 's' : ''} need attention
          </Link>
        )}
      </div>

      <div className="kpi-grid branch-kpi-grid" aria-label="Branch ATM summary">
        <MetricCard label="Total ATMs" value={fleet.length} icon={<Landmark size={18} />} hint="assigned to branch" />
        <MetricCard label="Operational" value={operational} tone="success" icon={<Wifi size={18} />} delta={{ up: availability >= 90, label: `${availability}%` }} hint="of fleet" />
        <MetricCard label="Faults" value={faults} tone="danger" icon={<CircleAlert size={18} />} delta={faults > 0 ? { up: false, label: 'needs attention' } : { up: true, label: 'all clear' }} hint="degraded or fault" />
        <MetricCard label="Offline" value={offline} tone={offline > 0 ? 'warning' : 'default'} icon={<Wifi size={18} />} hint="not communicating" />
        <MetricCard label="Open reports" value={openReports.length} tone="info" icon={<ClipboardList size={18} />} hint="being reviewed" />
      </div>

      <div className="dashboard-charts-row">
        <Panel title="Branch ATM Health" subtitle="Technical status of ATM units at your branch.">
          {fleet.length === 0 ? (
            <EmptyState title="No ATMs assigned" description="ATM health appears once units are assigned." />
          ) : (
            <div className="donut-wrap">
              <DonutChart
                segments={statusSegments}
                centerValue={`${availability}%`}
                centerLabel="operational"
              />
              <ChartLegend segments={statusSegments} total={fleet.length} />
            </div>
          )}
          {healthSpark.length > 1 ? (
            <div className="panel-foot">
              <span className="panel-foot-label">Operational snapshot</span>
              <Sparkline values={healthSpark} color="#16a34a" />
            </div>
          ) : null}
        </Panel>

        <Panel title="Service Overview" subtitle="How your branch ATM service is performing.">
          <div className="stat-list">
            <div className="stat-row">
              <div>
                <strong>Operational</strong>
                <small>Serving customers normally</small>
              </div>
              <span style={{ color: 'var(--success)' }}>{operational}</span>
            </div>
            <div className="stat-row">
              <div>
                <strong>Faults & warnings</strong>
                <small>Degraded, fault or critical</small>
              </div>
              <span style={{ color: 'var(--danger)' }}>{faults}</span>
            </div>
            <div className="stat-row">
              <div>
                <strong>Offline</strong>
                <small>Communication lost</small>
              </div>
              <span style={{ color: 'var(--text-3)' }}>{offline}</span>
            </div>
            <div className="stat-row">
              <div>
                <strong>Active incidents</strong>
                <small>Currently being resolved</small>
              </div>
              <span style={{ color: 'var(--info)' }}>{activeIncidents.length}</span>
            </div>
            <div className="stat-row">
              <div>
                <strong>Open reports</strong>
                <small>Awaiting review</small>
              </div>
              <span style={{ color: 'var(--warning)' }}>{openReports.length}</span>
            </div>
          </div>
        </Panel>

        <Panel
          className="panel-wide"
          title="My ATM Status"
          subtitle="Current technical status of ATMs at your branch."
          action={<Link className="text-link" to="/branch/atms">View all</Link>}
        >
          {fleet.length === 0 ? (
            <EmptyState title="No ATMs assigned" description="No ATMs are registered for your branch." />
          ) : (
            <div className="monitor-grid">
              {fleet.slice(0, 8).map((atm) => (
                <Link className="monitor-card" key={atm.id} to={`/branch/atms/${atm.id}`}>
                  <div className="monitor-card-head">
                    <strong>{atm.reference}</strong>
                    <DualStatus active={atm.is_active !== false} technical={atm.status} />
                  </div>
                  <small>{atm.location || atm.name || atm.model || 'Branch ATM'}</small>
                  <small>
                    {atm.active_incident
                      ? `${atm.active_incident.title} · ${atm.active_incident.status}`
                      : 'No active incident'}
                  </small>
                  <div className="row-actions">
                    <span className="button secondary small">View Status</span>
                    <button
                      type="button"
                      className="button primary small"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        navigate(`/branch/report?atm=${atm.id}`);
                      }}
                    >
                      <PlusCircle size={11} /> Report
                    </button>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {incidentTrend.length > 1 ? (
        <Panel
          className="panel-wide"
          title="14-Day Incident Activity"
          subtitle="Incident volume affecting this branch over the last two weeks."
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
          <div className="panel-foot">
            <span className={`health-pill ${availability >= 90 ? 'ok' : 'danger'}`}>{availability}% healthy today</span>
            <span className="panel-foot-label">{activeIncidents.length} active incidents affecting your ATMs.</span>
          </div>
        </Panel>
      ) : null}

      <div className="content-grid">
        <Panel
          title="Active Reports"
          subtitle="Reports still being reviewed or worked."
          action={<Link className="text-link" to="/branch/reports">My reports</Link>}
        >
          {openReports.length === 0 ? (
            <EmptyState title="No open reports" description="Submitted ATM problem reports appear here." />
          ) : (
            <div className="list-stack">
              {openReports.slice(0, 6).map((report) => (
                <Link className="list-card" to={`/branch/reports/${report.id}`} key={report.id}>
                  <div>
                    <strong>{report.report_id}</strong>
                    <small>{report.atm_reference} · {report.problem_type.replaceAll('_', ' ')}</small>
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

        <Panel title="ATM Service Status" subtitle="Linked incidents affecting your branch ATMs.">
          {activeIncidents.length === 0 ? (
            <EmptyState title="No active incidents" description="Service restorations and progress will appear here." />
          ) : (
            <div className="list-stack">
              {activeIncidents.map((incident) => (
                <div className="list-card" key={incident.id}>
                  <div>
                    <strong>{incident.incident_id}</strong>
                    <small>{incident.atm_reference} · {incident.title}</small>
                    <small>{incident.assigned_to_name || 'Awaiting assignment'}</small>
                  </div>
                  <div className="badge-group">
                    <PriorityBadge value={incident.priority} />
                    <StatusBadge value={incident.status} />
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