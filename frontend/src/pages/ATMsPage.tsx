import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { hasPermission, useAuth } from '../context/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { DualStatus, StatusBadge } from '../components/ui/StatusBadge';
import ATMDialog from '../components/atms/ATMDialog';
import type { ATM } from '../types/api';

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active:1' },
  { label: 'Inactive', value: 'active:0' },
  { label: 'Operational', value: 'OPERATIONAL' },
  { label: 'Warning', value: 'WARNING' },
  { label: 'Fault', value: 'FAULT' },
  { label: 'Offline', value: 'OFFLINE' },
  { label: 'Critical', value: 'CRITICAL' },
  { label: 'Maintenance', value: 'MAINTENANCE' },
  { label: 'Under Repair', value: 'UNDER_REPAIR' },
];

export default function ATMsPage() {
  const { currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);

  useEffect(() => {
    if (params.get('active') === '1') setChip('active:1');
    else if (params.get('active') === '0') setChip('active:0');
    else if (params.get('status')) setChip(params.get('status') || '');
  }, [params]);

  const atms = useQuery({
    queryKey: ['atms', search, chip],
    queryFn: () => {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (chip === 'active:1') query.set('is_active', 'true');
      else if (chip === 'active:0') query.set('is_active', 'false');
      else if (chip) query.set('status', chip);
      query.set('ordering', 'reference');
      return list<ATM>(`/atms/?${query.toString()}`);
    },
  });

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">ATM Operations</p>
          <h1>ATMs</h1>
          <p className="page-copy">All ATMs within the district.</p>
        </div>
        <div className="page-actions">
          <input
            className="field-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ATM ID, branch, serial number..."
          />
          <button className="button secondary" onClick={() => atms.refetch()}>
            Refresh
          </button>
          {hasPermission(currentUser, 'atm.create') ? (
            <button className="button primary" onClick={() => setRegisterOpen(true)}>
              + Register ATM
            </button>
          ) : null}
        </div>
      </div>

      <div className="kpi-grid compact" aria-label="ATM fleet summary">
        <article className="metric-card"><span>Total Units</span><strong>{(atms.data || []).length}</strong></article>
        <article className="metric-card success"><span>Operational</span><strong>{(atms.data || []).filter((a) => a.status === 'OPERATIONAL').length}</strong></article>
        <article className="metric-card warning"><span>Warning / Degraded</span><strong>{(atms.data || []).filter((a) => ['WARNING', 'DEGRADED'].includes(a.status)).length}</strong></article>
        <article className="metric-card danger"><span>Fault / Critical</span><strong>{(atms.data || []).filter((a) => ['FAULT', 'CRITICAL'].includes(a.status)).length}</strong></article>
        <article className="metric-card"><span>Offline</span><strong>{(atms.data || []).filter((a) => a.status === 'OFFLINE').length}</strong></article>
        <article className="metric-card"><span>Under Repair</span><strong>{(atms.data || []).filter((a) => a.status === 'UNDER_REPAIR').length}</strong></article>
      </div>

      <div className="filter-chips">
        {FILTERS.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`chip ${chip === item.value ? 'active' : ''}`}
            onClick={() => {
              setChip(item.value);
              const next = new URLSearchParams();
              if (item.value === 'active:1') next.set('active', '1');
              else if (item.value === 'active:0') next.set('active', '0');
              else if (item.value) next.set('status', item.value);
              setParams(next);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="panel">
        {atms.isLoading ? <LoadingState label="Loading ATM fleet..." /> : null}
        {atms.isError ? (
          <ErrorState message="Unable to load ATM information." onRetry={() => atms.refetch()} />
        ) : null}
        {!atms.isLoading && !atms.isError && (atms.data || []).length === 0 ? (
          <EmptyState title="No ATMs found" description="No ATMs match the current filters." />
        ) : null}
        {!atms.isLoading && !atms.isError && (atms.data || []).length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ATM</th>
                  <th>Branch</th>
                  <th>Operational</th>
                  <th>Technical Status</th>
                  <th>Health</th>
                  <th>Active Incident</th>
                  <th>Last Check</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(atms.data || []).map((atm) => (
                  <tr key={atm.id}>
                    <td>
                      <Link to={`/atms/${atm.id}`}>
                        <strong>{atm.reference}</strong>
                      </Link>
                      <small>{atm.name || atm.model || 'ATM unit'}</small>
                    </td>
                    <td>{atm.branch_name}</td>
                    <td>
                      <StatusBadge value={atm.is_active === false ? 'INACTIVE' : 'ACTIVE'} />
                    </td>
                    <td>
                      <DualStatus active={atm.is_active !== false} technical={atm.status} />
                    </td>
                    <td>
                      <span className={`live-dot tone-${atm.health.toLowerCase()}`} style={{ marginRight: 7, verticalAlign: 'middle' }} />
                      <StatusBadge value={atm.health} />
                    </td>
                    <td>
                      {atm.active_incident ? (
                        <Link to={`/incidents/${atm.active_incident.id}`}>{atm.active_incident.incident_number}</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{atm.last_checked ? new Date(atm.last_checked).toLocaleString() : '—'}</td>
                    <td>
                      <Link className="button secondary small" to={`/atms/${atm.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {registerOpen ? <ATMDialog onClose={() => setRegisterOpen(false)} /> : null}
    </section>
  );
}
