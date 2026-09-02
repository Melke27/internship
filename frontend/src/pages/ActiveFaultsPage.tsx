import { Link, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CircleAlert, Clock, ShieldAlert, Wrench } from 'lucide-react';

import { api } from '../lib/api';
import { hasPermission, useAuth } from '../context/AuthContext';
import { formatDuration } from '../lib/utils';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';
import type { DashboardSummary } from '../types/api';

const AGING_THRESHOLD_MINUTES = 240;

function isAging(durationMinutes?: number | null) {
  return typeof durationMinutes === 'number' && durationMinutes >= AGING_THRESHOLD_MINUTES;
}

export default function ActiveFaultsPage() {
  const { currentUser } = useAuth();
  const [params] = useSearchParams();
  const priority = params.get('priority') || '';
  const summary = useQuery({
    queryKey: ['dashboard-summary', 'faults'],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((r) => r.data),
  });

  const allFaults = summary.data?.active_faults || [];

  const counts = useMemo(() => {
    const byPriority: Record<string, number> = {};
    for (const row of allFaults) byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
    return byPriority;
  }, [allFaults]);

  const rows = useMemo(() => {
    let out = allFaults;
    if (priority) out = out.filter((row) => row.priority === priority);
    const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...out].sort((a, b) => {
      const ageA = isAging(a.duration_minutes) ? 0 : 1;
      const ageB = isAging(b.duration_minutes) ? 0 : 1;
      if (ageA !== ageB) return ageA - ageB;
      return (rank[a.priority] ?? 99) - (rank[b.priority] ?? 99);
    });
  }, [allFaults, priority]);

  const agingCount = allFaults.filter((row) => isAging(row.duration_minutes)).length;

  if (summary.isLoading) return <LoadingState label="Loading active faults..." />;
  if (summary.isError || !summary.data) {
    return <ErrorState message="Unable to load ATM information." onRetry={() => summary.refetch()} />;
  }

  return (
    <section className="page-content">
      <div className="portal-hero">
        <div>
          <p className="page-kicker">ATM Operations</p>
          <h1>Active Faults</h1>
          <p className="page-copy">
            District ATMs currently in warning, fault, offline, degraded or critical condition —
            sorted so aging and critical faults surface first.
          </p>
          <span className="live-updated">
            <span className="live-dot" />
            {allFaults.length} active fault{allFaults.length === 1 ? '' : 's'} · last checked{' '}
            {new Date(summary.data.last_updated).toLocaleTimeString()}
          </span>
        </div>
        <div className="page-actions">
          <button className="button secondary" onClick={() => summary.refetch()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="kpi-grid faults-kpi-grid" aria-label="Active faults summary">
        <MetricCard
          label="Active faults"
          value={summary.data.active_fault_total ?? allFaults.length}
          icon={<AlertTriangle size={18} />}
          hint={`showing ${allFaults.length} of ${summary.data.active_fault_total ?? allFaults.length}`}
        />
        <MetricCard
          label="Critical"
          value={counts.CRITICAL || 0}
          to={counts.CRITICAL ? '/active-faults?priority=CRITICAL' : undefined}
          tone={(counts.CRITICAL || 0) > 0 ? 'danger' : 'default'}
          icon={<ShieldAlert size={18} />}
          hint="immediate action"
        />
        <MetricCard
          label="High"
          value={counts.HIGH || 0}
          to={counts.HIGH ? '/active-faults?priority=HIGH' : undefined}
          tone={(counts.HIGH || 0) > 0 ? 'warning' : 'default'}
          icon={<CircleAlert size={18} />}
          hint="priority service"
        />
        <MetricCard
          label={`Aging over ${AGING_THRESHOLD_MINUTES / 60}h`}
          value={agingCount}
          tone={agingCount > 0 ? 'warning' : 'default'}
          icon={<Clock size={18} />}
          hint={`running over ${AGING_THRESHOLD_MINUTES / 60} hours`}
        />
      </div>

      <div className="filter-chips" aria-label="Fault priority filters">
        <Link className={`chip ${!priority ? 'active' : ''}`} to="/active-faults">
          All
        </Link>
        {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((value) => (
          <Link
            key={value}
            className={`chip ${priority === value ? 'active' : ''}`}
            to={`/active-faults?priority=${value}`}
          >
            {value}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No active ATM faults" description="All monitored ATMs are currently operating normally." />
      ) : (
        <div className="table-wrap panel">
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
              {rows.map((row) => {
                const aging = isAging(row.duration_minutes);
                return (
                  <tr key={row.id} className={aging ? 'row-aging' : undefined}>
                    <td>
                      <Link to={`/atms/${row.id}`}>
                        <strong>{row.reference}</strong>
                      </Link>
                    </td>
                    <td>{row.branch}</td>
                    <td>{row.fault.replaceAll('_', ' ')}</td>
                    <td>
                      <PriorityBadge value={row.priority} />
                    </td>
                    <td>
                      <StatusBadge value={row.status} />
                    </td>
                    <td>{row.reported ? new Date(row.reported).toLocaleString() : '—'}</td>
                    <td>{row.assigned || 'Unassigned'}</td>
                    <td>
                      <span className={aging ? 'aging-duration' : undefined}>
                        <Wrench size={11} />
                        {formatDuration(row.duration_minutes)}
                        {aging ? ' · aging' : ''}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="button secondary small" to={`/atms/${row.id}`}>
                          View
                        </Link>
                        {row.active_incident_id && hasPermission(currentUser, 'incident.view') ? (
                          <>
                            <Link className="button secondary small" to={`/incidents/${row.active_incident_id}`}>
                              Investigate
                            </Link>
                            {hasPermission(currentUser, 'incident.escalate') ? (
                              <Link
                                className="button secondary small"
                                to={`/incidents/${row.active_incident_id}?action=escalate`}
                              >
                                Escalate
                              </Link>
                            ) : null}
                          </>
                        ) : hasPermission(currentUser, 'incident.create') ? (
                          <Link className="button secondary small" to={`/incidents?atm=${row.id}&new=1`}>
                            Open Incident
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {summary.data.active_fault_total != null && summary.data.active_fault_total > allFaults.length ? (
            <p style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-3)' }}>
              Showing the {allFaults.length} most recent of {summary.data.active_fault_total} active faults. Resolve or
              prioritize others in the ATM fleet for the full picture.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
