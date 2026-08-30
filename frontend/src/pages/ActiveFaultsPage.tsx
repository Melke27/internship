import { Link, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { hasPermission, useAuth } from '../context/AuthContext';
import { formatDuration } from '../lib/utils';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import type { DashboardSummary } from '../types/api';

export default function ActiveFaultsPage() {
  const { currentUser } = useAuth();
  const [params] = useSearchParams();
  const priority = params.get('priority') || '';
  const summary = useQuery({
    queryKey: ['dashboard-summary', 'faults'],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((r) => r.data),
  });

  const rows = useMemo(() => {
    const faults = summary.data?.active_faults || [];
    if (!priority) return faults;
    return faults.filter((row) => row.priority === priority);
  }, [summary.data, priority]);

  if (summary.isLoading) return <LoadingState label="Loading active faults..." />;
  if (summary.isError || !summary.data) {
    return <ErrorState message="Unable to load ATM information." onRetry={() => summary.refetch()} />;
  }

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">ATM Operations</p>
          <h1>Active Faults</h1>
          <p className="page-copy">District ATMs currently in warning, fault, offline, degraded or critical condition.</p>
        </div>
        <div className="filter-chips">
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
              {rows.map((row) => (
                <tr key={row.id}>
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
                  <td>{formatDuration(row.duration_minutes)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
