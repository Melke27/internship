import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { api } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';

interface NotificationRow {
  id: number;
  title: string;
  body: string;
  kind: string;
  is_read: boolean;
  created_at: string;
  incident: number | null;
  incident_ref?: string;
}

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => list<NotificationRow>('/notifications/'),
  });
  const markRead = useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/mark_read/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    },
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/mark_all_read/'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    },
  });

  const rows = notifications.data || [];

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">System</p>
          <h1>Notifications</h1>
          <p className="page-copy">Operational alerts generated from real ATM and incident events in the district.</p>
        </div>
        {rows.some((notification) => !notification.is_read) ? (
          <button className="button secondary" onClick={() => markAll.mutate()}>Mark all read</button>
        ) : null}
      </div>
      <div className="panel">
        {notifications.isLoading ? <LoadingState label="Loading notifications..." /> : null}
        {notifications.isError ? <ErrorState message="Unable to load notifications." /> : null}
        {rows.length === 0 && !notifications.isLoading ? (
          <EmptyState
            title="No notifications"
            description="You will be alerted here when ATMs go offline, incidents are created, escalated or resolved."
          />
        ) : null}
        {rows.length > 0 ? (
          <div className="list-stack">
            {rows.map((notification) => (
              <div key={notification.id} className={`list-card ${notification.is_read ? '' : 'unread'}`} style={notification.is_read ? undefined : { background: '#eff6ff' }}>
                <div>
                  <strong>{notification.title}</strong>
                  <small>{notification.body}</small>
                  <small>{new Date(notification.created_at).toLocaleString()}{notification.incident_ref ? ` · ${notification.incident_ref}` : ''}</small>
                </div>
                <div className="row-actions">
                  {notification.incident ? <Link className="button secondary small" to={`/incidents/${notification.incident}`}>Open</Link> : null}
                  {!notification.is_read ? (
                    <button className="button secondary small" onClick={() => markRead.mutate(notification.id)}>Mark read</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
