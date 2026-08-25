import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';

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

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const audit = useQuery({
    queryKey: ['audit-logs', debounced],
    queryFn: () =>
      list<AuditRow>(`/audit-logs/?ordering=-created_at${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`),
    placeholderData: (previous) => previous,
  });

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">System</p>
          <h1>Audit Logs</h1>
          <p className="page-copy">Immutable record of who did what, to which ATM or incident, when, and with what result.</p>
        </div>
        <input
          className="field-input"
          placeholder="Search actions, entities..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="panel">
        {audit.isLoading ? <LoadingState label="Loading audit trail..." /> : null}
        {audit.isError ? <ErrorState message="You may not have permission to view audit logs." /> : null}
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
                    <td><small>{formatChange(row)}</small></td>
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

function formatChange(row: AuditRow) {
  const prev = row.previous_value ? JSON.stringify(row.previous_value) : '';
  const next = row.new_value ? JSON.stringify(row.new_value) : '';
  if (!prev && !next) return '—';
  if (!prev) return next;
  return `${prev} → ${next}`;
}
