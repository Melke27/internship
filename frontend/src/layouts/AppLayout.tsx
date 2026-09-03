import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, LogOut, Menu, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, ShieldCheck, Wifi } from 'lucide-react';

import { api } from '../lib/api';
import { showToast } from '../lib/toast';
import { hasPermission, portalForUser, roleLabel, useAuth } from '../context/AuthContext';
import { navForPortal, portalBrand, FIXED_DISTRICT_NAME, type NavItem } from '../lib/navigation';
import type { DashboardSummary } from '../types/api';

type SearchResults = {
  atms: { id: number; reference: string; name: string; branch: string; status: string }[];
  incidents: {
    id: number;
    incident_number: string;
    title: string;
    atm_reference: string;
    status: string;
    priority: string;
  }[];
  branches: { id: number; name: string; code: string }[];
  technicians: { id: number; name: string; username: string }[];
  reports?: { id: number; report_id: string; atm_reference: string; status: string }[];
  maintenance?: { id: number; maintenance_id: string; atm_reference: string; status: string }[];
};

type NotificationRow = {
  id: number;
  title: string;
  body: string;
  incident: number | null;
  incident_ref?: string;
  is_read: boolean;
  created_at: string;
};

export default function AppLayout({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('cbe_sidebar_collapsed') === 'true',
  );
  const [search, setSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const queryClient = useQueryClient();
  const { currentUser, logout } = useAuth();
  const portal = portalForUser(currentUser);
  const brand = portalBrand(portal);
  const groups = navForPortal(portal);
  const branchName = currentUser?.branch_name || 'Branch not assigned';

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('cbe_sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
        setSearch('');
        setOpen(false);
        return;
      }
      const key = event.key.toLowerCase();
      const searchable = portal !== 'branch';
      if (searchable && ((event.ctrlKey && key === 'k') || key === '/')) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [portal]);

  const district = useQuery({
    queryKey: ['district-context'],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((response) => response.data),
    staleTime: 60000,
  });
  const label = roleLabel(currentUser?.normalized_role || currentUser?.role);

  const critical = district.data?.critical_atms ?? district.data?.critical_incidents ?? 0;
  const openIncidents = district.data?.open_incidents ?? 0;

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
    refetchInterval: 30000,
  });

  const seenNotifIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (notifications.data) {
      const unreadList = notifications.data.filter((n) => !n.is_read);
      if (seenNotifIds.current.size === 0) {
        unreadList.forEach((n) => seenNotifIds.current.add(n.id));
      } else {
        unreadList.forEach((n) => {
          if (!seenNotifIds.current.has(n.id)) {
            seenNotifIds.current.add(n.id);
            showToast(`New alert: ${n.title}`, 'info');
          }
        });
      }
    }
  }, [notifications.data]);
  const searchQuery = useQuery({
    queryKey: ['global-search', search],
    queryFn: () => api.get<SearchResults>(`/search/?q=${encodeURIComponent(search)}`).then((r) => r.data),
    enabled: search.trim().length >= 2 && portal !== 'branch',
  });
  const hasSearchResults = useMemo(() => {
    const data = searchQuery.data;
    if (!data) return false;
    return (
      data.atms.length +
        data.incidents.length +
        data.branches.length +
        data.technicians.length +
        (data.reports?.length || 0) +
        (data.maintenance?.length || 0) >
      0
    );
  }, [searchQuery.data]);

  const currentNav = useMemo(() => {
    const match = (item: NavItem) => {
      const [pathname, query = ''] = item.to.split('?');
      if (location.pathname !== pathname) return false;
      return query ? location.search === `?${query}` : !location.search;
    };
    for (const group of groups) {
      const found = group.items.find(match);
      if (found) return { group: group.title, item: found };
    }
    return null;
  }, [groups, location]);

  function isCurrentNavItem(item: NavItem) {
    const [pathname, query = ''] = item.to.split('?');
    if (location.pathname !== pathname) return false;
    return query ? location.search === `?${query}` : !location.search;
  }

  const handleLogout = useCallback(async () => {
    await logout();
    queryClient.clear();
    if (location.pathname !== '/login') window.location.assign('/login');
  }, [logout]);

  const markNotificationRead = useCallback(
    async (id: number) => {
      await api.post(`/notifications/${id}/mark_read/`);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    [queryClient],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    district.refetch();
    unread.refetch();
    notifications.refetch();
    setTimeout(() => setRefreshing(false), 700);
  }, [queryClient]);

  return (
    <div className={`shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div className="brand-mark brand-logo">
              <img src="/logo.jpg" alt="Commercial Bank of Ethiopia" />
            </div>
            {!collapsed && (
              <div>
                <strong>{brand.title}</strong>
                <span>{portal === 'branch' && currentUser?.branch_name ? currentUser.branch_name : FIXED_DISTRICT_NAME}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn icon-button desktop-only"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        {!collapsed && (
          <div className="system-status">
            <span className="live-dot" />
            <div>
              <strong>{portal === 'branch' ? 'Branch portal connected' : 'System operational'}</strong>
              <small>
                {portal === 'branch' ? 'Live ATM reporting and service status' : 'One district · shared operations data'}
              </small>
            </div>
          </div>
        )}
        {portal === 'branch' && !collapsed ? (
          <div className="branch-context" aria-label="Current branch context">
            <span>YOUR BRANCH</span>
            <strong>{branchName}</strong>
            <small>ATM status and reports are limited to this branch.</small>
          </div>
        ) : null}
        <nav className="sidebar-nav">
          {groups.map((group) => {
            const items = group.items.filter(
              (item) => !item.permission || hasPermission(currentUser, item.permission),
            );
            if (!items.length) return null;
            return (
              <div key={group.title} className="nav-group">
                {!collapsed && <p>{group.title}</p>}
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={`${item.to}-${item.label}`}
                      to={item.to}
                      end={item.to === '/dashboard' || item.to === '/branch' || item.to === '/maintenance-ops'}
                      onClick={() => setOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={() => `nav-link ${isCurrentNavItem(item) ? 'active' : ''}`}
                    >
                      <Icon size={18} />
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">
            {(currentUser?.full_name || currentUser?.username || 'U').slice(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <div>
              <strong>{currentUser?.full_name || currentUser?.username}</strong>
              <small>{label}</small>
            </div>
          )}
          <button type="button" className="icon-button" onClick={handleLogout} aria-label="Logout" title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button mobile-only"
              onClick={() => setOpen((value) => !value)}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <button
              type="button"
              className="topbar-collapse-btn icon-button desktop-only"
              onClick={toggleCollapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{ marginRight: 8 }}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <div>
              <span className="topbar-kicker">{currentNav ? `${brand.kicker} / ${currentNav.group}` : brand.kicker}</span>
              <strong>{currentNav ? currentNav.item.label : portal === 'branch' ? branchName : FIXED_DISTRICT_NAME}</strong>
            </div>
          </div>

          {portal !== 'branch' ? (
            <div className="topbar-search">
              <Search size={16} aria-hidden />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search ATM, branch, incident..."
                aria-label="Global search"
              />
              {!search && (
                <span className="search-kbd-hint">
                  <kbd>Ctrl</kbd><kbd>K</kbd>
                </span>
              )}
              {search.trim().length >= 2 && (
                <div className="search-panel">
                  {searchQuery.isLoading ? <p className="search-empty">Searching…</p> : null}
                  {!searchQuery.isLoading && !hasSearchResults ? (
                    <p className="search-empty">No results found.</p>
                  ) : null}
                  {searchQuery.data?.atms.map((atm) => (
                    <Link
                      key={`atm-${atm.id}`}
                      to={`/atms/${atm.id}`}
                      className="search-result"
                      onClick={() => setSearch('')}
                    >
                      <strong>{atm.reference}</strong>
                      <small>
                        {atm.branch} · {atm.status.replaceAll('_', ' ')}
                      </small>
                    </Link>
                  ))}
                  {searchQuery.data?.incidents.map((incident) => (
                    <Link
                      key={`incident-${incident.id}`}
                      to={`/incidents/${incident.id}`}
                      className="search-result"
                      onClick={() => setSearch('')}
                    >
                      <strong>{incident.incident_number}</strong>
                      <small>
                        {incident.atm_reference} · {incident.priority} · {incident.status}
                      </small>
                    </Link>
                  ))}
                  {searchQuery.data?.maintenance?.map((job) => (
                    <Link
                      key={`mj-${job.id}`}
                      to={`/maintenance?id=${job.id}`}
                      className="search-result"
                      onClick={() => setSearch('')}
                    >
                      <strong>{job.maintenance_id}</strong>
                      <small>
                        {job.atm_reference} · {job.status}
                      </small>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="topbar-status">
              <Wifi size={15} /> Branch ATM reporting • live
            </div>
          )}

          <div className="topbar-right">
            {portal !== 'branch' && (
              <span
                className={`health-pill ${critical > 0 ? 'danger' : 'ok'}`}
                title={`${openIncidents} open incidents · ${critical} critical`}
              >
                <ShieldCheck size={13} />
                {critical > 0 ? `${critical} critical` : 'All systems clear'}
              </span>
            )}
            <span className="last-updated">
              Updated {district.data?.last_updated ? new Date(district.data.last_updated).toLocaleTimeString() : '—'}
            </span>
            <button
              className={`icon-button ${refreshing ? 'is-spinning' : ''}`}
              aria-label="Refresh"
              onClick={handleRefresh}
            >
              <RefreshCw size={18} />
            </button>
            <button
              className="icon-button notification-button"
              onClick={() => setNotificationsOpen((value) => !value)}
              aria-label="Notifications"
            >
              <Bell size={18} aria-hidden />
              {Boolean(unread.data) && <em>{unread.data}</em>}
            </button>
            {notificationsOpen && (
              <div className="notification-panel" role="dialog" aria-label="Notifications">
                <div className="notification-panel-head">
                  <strong>Notifications</strong>
                  <Link to="/notifications" onClick={() => setNotificationsOpen(false)}
                    style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>
                    View all
                  </Link>
                </div>
                {(notifications.data || []).length === 0 ? (
                  <div className="notification-panel-empty">
                    <BellOff size={28} aria-hidden />
                    <span>You're all caught up!</span>
                  </div>
                ) : null}
                {(notifications.data || []).map((notification) => (
                  <div
                    key={notification.id}
                    className={`notification-item ${notification.is_read ? '' : 'unread'}`}
                  >
                    <div className="notification-item-icon">
                      <Bell size={14} aria-hidden />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{notification.title}</strong>
                      <small>{notification.body || notification.incident_ref || 'System event'}</small>
                      <span className="notification-item-time">
                        {new Date(notification.created_at).toLocaleString()}
                      </span>
                    </div>
                    {!notification.is_read && (
                      <button className="text-button" style={{ flexShrink: 0 }} onClick={() => markNotificationRead(notification.id)}>
                        Mark read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {notificationsOpen ? (
              <button
                className="notification-backdrop"
                aria-label="Close notifications"
                onClick={() => setNotificationsOpen(false)}
              />
            ) : null}
          </div>
        </header>
        <main className="page-container">{children}</main>
      </div>
      {open ? (
        <button className="sidebar-backdrop mobile-only" aria-label="Close menu" onClick={() => setOpen(false)} />
      ) : null}
    </div>
  );
}