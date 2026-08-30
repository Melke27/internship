import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';

export type UserRole =
  | 'DISTRICT_ADMIN'
  | 'OPERATIONS_OFFICER'
  | 'MAINTENANCE_SUPERVISOR'
  | 'TECHNICIAN'
  | 'BRANCH_MANAGER'
  | 'BRANCH_USER'
  | 'AUDITOR'
  | 'ADMINISTRATOR'
  | 'SUPERVISOR'
  | 'MONITORING_OFFICER';

export type Portal = 'district' | 'maintenance' | 'branch';

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  normalized_role?: string;
  portal?: Portal;
  district: number | null;
  branch: number | null;
  district_name?: string | null;
  branch_name?: string | null;
  is_active: boolean;
  permissions: string[];
}

interface AuthState {
  currentUser: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  getUserPermissions: (role: UserRole | string) => string[];
  userRole: string | null;
  hasPermission: (user: CurrentUser | null, permission: string) => boolean;
  canManageOrganization: (user: CurrentUser | null) => boolean;
  canManageUsers: (user: CurrentUser | null) => boolean;
  isSupervisorUser: (user: CurrentUser | null) => boolean;
  isTechnicianUser: (user: CurrentUser | null) => boolean;
  isBranchUser: (user: CurrentUser | null) => boolean;
  isOperationsUser: (user: CurrentUser | null) => boolean;
  portalHome: (user: CurrentUser | null) => string;
}

function normalizeRole(role?: string | null) {
  const mapping: Record<string, string> = {
    ADMINISTRATOR: 'DISTRICT_ADMIN',
    SUPERVISOR: 'MAINTENANCE_SUPERVISOR',
    MONITORING_OFFICER: 'OPERATIONS_OFFICER',
  };
  return role ? mapping[role] || role : '';
}

export function hasPermission(user: CurrentUser | null, permission: string) {
  if (!user) return false;
  return user.permissions.includes(permission);
}

export function canManageOrganization(user: CurrentUser | null) {
  if (!user) return false;
  return (
    user.permissions.includes('district.create') ||
    ['DISTRICT_ADMIN', 'ADMINISTRATOR'].includes(normalizeRole(user.role) || user.role)
  );
}

export function canManageUsers(user: CurrentUser | null) {
  if (!user) return false;
  return (
    user.permissions.includes('user.create') ||
    ['DISTRICT_ADMIN', 'ADMINISTRATOR'].includes(normalizeRole(user.role) || user.role)
  );
}

export function isSupervisorUser(user: CurrentUser | null) {
  if (!user) return false;
  return ['DISTRICT_ADMIN', 'ADMINISTRATOR', 'MAINTENANCE_SUPERVISOR', 'SUPERVISOR'].includes(
    normalizeRole(user.role) || user.role,
  );
}

export function isTechnicianUser(user: CurrentUser | null) {
  if (!user) return false;
  return (
    (normalizeRole(user.role) || user.role) === 'TECHNICIAN' || isSupervisorUser(user)
  );
}

export function isBranchUser(user: CurrentUser | null) {
  if (!user) return false;
  return ['BRANCH_USER', 'BRANCH_MANAGER'].includes(normalizeRole(user.role) || user.role);
}

export function isOperationsUser(user: CurrentUser | null) {
  if (!user) return false;
  const role = normalizeRole(user.role) || user.role;
  return [
    'DISTRICT_ADMIN',
    'ADMINISTRATOR',
    'OPERATIONS_OFFICER',
    'MONITORING_OFFICER',
    'MAINTENANCE_SUPERVISOR',
    'SUPERVISOR',
  ].includes(role);
}

export function portalForUser(user: CurrentUser | null): Portal {
  if (!user) return 'district';
  if (user.portal) return user.portal;
  const role = normalizeRole(user.role) || user.role;
  if (['BRANCH_USER', 'BRANCH_MANAGER'].includes(role)) return 'branch';
  if (['TECHNICIAN', 'MAINTENANCE_SUPERVISOR', 'SUPERVISOR'].includes(role)) return 'maintenance';
  return 'district';
}

export function portalHome(user: CurrentUser | null) {
  const portal = portalForUser(user);
  if (portal === 'branch') return '/branch';
  if (portal === 'maintenance') return '/maintenance-ops';
  return '/dashboard';
}

export function roleLabel(role?: string | null) {
  const labels: Record<string, string> = {
    DISTRICT_ADMIN: 'District Admin',
    ADMINISTRATOR: 'District Admin',
    OPERATIONS_OFFICER: 'Operations Officer',
    MONITORING_OFFICER: 'Operations Officer',
    MAINTENANCE_SUPERVISOR: 'Maintenance Supervisor',
    SUPERVISOR: 'Maintenance Supervisor',
    TECHNICIAN: 'Technician',
    BRANCH_MANAGER: 'Branch Manager',
    BRANCH_USER: 'Branch User',
    AUDITOR: 'Auditor',
  };
  return role ? labels[role] || role.replaceAll('_', ' ') : '';
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setLoading] = useState<boolean>(Boolean(localStorage.getItem('cbe_access_token')));

  async function fetchMe(): Promise<CurrentUser> {
    const { data } = await api.get<CurrentUser>('/auth/me/');
    setCurrentUser(data);
    return data;
  }

  useEffect(() => {
    if (localStorage.getItem('cbe_access_token')) {
      fetchMe()
        .catch(() => {
          localStorage.removeItem('cbe_access_token');
          localStorage.removeItem('cbe_refresh_token');
        })
        .finally(() => setLoading(false));
    }
  }, []);

  async function login(username: string, password: string) {
    const { data } = await api.post('/auth/token/', { username, password });
    localStorage.setItem('cbe_access_token', data.access);
    localStorage.setItem('cbe_refresh_token', data.refresh);
    try {
      return await fetchMe();
    } catch (e) {
      await logout();
      throw e;
    }
  }

  async function logout() {
    const refresh = localStorage.getItem('cbe_refresh_token');
    try {
      if (refresh) await api.post('/auth/logout/', { refresh });
    } catch {
      /* token may already be expired */
    }
    localStorage.removeItem('cbe_access_token');
    localStorage.removeItem('cbe_refresh_token');
    setCurrentUser(null);
  }

  function getUserPermissions(_role: UserRole | string) {
    return currentUser?.permissions || [];
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: Boolean(currentUser),
        isLoading,
        login,
        logout,
        refresh: async () => {
          await fetchMe();
        },
        getUserPermissions,
        userRole: currentUser?.role || null,
        hasPermission,
        canManageOrganization,
        canManageUsers,
        isSupervisorUser,
        isTechnicianUser,
        isBranchUser,
        isOperationsUser,
        portalHome,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
