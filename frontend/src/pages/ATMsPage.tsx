import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, LayoutGrid, List, Search, ShieldAlert, Wifi, Zap } from 'lucide-react';

import { useDebounce } from '../lib/useDebounce';
import { api } from '../lib/api';
import { extractError, listResource } from '../lib/utils';
import { hasPermission, useAuth } from '../context/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { DualStatus, StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';
import ATMDialog from '../components/atms/ATMDialog';
import type { ATM } from '../types/api';
import type { BranchRow } from './BranchesPage';

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
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [chip, setChip] = useState('');
  const [branchFilter, setBranchFilter] = useState(params.get('branch') || '');
  const [registerOpen, setRegisterOpen] = useState(params.get('register') === '1');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const branches = useQuery({
    queryKey: ['branches', 'atms-page-filter'],
    queryFn: () => listResource<BranchRow>('/branches/?ordering=name'),
  });

  useEffect(() => {
    if (params.get('active') === '1') setChip('active:1');
    else if (params.get('active') === '0') setChip('active:0');
    else if (params.get('status')) setChip(params.get('status') || '');

    if (params.get('register') === '1') {
      setRegisterOpen(true);
    }
    if (params.get('branch')) {
      setBranchFilter(params.get('branch') || '');
    }
  }, [params]);

  const atms = useQuery({
    queryKey: ['atms', debouncedSearch, chip, branchFilter],
    queryFn: () => {
      const query = new URLSearchParams();
      if (debouncedSearch) query.set('search', debouncedSearch);
      if (chip === 'active:1') query.set('is_active', 'true');
      else if (chip === 'active:0') query.set('is_active', 'false');
      else if (chip) query.set('status', chip);
      if (branchFilter) query.set('branch', branchFilter);
      query.set('ordering', 'reference');
      return list<ATM>(`/atms/?${query.toString()}`);
    },
  });

  const fleet = atms.data || [];

  // Count per filter for badge display
  const allData = useQuery({
    queryKey: ['atms-all-counts'],
    queryFn: () => list<ATM>('/atms/?ordering=reference'),
    staleTime: 30_000,
  });
  const allFleet = allData.data || [];

  function countForFilter(value: string) {
    if (!allFleet.length) return 0;
    if (value === '') return allFleet.length;
    if (value === 'active:1') return allFleet.filter((a) => a.is_active !== false).length;
    if (value === 'active:0') return allFleet.filter((a) => a.is_active === false).length;
    return allFleet.filter((a) => a.status === value).length;
  }

  const operational = useMemo(() => fleet.filter((a) => a.status === 'OPERATIONAL').length, [fleet]);
  const warnDeg = useMemo(() => fleet.filter((a) => ['WARNING', 'DEGRADED'].includes(a.status)).length, [fleet]);
  const faultCrit = useMemo(() => fleet.filter((a) => ['FAULT', 'CRITICAL'].includes(a.status)).length, [fleet]);
  const offline = useMemo(() => fleet.filter((a) => a.status === 'OFFLINE').length, [fleet]);
  const underRepair = useMemo(() => fleet.filter((a) => a.status === 'UNDER_REPAIR').length, [fleet]);
  const availability = fleet.length ? Math.round((operational / fleet.length) * 100) : 0;

  const closeRegister = () => {
    setRegisterOpen(false);
    setParams((prev) => {
      prev.delete('register');
      return prev;
    });
  };

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">ATM Operations</p>
          <h1>ATMs</h1>
          <p className="page-copy">All ATMs within the district fleet and branch assignments.</p>
        </div>
        <div className="page-actions">
          {/* View toggle */}
          <div className="view-toggle" aria-label="View mode">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table view"
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
            >
              <List size={15} aria-hidden />
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid size={15} aria-hidden />
            </button>
          </div>
          {hasPermission(currentUser, 'atm.create') ? (
            <button type="button" className="button primary" onClick={() => setRegisterOpen(true)}>
              + Register ATM
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI row */}
      <div className="kpi-grid compact" style={{ gridTemplateColumns: 'repeat(6, minmax(0,1fr))', marginBottom: 18 }}>
        <MetricCard label="Total Units" value={fleet.length} icon={<Activity size={16} />} hint="in filtered fleet" />
        <MetricCard label="Operational" value={operational} icon={<Wifi size={16} />} tone="success" delta={{ up: availability >= 90, label: `${availability}%` }} hint="of fleet" />
        <MetricCard label="Warning / Degraded" value={warnDeg} icon={<ShieldAlert size={16} />} tone={warnDeg > 0 ? 'warning' : 'default'} hint="reduced service" />
        <MetricCard label="Fault / Critical" value={faultCrit} icon={<Zap size={16} />} tone={faultCrit > 0 ? 'danger' : 'default'} hint="attention needed" />
        <MetricCard label="Offline" value={offline} icon={<Wifi size={16} />} tone={offline > 0 ? 'warning' : 'default'} hint="not communicating" />
        <MetricCard label="Under Repair" value={underRepair} icon={<Activity size={16} />} hint="being serviced" />
      </div>

      {/* Search + filter bar */}
      <div className="filter-bar">
        <div className="page-search-bar" style={{ flex: 1, minWidth: 200, margin: 0 }}>
          <Search size={15} aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ATM ID, branch, serial number..."
            aria-label="Search ATM ID, branch, serial number"
          />
        </div>
        <select
          className="field-input"
          style={{ width: 190 }}
          value={branchFilter}
          aria-label="Filter by branch"
          onChange={(event) => {
            setBranchFilter(event.target.value);
            setParams((prev) => {
              if (event.target.value) prev.set('branch', event.target.value);
              else prev.delete('branch');
              return prev;
            });
          }}
        >
          <option value="">All Branches</option>
          {(branches.data || []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
        {(search || branchFilter || chip) && (
          <button
            className="button secondary small"
            onClick={() => {
              setSearch('');
              setBranchFilter('');
              setChip('');
              setParams(new URLSearchParams());
            }}
          >
            Clear Filters
          </button>
        )}
        <button type="button" className="button secondary" onClick={() => atms.refetch()}>
          Refresh
        </button>
      </div>

      {/* Filter chips with count badges */}
      <div className="filter-chips">
        {FILTERS.map((item) => {
          const count = countForFilter(item.value);
          return (
            <button
              key={item.label}
              type="button"
              className={`chip ${chip === item.value ? 'active' : ''}`}
              onClick={() => {
                setChip(item.value);
                const next = new URLSearchParams(params);
                if (item.value === 'active:1') next.set('active', '1');
                else if (item.value === 'active:0') next.set('active', '0');
                else if (item.value) next.set('status', item.value);
                else next.delete('status');
                setParams(next);
              }}
            >
              {item.label}
              {count > 0 && item.value !== '' ? (
                <span className="filter-count-badge">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="panel">
        {atms.isLoading ? <LoadingState label="Loading ATM fleet..." /> : null}
        {atms.isError ? (
          <ErrorState message="Unable to load ATM information." onRetry={() => atms.refetch()} />
        ) : null}
        {!atms.isLoading && !atms.isError && fleet.length === 0 ? (
          <EmptyState title="No ATMs found" description="No ATMs match the current branch and status filters." />
        ) : null}

        {/* Grid view */}
        {!atms.isLoading && !atms.isError && fleet.length > 0 && viewMode === 'grid' ? (
          <div className="monitor-grid" style={{ padding: '4px 0' }}>
            {fleet.map((atm) => (
              <div
                className="monitor-card"
                key={atm.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/atms/${atm.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') navigate(`/atms/${atm.id}`);
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="monitor-card-head">
                  <strong>{atm.reference}</strong>
                  <DualStatus active={atm.is_active !== false} technical={atm.status} />
                </div>
                <small>{atm.branch_name}</small>
                <small>{atm.name || atm.model || 'ATM unit'}</small>
                <div className="meta-grid compact" style={{ marginTop: 4 }}>
                  <div>
                    <span>Health</span>
                    <strong><StatusBadge value={atm.health} /></strong>
                  </div>
                  {atm.active_incident ? (
                    <div>
                      <span>Incident</span>
                      <strong style={{ color: 'var(--danger)', fontSize: 11 }}>{atm.active_incident.incident_number}</strong>
                    </div>
                  ) : null}
                </div>
                <div className="row-actions" style={{ marginTop: 'auto' }}>
                  <Link
                    className="button secondary small"
                    to={`/atms/${atm.id}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    View
                  </Link>
                  {hasPermission(currentUser, 'incident.create') && (
                    <Link
                      className="button ghost small"
                      to={`/incidents?atm=${atm.id}&new=1`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      + Incident
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Table view */}
        {!atms.isLoading && !atms.isError && fleet.length > 0 && viewMode === 'table' ? (
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
                {fleet.map((atm) => (
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
                      <span
                        className={`live-dot tone-${atm.health.toLowerCase()}`}
                        style={{ marginRight: 7, verticalAlign: 'middle' }}
                      />
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
                      <div className="table-actions" style={{ display: 'flex', gap: 6 }}>
                        <Link className="button secondary small" to={`/atms/${atm.id}`}>
                          View
                        </Link>
                        {hasPermission(currentUser, 'incident.create') && (
                          <Link className="button ghost small" to={`/incidents?atm=${atm.id}&new=1`}>
                            + Incident
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {registerOpen ? (
        <ATMDialog
          onClose={closeRegister}
          initialBranchId={branchFilter || params.get('branch')}
        />
      ) : null}
    </section>
  );
}
