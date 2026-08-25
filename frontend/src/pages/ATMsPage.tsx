import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { StatusBadge } from '../components/ui/StatusBadge';
import type { ATM } from '../types/api';

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) => Array.isArray(response.data) ? response.data : response.data.results);
}

export default function ATMsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const atms = useQuery({
    queryKey: ['atms', search, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      params.set('ordering', 'reference');
      return list<ATM>(`/atms/?${params.toString()}`);
    },
  });

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Operations</p>
          <h1>ATMs</h1>
          <p className="page-copy">View ATM status, technical health, active incidents and maintenance readiness across this district.</p>
        </div>
        <div className="page-actions">
          <input className="field-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ATM, branch, serial..." />
          <select className="field-input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {['OPERATIONAL', 'AVAILABLE', 'OFFLINE', 'UNAVAILABLE', 'FAULT', 'COMMUNICATION_PROBLEM', 'MAINTENANCE', 'ERROR'].map((value) => (
              <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
            ))}
          </select>
          <button className="button secondary" onClick={() => atms.refetch()}>Refresh</button>
        </div>
      </div>
      <div className="panel">
        {atms.isLoading ? <LoadingState label="Loading ATM fleet..." /> : null}
        {atms.isError ? <ErrorState message="Unable to load ATM data. Please try again." /> : null}
        {!atms.isLoading && !atms.isError && (atms.data || []).length === 0 ? (
          <EmptyState title="No ATMs found" description="No ATM records match the current filters." />
        ) : null}
        {!atms.isLoading && !atms.isError && (atms.data || []).length > 0 ? (
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
                {(atms.data || []).map((atm) => (
                  <tr key={atm.id}>
                    <td>
                      <Link to={`/atms/${atm.id}`}><strong>{atm.reference}</strong></Link>
                      <small>{atm.name || 'ATM unit'}</small>
                    </td>
                    <td>{atm.branch_name}</td>
                    <td><StatusBadge value={atm.status} /></td>
                    <td><StatusBadge value={atm.network_status} /></td>
                    <td><StatusBadge value={atm.hardware_status} /></td>
                    <td>{atm.active_incident ? <Link to={`/incidents/${atm.active_incident.id}`}>{atm.active_incident.incident_number}</Link> : '—'}</td>
                    <td>{atm.last_checked ? new Date(atm.last_checked).toLocaleString() : 'Not available'}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="button secondary small" to={`/atms/${atm.id}`}>View</Link>
                        <Link className="button secondary small" to={atm.active_incident ? `/incidents/${atm.active_incident.id}` : `/incidents?atm=${atm.id}&new=1`}>Investigate</Link>
                        <Link className="button secondary small" to={`/incidents?atm=${atm.id}&new=1`}>Report Issue</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
