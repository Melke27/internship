import { useMemo, useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { BellRing, AlertTriangle, ArrowRight, Building2, CalendarClock, CheckCircle2, ClipboardList, Cpu, FileText, Globe, HardDrive, History, MapPin, RefreshCw, Server, ShieldAlert, TrendingUp, Wrench, Zap, Activity } from 'lucide-react';

import { api } from '../lib/api';
import { hasPermission, useAuth } from '../context/AuthContext';
import { showToast } from '../lib/toast';
import {
  formatDuration,
  formatIncidentDuration,
  incidentDurationMinutes,
  mediaUrl,
} from '../lib/utils';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { StatusBadge, PriorityBadge } from '../components/ui/StatusBadge';
import { EvidenceThumb, EvidenceLightbox } from '../components/ui/Evidence';
import ATMDialog from '../components/atms/ATMDialog';
import SetATMStatusDialog from '../components/atms/SetATMStatusDialog';
import type { ATM, BranchReport, Incident, Maintenance } from '../types/api';

function list<T>(path: string) {
  return api
    .get<T[] | { results: T[] }>(path)
    .then((r) => (Array.isArray(r.data) ? r.data : r.data.results));
}

type StatusHistory = {
  id: number;
  old_status: string;
  new_status: string;
  changed_by_name: string | null;
  reason: string;
  created_at: string;
};

/** Colour a status label the same way StatusBadge does — inline. */
function statusColor(s: string): string {
  s = (s || '').toLowerCase();
  if (['operational', 'online', 'active', 'normal', 'available'].includes(s)) return 'var(--success)';
  if (['fault', 'critical', 'offline', 'error', 'communication_problem'].includes(s)) return 'var(--danger)';
  if (['warning', 'degraded', 'maintenance'].includes(s)) return 'var(--warning)';
  if (['in_progress', 'under_repair', 'testing'].includes(s)) return 'var(--info)';
  return 'var(--text-3)';
}

/** Status signal card — used in the Technical Status panel. */
function SignalCard({
  icon,
  label,
  value,
  raw,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  raw?: string;
}) {
  const color = raw ? statusColor(raw) : undefined;
  return (
    <div className="signal-card">
      <div className="signal-icon" style={color ? { color, background: `${color}18` } : undefined}>
        {icon}
      </div>
      <div className="signal-body">
        <span className="signal-label">{label}</span>
        <strong className="signal-value">{value}</strong>
      </div>
    </div>
  );
}

export default function ATMDetailsPage() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  
  // Validate ATM id - fallback to /atms list if invalid or missing
  const idNum = Number(id);
  if (isNaN(idNum) || idNum <= 0) {
    return <div className="error-page"><h1>ATM not found</h1><p>The requested ATM could not be loaded. It may have been deactivated or removed.</p><Link className="button primary" to="/atms">Return to ATM List</Link></div>;
  }
  
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  const atm = useQuery({
    queryKey: ['atm', id],
    queryFn: () => api.get<ATM>(`/atms/${id}/`).then((r) => r.data),
    enabled: Boolean(id),
  });
  const incidents = useQuery({
    queryKey: ['atm-incidents', id],
    queryFn: () => list<Incident>(`/atms/${id}/incidents/`),
    enabled: Boolean(id),
  });
  const history = useQuery({
    queryKey: ['atm-history', id],
    queryFn: () => list<StatusHistory>(`/atms/${id}/status_history/`),
    enabled: Boolean(id),
  });
  const maintenance = useQuery({
    queryKey: ['atm-maintenance', id],
    queryFn: () => list<Maintenance>(`/atms/${id}/maintenance/`),
    enabled: Boolean(id),
  });
  const reports = useQuery({
    queryKey: ['atm-reports', id],
    queryFn: () => list<BranchReport>(`/branch-reports/?atm=${id}&ordering=-created_at`),
    enabled: Boolean(id),
  });

  async function refreshAll() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['atm', id] }),
      queryClient.invalidateQueries({ queryKey: ['atm-incidents', id] }),
      queryClient.invalidateQueries({ queryKey: ['atm-history', id] }),
      queryClient.invalidateQueries({ queryKey: ['atm-maintenance', id] }),
      queryClient.invalidateQueries({ queryKey: ['atm-reports', id] }),
    ]);
    setRefreshing(false);
  }

  /* ── derived values ─────────────────────────────── */
  const rawRecord = atm.data;
  const openIncidents = (incidents.data || []).filter(
    (i) => !['RESOLVED', 'VERIFIED', 'CLOSED'].includes(i.status),
  );
  const criticalOpen = openIncidents.filter((i) => i.priority === 'CRITICAL').length;
  const activeMaint = (maintenance.data || []).filter(
    (m) => !['COMPLETED', 'VERIFIED', 'CANCELLED'].includes(m.status),
  );

  const overallHealthy = ['OPERATIONAL', 'AVAILABLE', 'NORMAL', 'ONLINE'].includes(
    (rawRecord?.status || '').toUpperCase(),
  );

  /* Powered-down or fault minutes contributed by each source */
  const incidentDownMinutes = (incidents.data || []).reduce((sum, i) => {
    const closed = ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(i.status);
    if (closed && i.duration_minutes != null) return sum + i.duration_minutes;
    if (closed && !i.duration_minutes) return sum + (incidentDurationMinutes(i) ?? 0);
    // Open incidents count from creation to now while the ATM is non-operational
    if (!closed) return sum + (incidentDurationMinutes(i) ?? 0);
    return sum;
  }, 0);
  const maintenanceDownMinutes = (maintenance.data || []).reduce((sum, m) => {
    // Only mutually exclusive, closed jobs with real bounds count toward downtime
    if (!m.start_date || !m.end_date) return sum;
    if (!['COMPLETED', 'VERIFIED'].includes(m.status)) return sum;
    const start = new Date(m.start_date).getTime();
    const end = new Date(m.end_date).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return sum;
    return sum + Math.round((end - start) / 60000);
  }, 0);

  /* Approximate uptime over the last 30 days, excluding fully-open gaps */
  const downMinutes = incidentDownMinutes + maintenanceDownMinutes;
  const availability = Math.max(
    0,
    Math.round((1 - Math.min(downMinutes, 30 * 24 * 60) / (30 * 24 * 60)) * 1000) / 10,
  );

  const photoHref = mediaUrl(rawRecord?.photo);
  const activity = useMemo(() => {
    type Line = { ts: number; key: string; kind: 'status' | 'incident' | 'maintenance' | 'report'; node: ReactNode };
    const lines: Line[] = [];

    (history.data || []).forEach((row) => {
      const ts = new Date(row.created_at).getTime();
      if (Number.isFinite(ts)) {
        lines.push({
          ts,
          key: `s-${row.id}`,
          kind: 'status',
          node: (
            <div className="timeline-transition">
              <StatusBadge value={row.old_status} />
              <ArrowRight size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              <StatusBadge value={row.new_status} />
            </div>
          ),
        });
      }
    });
    (incidents.data || []).forEach((i) => {
      const ts = new Date(i.created_at).getTime();
      if (Number.isFinite(ts)) {
        lines.push({
          ts,
          key: `i-${i.id}`,
          kind: 'incident',
          node: (
            <Link className="text-link" to={`/incidents/${i.id}`}>
              {i.incident_id} — {i.title || i.category?.replaceAll('_', ' ') || 'Incident'}
            </Link>
          ),
        });
      }
    });
    (maintenance.data || []).forEach((m) => {
      const ts = new Date(m.created_at).getTime();
      if (Number.isFinite(ts)) {
        lines.push({
          ts,
          key: `m-${m.id}`,
          kind: 'maintenance',
          node: (
            <>
              <strong>{m.maintenance_id || `MJ-${m.id}`}</strong>
              <span className="muted-inline">{m.maintenance_type?.replaceAll('_', ' ')} maintenance</span>
            </>
          ),
        });
      }
    });
    (reports.data || []).forEach((r) => {
      const ts = new Date(r.created_at).getTime();
      if (Number.isFinite(ts)) {
        lines.push({
          ts,
          key: `r-${r.id}`,
          kind: 'report',
          node: (
            <Link className="text-link" to={`/branch-reports/${r.id}`}>
              {r.report_id} — {r.problem_type?.replaceAll('_', ' ')}
            </Link>
          ),
        });
      }
    });

    return lines
      .map((l) => ({ ...l, time: new Date(l.ts).toLocaleString() }))
      .sort((a, b) => b.ts - a.ts);
  }, [history.data, incidents.data, maintenance.data, reports.data]);

  if (atm.isLoading) return <LoadingState label="Loading ATM detail..." />;
  if (atm.isError || !atm.data)
    return <ErrorState message="Unable to load ATM detail. Please try again." onRetry={() => atm.refetch()} />;

  const record = atm.data;

  return (
    <section className="page-content">
      {/* ── Hero banner ───────────────────────────── */}
      <div className="atm-detail-hero">
        <div className="atm-detail-hero-body">
          <p className="page-kicker">
            {record.district_name} · ATM Asset
          </p>
          <h1>{record.reference}</h1>
          <p className="page-copy">
            {record.name || 'ATM unit'} &nbsp;·&nbsp; {record.branch_name}
            {record.location ? <> &nbsp;·&nbsp; {record.location}</> : null}
          </p>
          <div className="atm-hero-badges">
            <StatusBadge value={record.status} />
            <StatusBadge value={record.health} />
            {record.is_active === false && (
              <span className="status-badge status-inactive">Inactive</span>
            )}
            {criticalOpen > 0 && (
              <span className="status-badge status-critical">
                {criticalOpen} Critical Incident{criticalOpen > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Top-right KPI strip */}
        <div className="atm-hero-kpis">
          <div className={`atm-hero-kpi ${overallHealthy ? 'ok' : 'danger'}`}>
            <Activity size={16} />
            <strong>{overallHealthy ? 'Operational' : record.status.replaceAll('_', ' ')}</strong>
            <span>Overall status</span>
          </div>
          <div className="atm-hero-kpi">
            <ClipboardList size={16} />
            <strong>{openIncidents.length}</strong>
            <span>Open incidents</span>
          </div>
          <div className="atm-hero-kpi">
            <Wrench size={16} />
            <strong>{activeMaint.length}</strong>
            <span>Active maintenance</span>
          </div>
          <div className={`atm-hero-kpi ${availability >= 98 ? 'ok' : 'danger'}`}>
            <TrendingUp size={16} />
            <strong>{availability}%</strong>
            <span>Uptime · 30d</span>
          </div>
        </div>
      </div>

      {/* ── Quick actions ─────────────────────────── */}
      <div className="atm-quick-actions">
        {hasPermission(currentUser, 'incident.create') && (
          <Link
            className="atm-qaction"
            to={`/incidents?atm=${record.id}&new=1`}
            onClick={() => showToast('Create Incident started', 'info')}
          >
            <AlertTriangle size={14} /> Create Incident
          </Link>
        )}
        {hasPermission(currentUser, 'maintenance.create') && (
          <Link
            className="atm-qaction"
            to={`/maintenance?atm=${record.id}`}
            onClick={() => showToast('Schedule Maintenance started', 'info')}
          >
            <Wrench size={14} /> Schedule Maintenance
          </Link>
        )}
        <Link className="atm-qaction" to="/incidents">
          <ClipboardList size={14} /> All Incidents
        </Link>
        <Link className="atm-qaction" to="/monitoring">
          <Activity size={14} /> Live Monitoring
        </Link>
        <button
          className="atm-qaction"
          onClick={() => {
            setStatusOpen(true);
            showToast('Update Technical Status dialog opened', 'info');
          }}
          style={{ border: 'none', cursor: 'pointer', font: 'inherit' }}
        >
          <Activity size={14} /> Update Technical Status
        </button>
        <button
          className="atm-qaction"
          onClick={refreshAll}
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'is-spinning' : ''} aria-hidden />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          className="atm-qaction"
          onClick={() => {
            refreshAll();
            showToast('ATM data refreshed', 'success');
          }}
          style={{ border: 'none', cursor: 'pointer', font: 'inherit' }}
        >
          <RefreshCw size={14} className={refreshing ? 'is-spinning' : ''} aria-hidden />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        {hasPermission(currentUser, 'atm.update') && (
          <button
            className="atm-qaction primary"
            onClick={() => setEditOpen(true)}
            style={{ border: 'none', cursor: 'pointer', font: 'inherit' }}
          >
            <HardDrive size={14} /> Edit ATM
          </button>
        )}
      </div>

      {/* ── Info + Technical status ────────────────── */}
      <div className="details-grid" style={{ marginBottom: 20 }}>
        {/* ATM Information */}
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2><Building2 size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />ATM Information</h2>
              <p>Asset identity, location and installation data.</p>
            </div>
          </div>
          <dl className="detail-grid">
            <Field label="ATM ID" value={String(record.id)} />
            <Field label="ATM Reference" value={record.reference} />
            <Field label="ATM Name" value={record.name} />
            <Field label="Branch" value={record.branch_name} />
            <Field label="District" value={record.district_name} />
            <Field label="Location" value={record.location} icon={<MapPin size={11} />} />
            <Field label="Address" value={record.address} />
            <Field label="Manufacturer" value={record.manufacturer} />
            <Field label="Model" value={record.model} />
            <Field label="Serial Number" value={record.serial_number} />
            <Field label="Installation Date" value={record.installation_date} />
            <Field label="IP Address" value={record.ip_address} icon={<Globe size={11} />} />
          </dl>
          {photoHref && (
            <div className="atm-photo-strip">
              <EvidenceThumb url={photoHref} label={`Photo of ${record.reference}`} onOpen={() => setPhotoOpen(true)} />
              <div className="atm-photo-note">
                <strong>Unit photo</strong>
                <small>Photo of the installed ATM at the branch.</small>
              </div>
              <button type="button" className="button secondary small" onClick={() => setPhotoOpen(true)}>
                View full size
              </button>
            </div>
          )}
        </article>

        {/* Technical Status */}
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2><Server size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Technical Status</h2>
              <p>Live technical checks and current service ownership.</p>
            </div>
            <span className={`health-pill ${overallHealthy ? 'ok' : 'danger'}`}>
              <Activity size={12} /> {overallHealthy ? 'Healthy' : 'Attention required'}
            </span>
          </div>

          {/* Signal grid — visual status cards */}
          <div className="signal-grid">
            <SignalCard
              icon={<Activity size={15} />}
              label="Overall Status"
              value={<StatusBadge value={record.status} />}
              raw={record.status}
            />
            <SignalCard
              icon={<CheckCircle2 size={15} />}
              label="Health"
              value={<StatusBadge value={record.health} />}
              raw={record.health}
            />
            <SignalCard
              icon={<Globe size={15} />}
              label="Network"
              value={<StatusBadge value={record.network_status} />}
              raw={record.network_status}
            />
            <SignalCard
              icon={<Zap size={15} />}
              label="Power"
              value={<StatusBadge value={record.power_status} />}
              raw={record.power_status}
            />
            <SignalCard
              icon={<HardDrive size={15} />}
              label="Hardware"
              value={<StatusBadge value={record.hardware_status} />}
              raw={record.hardware_status}
            />
            <SignalCard
              icon={<Cpu size={15} />}
              label="Communication"
              value={<StatusBadge value={record.communication_status} />}
              raw={record.communication_status}
            />
          </div>

          {/* Ownership & schedule */}
          <div className="signal-section-label">Service Ownership</div>
          <dl className="detail-grid" style={{ marginTop: 0 }}>
            <Field label="Assigned Technician" value={record.assigned_technician_name} icon={<Wrench size={11} />} />
            <Field
              label="Active Incident"
              value={
                record.active_incident ? (
                  <Link className="text-link" to={`/incidents/${record.active_incident.id}`}>
                    {record.active_incident.incident_number}
                  </Link>
                ) : null
              }
            />
            <Field
              label="Last Checked"
              value={record.last_checked ? new Date(record.last_checked).toLocaleString() : null}
              icon={<CalendarClock size={11} />}
            />
            <Field
              label="Last Status Change"
              value={record.last_status_change ? new Date(record.last_status_change).toLocaleString() : null}
            />
            <Field
              label="Last Maintenance"
              value={record.last_maintenance ? new Date(record.last_maintenance).toLocaleString() : null}
            />
            <Field
              label="Next Maintenance"
              value={record.next_maintenance ? new Date(record.next_maintenance).toLocaleString() : null}
              icon={<CalendarClock size={11} />}
            />
          </dl>
        </article>
      </div>

      {/* ── Component Health + Status History ──────── */}
      <div className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2><HardDrive size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Component Health</h2>
              <p>Recorded condition of installed ATM components.</p>
            </div>
          </div>
          {!record.components || record.components.length === 0 ? (
            <EmptyState
              title="No component records available"
              description="Component health will appear here when it exists in the backend."
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Status</th>
                    <th>Condition</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {record.components.map((component) => (
                    <tr key={component.id}>
                      <td>
                        <strong>{component.component_type.replaceAll('_', ' ')}</strong>
                      </td>
                      <td>
                        <StatusBadge value={component.status} />
                      </td>
                      <td>
                        <StatusBadge value={component.condition} />
                      </td>
                      <td>{component.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2><Activity size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Status History</h2>
              <p>Changes to the ATM operational status.</p>
            </div>
            {(history.data || []).length > 0 && (
              <span className="helper-text">{(history.data || []).length} transitions</span>
            )}
          </div>
          {history.isLoading && <LoadingState label="Loading status history..." />}
          {history.isError && <ErrorState message="Unable to load status history." />}
          {!history.isLoading && !history.isError && (history.data || []).length === 0 && (
            <EmptyState title="No status history yet" description="ATM status changes will appear here after they are logged." />
          )}
          {!history.isLoading && !history.isError && (history.data || []).length > 0 && (
            <div className="timeline">
              {(history.data || []).map((row) => (
                <div className="timeline-item" key={row.id}>
                  <div
                    className="timeline-dot"
                    style={{ background: statusColor(row.new_status) }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="timeline-transition">
                      <StatusBadge value={row.old_status} />
                      <ArrowRight size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                      <StatusBadge value={row.new_status} />
                    </div>
                    <small>{row.changed_by_name || 'System'} · {new Date(row.created_at).toLocaleString()}</small>
                    {row.reason && <small style={{ fontStyle: 'italic' }}>{row.reason}</small>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      {/* ── Activity feed + Branch reports ──────────── */}
      <div className="content-grid" style={{ marginBottom: 20 }}>
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2><History size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Activity Feed</h2>
              <p>Chronological record of status, incidents, maintenance and reports.</p>
            </div>
            {activity.length > 0 && (
              <span className="helper-text">{activity.length} events</span>
            )}
          </div>
          {history.isLoading && <LoadingState label="Building activity feed..." />}
          {!history.isLoading && activity.length === 0 && (
            <EmptyState title="No activity yet" description="Status changes, incidents, maintenance and branch reports will appear here." />
          )}
          {!history.isLoading && activity.length > 0 && (
            <div className="timeline compact-timeline">
              {activity.map(({ key, kind, node, time }) => (
                <div className="timeline-item" key={key}>
                  <div className={`timeline-dot feed-${kind}`} />
                  <div style={{ minWidth: 0 }}>
                    <div className="timeline-transition">{node}</div>
                    <small className="activity-meta">
                      {kind === 'report' ? 'Branch report' : `ATM ${kind}`} · {time}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2><FileText size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Branch Reports</h2>
              <p>Faults and observations reported from the branch for this ATM.</p>
            </div>
            {(reports.data || []).length > 0 && (
              <span className="helper-text">{(reports.data || []).length} reports</span>
            )}
          </div>
          {reports.isLoading && <LoadingState label="Loading branch reports..." />}
          {reports.isError && <ErrorState message="Unable to load branch reports." />}
          {!reports.isLoading && !reports.isError && (reports.data || []).length === 0 && (
            <EmptyState title="No branch reports" description="Branch-reported faults for this ATM will appear here." />
          )}
          {!reports.isLoading && !reports.isError && (reports.data || []).length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Problem</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(reports.data || []).map((report) => (
                    <tr key={report.id}>
                      <td><strong>{report.report_id}</strong></td>
                      <td style={{ textTransform: 'capitalize' }}>
                        {report.problem_type?.replaceAll('_', ' ') || '—'}
                      </td>
                      <td>
                        {report.severity ? <PriorityBadge value={report.severity} /> : '—'}
                      </td>
                      <td>
                        <StatusBadge value={report.status} />
                      </td>
                      <td>{new Date(report.created_at).toLocaleDateString()}</td>
                      <td>
                        <Link className="button secondary small" to={`/branch-reports/${report.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>

      {/* ── Incident History + Maintenance ──────────── */}
      <div className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2><ShieldAlert size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Incident History</h2>
              <p>Faults and service incidents for this ATM.</p>
            </div>
            {(incidents.data || []).length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {openIncidents.length > 0 && (
                  <span className="status-badge status-warning">{openIncidents.length} open</span>
                )}
                <Link className="text-link" to={`/incidents?atm=${record.id}`}>View all <ArrowRight size={11} /></Link>
              </div>
            )}
          </div>
          {incidents.isLoading && <LoadingState label="Loading ATM incidents..." />}
          {incidents.isError && <ErrorState message="Unable to load ATM incidents." />}
          {!incidents.isLoading && !incidents.isError && (incidents.data || []).length === 0 && (
            <EmptyState title="No incidents recorded" description="This ATM has no incident history in the current scope." />
          )}
          {!incidents.isLoading && !incidents.isError && (incidents.data || []).length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Incident</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Technician</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(incidents.data || []).map((incident) => (
                    <tr key={incident.id}>
                      <td>
                        <strong>{incident.incident_id}</strong>
                        <small>{new Date(incident.created_at).toLocaleDateString()}</small>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>
                        {incident.category?.replaceAll('_', ' ') || '—'}
                      </td>
                      <td>
                        <PriorityBadge value={incident.priority} />
                      </td>
                      <td>{incident.assigned_to_name || 'Unassigned'}</td>
                      <td>
                        <StatusBadge value={incident.status} />
                      </td>
                      <td>
                        {incident.duration_minutes != null
                          ? formatDuration(incident.duration_minutes)
                          : formatIncidentDuration(incident)}
                      </td>
                      <td>
                        <Link className="button secondary small" to={`/incidents/${incident.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2><Wrench size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Maintenance</h2>
              <p>Scheduled and completed maintenance work.</p>
            </div>
            {activeMaint.length > 0 && (
              <span className="status-badge status-in_progress">{activeMaint.length} active</span>
            )}
          </div>
          {maintenance.isLoading && <LoadingState label="Loading maintenance..." />}
          {maintenance.isError && <ErrorState message="Unable to load maintenance history." />}
          {!maintenance.isLoading && !maintenance.isError && (maintenance.data || []).length === 0 && (
            <EmptyState title="No maintenance scheduled" description="No maintenance records exist for this ATM yet." />
          )}
          {!maintenance.isLoading && !maintenance.isError && (maintenance.data || []).length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Technician</th>
                    <th>Status</th>
                    <th>Start</th>
                    <th>End</th>
                  </tr>
                </thead>
                <tbody>
                  {(maintenance.data || []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.maintenance_id || `MJ-${item.id}`}</strong>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>
                        {item.maintenance_type?.replaceAll('_', ' ') || '—'}
                      </td>
                      <td>
                        {item.priority ? <PriorityBadge value={item.priority} /> : '—'}
                      </td>
                      <td>{item.technician_name || 'Unassigned'}</td>
                      <td>
                        <StatusBadge value={item.status} />
                      </td>
                      <td>
                        {item.start_date ? new Date(item.start_date).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        {item.end_date ? new Date(item.end_date).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>

      {editOpen && atm.data ? (
        <ATMDialog atm={atm.data} onClose={() => setEditOpen(false)} />
      ) : null}
      {statusOpen && atm.data ? (
        <SetATMStatusDialog atm={atm.data} onClose={() => setStatusOpen(false)} />
      ) : null}
      {photoOpen && photoHref ? (
        <EvidenceLightbox url={photoHref} onClose={() => setPhotoOpen(false)} />
      ) : null}
    </section>
  );
}

/** A labelled detail field — shows "Not recorded" placeholder when value is empty. */
function Field({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === '' ||
    value === '—';

  return (
    <div className="detail-item">
      <dt>
        {icon ? <span style={{ marginRight: 4, opacity: 0.6 }}>{icon}</span> : null}
        {label}
      </dt>
      <dd>
        {isEmpty ? (
          <span className="field-unavailable">Not recorded</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
