import type { PropsWithChildren } from 'react';
import { useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  MonitorPlay,
  Settings,
  ShieldCheck,
  Siren,
  Wrench,
  Search,
  Menu,
  LogOut,
  FileBarChart2,
  Building2,
  RefreshCw,
} from 'lucide-react';

import { api } from '../lib/api';
import { hasPermission, roleLabel, useAuth } from '../context/AuthContext';
import type { DashboardSummary } from '../types/api';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
}

const groups: { title: string; items: NavItem[] }[] = [
  { title: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    title: 'Operations',
    items: [
      { to: '/atms', label: 'ATMs', icon: Building2, permission: 'atm.view' },
      { to: '/incidents', label: 'Incidents', icon: Siren, permission: 'incident.view' },
      { to: '/troubleshooting', label: 'Troubleshooting', icon: Wrench, permission: 'troubleshooting.view' },
      { to: '/escalations', label: 'Escalations', icon: ChevronRight, permission: 'incident.view' },
      { to: '/maintenance', label: 'Maintenance', icon: ClipboardList, permission: 'maintenance.view' },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { to: '/monitoring', label: 'Monitoring', icon: MonitorPlay, permission: 'atm.view' },
      { to: '/reports', label: 'Reports', icon: FileBarChart2, permission: 'report.view' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/audit-logs', label: 'Audit Logs', icon: ShieldCheck, permission: 'audit.view' },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

type SearchResults = {
  atms: { id: number; reference: string; name: string; branch: string; status: string }[];
  incidents: { id: number; incident_number: string; title: string; atm_reference: string; status: string; priority: string }[];
  branches: { id: number; name: string; code: string }[];
  technicians: { id: number; name: string; username: string }[];
};

type NotificationRow = { id: number; title: string; body: string; incident: number | null; incident_ref?: string; is_read: boolean; created_at: string };

export default function AppLayout({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();
  const queryClient = useQueryClient();
  const { currentUser, logout } = useAuth();
  const district = useQuery({
    queryKey: ['district-context'],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((response) => response.data),
    staleTime: 60000,
  });
  const districtName = district.data?.district_name || 'District';
  const label = roleLabel(currentUser?.role);

  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread_count/').then((r) => r.data.count),
    refetchInterval: 60000,
  });
  const notifications = useQuery({
    queryKey: ['notifications', 'panel'],
    queryFn: async () => {
      const { data } = await api.get<NotificationRow[] | { results: NotificationRow[] }>('/notifications/');
      const rows = Array.isArray(data) ? data : data.results;
      return rows.slice(0, 6);
    },
  });
  const searchQuery = useQuery({
    queryKey: ['global-search', search],
    queryFn: () => api.get<SearchResults>(`/search/?q=${encodeURIComponent(search)}`).then((r) => r.data),
    enabled: search.trim().length >= 2,
  });
  const hasSearchResults = useMemo(() => {
    const data = searchQuery.data;
    if (!data) return false;
    return data.atms.length + data.incidents.length + data.branches.length + data.technicians.length > 0;
  }, [searchQuery.data]);

  async function handleLogout() {
    await logout();
    queryClient.clear();
    if (location.pathname !== '/login') window.location.assign('/login');
  }

  async function markNotificationRead(id: number) {
    await api.post(`/notifications/${id}/mark_read/`);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-mark">ATM</div>
          <div>
            <strong>ATM SUPPORT</strong>
            <span>{districtName}</span>
          </div>
        </div>
        <div className="system-status">
          <span className="live-dot" />
          <div>
            <strong>System Operational</strong>
            <small>Single district, single dashboard</small>
          </div>
        </div>
        <nav className="sidebar-nav">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.permission || hasPermission(currentUser, item.permission));
            if (!items.length) return null;
            return (
              <div key={group.title} className="nav-group">
                <p>{group.title}</p>
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">{(currentUser?.full_name || currentUser?.username || 'U').slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{currentUser?.full_name || currentUser?.username}</strong>
            <small>{label}</small>
          </div>
          <button className="icon-button" onClick={handleLogout} aria-label="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-only" onClick={() => setOpen((value) => !value)} aria-label="Open menu">
              <Menu size={18} />
            </button>
            <div>
              <span className="topbar-kicker">ATM Operations</span>
              <strong>{districtName}</strong>
            </div>
          </div>
          <div className="topbar-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ATM, incident, branch..."
            />
            {search.trim().length >= 2 && (
              <div className="search-panel">
                {searchQuery.isLoading ? <p className="search-empty">Searching…</p> : null}
                {!searchQuery.isLoading && !hasSearchResults ? <p className="search-empty">No results found.</p> : null}
                {searchQuery.data?.atms.map((atm) => (
                  <Link key={`atm-${atm.id}`} to={`/atms/${atm.id}`} className="search-result" onClick={() => setSearch('')}>
                    <strong>{atm.reference}</strong>
                    <small>{atm.branch} · {atm.status}</small>
                  </Link>
                ))}
                {searchQuery.data?.incidents.map((incident) => (
                  <Link key={`incident-${incident.id}`} to={`/incidents/${incident.id}`} className="search-result" onClick={() => setSearch('')}>
                    <strong>{incident.incident_number}</strong>
                    <small>{incident.atm_reference} · {incident.priority} · {incident.status}</small>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="topbar-right">
            <span className="last-updated">
              Last updated: {district.data?.last_updated ? new Date(district.data.last_updated).toLocaleString() : new Date().toLocaleString()}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh"
              onClick={() => {
                queryClient.invalidateQueries();
                district.refetch();
                unread.refetch();
                notifications.refetch();
              }}
            >
              <RefreshCw size={18} />
            </button>
            <button className="icon-button notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Notifications">
              <Bell size={18} />
              {Boolean(unread.data) && <em>{unread.data}</em>}
            </button>
            {notificationsOpen && (
              <div className="notification-panel">
                <div className="notification-panel-head">
                  <strong>Notifications</strong>
                  <Link to="/notifications" onClick={() => setNotificationsOpen(false)}>View all</Link>
                </div>
                {(notifications.data || []).length === 0 ? <p className="search-empty">No notifications.</p> : null}
                {(notifications.data || []).map((notification) => (
                  <div key={notification.id} className={`notification-item ${notification.is_read ? '' : 'unread'}`}>
                    <div>
                      <strong>{notification.title}</strong>
                      <small>{notification.body || notification.incident_ref || 'System event'}</small>
                    </div>
                    {!notification.is_read && (
                      <button className="text-button" onClick={() => markNotificationRead(notification.id)}>Mark read</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>
        <main className="page-container">{children}</main>
      </div>
    </div>
  );
}
