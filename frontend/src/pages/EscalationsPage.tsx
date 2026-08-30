import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { api } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { PriorityBadge } from '../components/ui/StatusBadge';
import type { Incident } from '../types/api';

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

export default function EscalationsPage() {
  const escalations = useQuery({
    queryKey: ['incidents', 'escalated'],
    queryFn: () => list<Incident>('/incidents/?status=ESCALATED&ordering=-created_at'),
  });

  if (escalations.isLoading) return <LoadingState label="Loading escalation queue..." />;
  if (escalations.isError) return <ErrorState message="Unable to load escalations." />;

  const rows = escalations.data || [];

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Operations</p>
          <h1>Escalations</h1>
          <p className="page-copy">Incidents escalated by technicians and awaiting supervisory or specialist action.</p>
        </div>
      </div>
      <div className="kpi-grid compact">
        <article className="metric-card"><span>Escalated Incidents</span><strong>{rows.length}</strong></article>
        <article className="metric-card danger"><span>Critical</span><strong>{rows.filter((incident) => incident.priority === 'CRITICAL').length}</strong></article>
        <article className="metric-card warning"><span>High</span><strong>{rows.filter((incident) => incident.priority === 'HIGH').length}</strong></article>
        <article className="metric-card"><span>Unassigned</span><strong>{rows.filter((incident) => !incident.assigned_to_name).length}</strong></article>
      </div>
      <div className="panel">
        {rows.length === 0 ? (
          <EmptyState
            title="No escalated incidents"
            description="Escalated incidents appear here until they are resolved and verified."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>ATM</th>
                  <th>Branch</th>
                  <th>Priority</th>
                  <th>Assigned</th>
                  <th>Reported</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <Link to={`/incidents/${incident.id}`}><strong>{incident.incident_id}</strong></Link>
                      <small>{incident.title}</small>
                    </td>
                    <td>{incident.atm_reference}</td>
                    <td>{incident.branch_name}</td>
                    <td><PriorityBadge value={incident.priority} /></td>
                    <td>{incident.assigned_to_name || 'Unassigned'}</td>
                    <td><small>{new Date(incident.created_at).toLocaleString()}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
