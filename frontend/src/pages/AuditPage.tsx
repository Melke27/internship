import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import { useAuth, hasPermission, portalForUser, roleLabel } from '../context/AuthContext';
import { api } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import { formatDuration } from '../lib/utils';

interface AuditRow {
  id: number;
  user_name: string | null;
  action: string;
  entity: string;
  entity_id: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

const ENTITY_OPTIONS = ['ATM', 'Incident', 'User', 'Branch', 'Maintenance', 'BranchReport'];

export default function AuditPage() {
  const { currentUser } = useAuth();
  const portal = portalForUser(currentUser);
  const label = roleLabel(currentUser?.role || null);
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const audit = useQuery({
    queryKey: ['audit-logs', debounced, entity, action],
    queryFn: () => {
      const params = new URLSearchParams({ ordering: '-created_at' });
      if (debounced) params.set('search', debounced);
      if (entity) params.set('entity', entity);
      if (action) params.set('action', action);
      return list<AuditRow>(`/audit-logs/?${params.toString()}`);
    },
    placeholderData: (previous) => previous,
  });

  const actions = useMemo(() => {
    const seen = new Set<string>();
    (audit.data || []).forEach((row) => seen.add(row.action));
    return Array.from(seen).sort();
  }, [audit.data]);

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
<p className="page-kicker">
  {portal === 'branch' ? 'Branch Operations' : portal === 'maintenance' ? 'MAINTENANCE OPERATIONS' : 'ATM Operations'}
</p>
<h1>Audit Logs</h1>
          <p className="page-copy">Immutable record of who did what, to which ATM or incident, when, and with what result.</p>
        </div>
        <button type="button" className="button secondary" onClick={() => audit.refetch()}>Refresh</button>
      </div>

      <div className="filter-bar">
        <div className="page-search-bar" style={{ flex: 1, minWidth: 220, margin: 0 }}>
          <Search size={15} aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search actions, entities..."
            aria-label="Search actions, entities"
          />
        </div>
        <select className="field-input" style={{ width: 180 }} value={entity} aria-label="Filter by entity" onChange={(event) => setEntity(event.target.value)}>
          <option value="">All entities</option>
          {ENTITY_OPTIONS.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select className="field-input" style={{ width: 200 }} value={action} aria-label="Filter by action" onChange={(event) => setAction(event.target.value)}>
          <option value="">All actions</option>
          {actions.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        {(search || entity || action) ? (
          <button type="button" className="button secondary small" onClick={() => { setSearch(''); setEntity(''); setAction(''); }}>Clear</button>
        ) : null}
      </div>

      <div className="panel">
        {audit.isLoading ? <LoadingState label="Loading audit trail..." /> : null}
        {audit.isError ? <ErrorState message="Unable to load audit logs. Please check your permissions." /> : null}
        {!audit.isLoading && !audit.isError && (audit.data || []).length === 0 ? (
          <EmptyState title="No audit records match your search." />
        ) : null}
        {!audit.isLoading && !audit.isError && (audit.data || []).length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Reference</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {(audit.data || []).map((row) => (
                  <tr key={row.id}>
                    <td><small>{new Date(row.created_at).toLocaleString()}</small></td>
                    <td>{row.user_name || 'System'}</td>
                    <td><strong>{row.action}</strong></td>
                    <td>{row.entity}</td>
                    <td><small>{row.entity_id}</small></td>
                    <td><small className="audit-change">{formatChange(row)}</small></td>
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

function prettyValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatChange(row: AuditRow) {
  const prev = row.previous_value ?? {};
  const next = row.new_value ?? {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const parts: string[] = [];
  keys.forEach((key) => {
    const before = prev[key];
    const after = next[key];
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    if (after === undefined) return;
    parts.push(`${key.replaceAll('_', ' ')}: ${prettyValue(before)} → ${prettyValue(after)}`);
  });
  if (parts.length > 0) return parts.join(' · ');
  if (Object.keys(next).length === 0) return '—';
  return Object.entries(next).map(([k, v]) => `${k.replaceAll('_', ' ')}: ${prettyValue(v)}`).join(' · ');
}
