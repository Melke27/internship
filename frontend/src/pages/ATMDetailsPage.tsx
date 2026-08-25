import type { ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { StatusBadge, PriorityBadge } from '../components/ui/StatusBadge';
import type { ATM, Incident, Maintenance } from '../types/api';

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) => Array.isArray(response.data) ? response.data : response.data.results);
}

type StatusHistory = { id: number; old_status: string; new_status: string; changed_by_name: string | null; reason: string; created_at: string };

export default function ATMDetailsPage() {
  const { id } = useParams();
  const atm = useQuery({
    queryKey: ['atm', id],
    queryFn: () => api.get<ATM>(`/atms/${id}/`).then((response) => response.data),
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

  if (atm.isLoading) return <LoadingState label="Loading ATM detail..." />;
  if (atm.isError || !atm.data) return <ErrorState message="Unable to load ATM detail. Please try again." />;

  const record = atm.data;

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">{record.district_name}</p>
          <h1>{record.reference}</h1>
          <p className="page-copy">{record.name || 'ATM detail'} · {record.branch_name}</p>
        </div>
        <div className="badge-group">
          <StatusBadge value={record.status} />
          <StatusBadge value={record.health} />
          <Link className="button secondary" to={`/incidents?atm=${record.id}&new=1`}>Create Incident</Link>
        </div>
      </div>

      <div className="details-grid">
        <article className="panel">
          <h2>ATM Information</h2>
          <dl className="detail-grid">
            <Field label="ATM ID" value={String(record.id)} />
            <Field label="ATM Reference" value={record.reference} />
            <Field label="ATM Name" value={record.name || '—'} />
            <Field label="Branch" value={record.branch_name} />
            <Field label="District" value={record.district_name} />
            <Field label="Location" value={record.location || '—'} />
            <Field label="Address" value={record.address || '—'} />
            <Field label="Manufacturer" value={record.manufacturer || '—'} />
            <Field label="Model" value={record.model || '—'} />
            <Field label="Serial Number" value={record.serial_number || '—'} />
            <Field label="Installation Date" value={record.installation_date || '—'} />
            <Field label="IP Address" value={record.ip_address || '—'} />
          </dl>
        </article>

        <article className="panel">
          <h2>Technical Status</h2>
          <dl className="detail-grid">
            <Field label="Overall Status" value={<StatusBadge value={record.status} />} />
            <Field label="Health" value={<StatusBadge value={record.health} />} />
            <Field label="Network Status" value={<StatusBadge value={record.network_status} />} />
            <Field label="Power Status" value={<StatusBadge value={record.power_status} />} />
            <Field label="Hardware Status" value={<StatusBadge value={record.hardware_status} />} />
            <Field label="Communication Status" value={<StatusBadge value={record.communication_status} />} />
            <Field label="Last Checked" value={record.last_checked ? new Date(record.last_checked).toLocaleString() : '—'} />
            <Field label="Last Status Change" value={record.last_status_change ? new Date(record.last_status_change).toLocaleString() : '—'} />
            <Field label="Last Maintenance" value={record.last_maintenance ? new Date(record.last_maintenance).toLocaleString() : '—'} />
            <Field label="Next Maintenance" value={record.next_maintenance ? new Date(record.next_maintenance).toLocaleString() : '—'} />
            <Field label="Assigned Technician" value={record.assigned_technician_name || '—'} />
            <Field label="Active Incident" value={record.active_incident ? <Link to={`/incidents/${record.active_incident.id}`}>{record.active_incident.incident_number}</Link> : '—'} />
          </dl>
        </article>
      </div>

      <div className="content-grid">
        <article className="panel">
          <h2>Component Health</h2>
          {!record.components || record.components.length === 0 ? (
            <EmptyState title="No component records available" description="Component health will appear here when it exists in the backend." />
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
                      <td>{component.component_type.replaceAll('_', ' ')}</td>
                      <td><StatusBadge value={component.status} /></td>
                      <td><StatusBadge value={component.condition} /></td>
                      <td>{component.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="panel">
          <h2>Status History</h2>
          {history.isLoading ? <LoadingState label="Loading ATM status history..." /> : null}
          {history.isError ? <ErrorState message="Unable to load status history." /> : null}
          {!history.isLoading && !history.isError && (history.data || []).length === 0 ? (
            <EmptyState title="No status history yet" description="ATM status changes will appear here after they are logged." />
          ) : null}
          {!history.isLoading && !history.isError && (history.data || []).length > 0 ? (
            <div className="timeline">
              {(history.data || []).map((row) => (
                <div className="timeline-item" key={row.id}>
                  <div className="timeline-dot" />
                  <div>
                    <strong>{row.old_status} to {row.new_status}</strong>
                    <small>{row.changed_by_name || 'System'} · {new Date(row.created_at).toLocaleString()}</small>
                    <small>{row.reason || 'No reason recorded'}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </div>

      <div className="content-grid">
        <article className="panel">
          <h2>Incident History</h2>
          {incidents.isLoading ? <LoadingState label="Loading ATM incidents..." /> : null}
          {incidents.isError ? <ErrorState message="Unable to load ATM incidents." /> : null}
          {!incidents.isLoading && !incidents.isError && (incidents.data || []).length === 0 ? (
            <EmptyState title="No incidents recorded" description="This ATM has no incident history in the current scope." />
          ) : null}
          {!incidents.isLoading && !incidents.isError && (incidents.data || []).length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Incident ID</th>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Problem</th>
                    <th>Priority</th>
                    <th>Technician</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(incidents.data || []).map((incident) => (
                    <tr key={incident.id}>
                      <td><Link to={`/incidents/${incident.id}`}>{incident.incident_id}</Link></td>
                      <td>{new Date(incident.created_at).toLocaleString()}</td>
                      <td>{incident.category}</td>
                      <td>{incident.title}</td>
                      <td><PriorityBadge value={incident.priority} /></td>
                      <td>{incident.assigned_to_name || '—'}</td>
                      <td><StatusBadge value={incident.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>

        <article className="panel">
          <h2>Maintenance</h2>
          {maintenance.isLoading ? <LoadingState label="Loading maintenance..." /> : null}
          {maintenance.isError ? <ErrorState message="Unable to load maintenance history." /> : null}
          {!maintenance.isLoading && !maintenance.isError && (maintenance.data || []).length === 0 ? (
            <EmptyState title="No maintenance scheduled" description="No maintenance records exist for this ATM yet." />
          ) : null}
          {!maintenance.isLoading && !maintenance.isError && (maintenance.data || []).length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Technician</th>
                    <th>Start</th>
                    <th>End</th>
                  </tr>
                </thead>
                <tbody>
                  {(maintenance.data || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.maintenance_type}</td>
                      <td><StatusBadge value={item.status} /></td>
                      <td>{item.technician_name || '—'}</td>
                      <td>{item.start_date ? new Date(item.start_date).toLocaleString() : '—'}</td>
                      <td>{item.end_date ? new Date(item.end_date).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
