import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  FileBarChart2,
  History,
  LayoutDashboard,
  MonitorPlay,
  Settings,
  ShieldCheck,
  Siren,
  Users,
  UserRound,
  Wrench,
} from 'lucide-react';

import type { Portal } from '../context/AuthContext';

export const FIXED_DISTRICT_NAME = 'Yeka District';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const DISTRICT_NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'ATM Operations',
    items: [
      { to: '/atms', label: 'ATMs', icon: Building2, permission: 'atm.view' },
      { to: '/active-faults', label: 'Active Faults', icon: AlertTriangle, permission: 'atm.view' },
      { to: '/incidents', label: 'Incidents', icon: Siren, permission: 'incident.view' },
      { to: '/branch-reports', label: 'Branch Reports', icon: ClipboardList, permission: 'branch_report.view' },
    ],
  },
  {
    title: 'Maintenance',
    items: [{ to: '/maintenance', label: 'Maintenance', icon: Wrench, permission: 'maintenance.view' }],
  },
  {
    title: 'Monitoring',
    items: [
      { to: '/monitoring', label: 'Live Monitoring', icon: MonitorPlay, permission: 'atm.view' },
      { to: '/status-history', label: 'Status History', icon: History, permission: 'atm.view' },
    ],
  },
  {
    title: 'Organization',
    items: [
      { to: '/branches', label: 'Branches', icon: Building2, permission: 'branch.view' },
      { to: '/users', label: 'Users', icon: Users, permission: 'user.view' },
    ],
  },
  {
    title: 'Reporting',
    items: [{ to: '/reports', label: 'Reports', icon: FileBarChart2, permission: 'report.view' }],
  },
  {
    title: 'System',
    items: [
      { to: '/audit-logs', label: 'Audit Logs', icon: ShieldCheck, permission: 'audit.view' },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const MAINTENANCE_NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ to: '/maintenance-ops', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    title: 'Maintenance',
    items: [{ to: '/maintenance', label: 'Maintenance Jobs', icon: Wrench, permission: 'maintenance.view' }],
  },
  {
    title: 'Technical',
    items: [
      { to: '/troubleshooting', label: 'Troubleshooting', icon: Wrench, permission: 'troubleshooting.view' },
      { to: '/escalations', label: 'Escalations', icon: Siren, permission: 'incident.view' },
    ],
  },
  {
    title: 'Reporting',
    items: [{ to: '/reports?scope=maintenance', label: 'Maintenance Reports', icon: FileBarChart2, permission: 'report.view' }],
  },
  {
    title: 'User',
    items: [{ to: '/settings', label: 'Profile', icon: UserRound }],
  },
];

export const BRANCH_NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ to: '/branch', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'ATM',
    items: [
      { to: '/branch/atms', label: 'My ATMs', icon: Building2, permission: 'atm.view' },
    ],
  },
  {
    title: 'Reporting',
    items: [
      { to: '/branch/report', label: 'Report ATM Fault', icon: AlertTriangle, permission: 'branch_report.create' },
      { to: '/branch/reports', label: 'My Reports', icon: ClipboardList, permission: 'branch_report.view' },
    ],
  },
  {
    title: 'History',
    items: [{ to: '/branch/reports?history=1', label: 'Report History', icon: History, permission: 'branch_report.view' }],
  },
  {
    title: 'User',
    items: [{ to: '/settings', label: 'Profile', icon: UserRound }],
  },
];

export function navForPortal(portal: Portal): NavGroup[] {
  if (portal === 'branch') return BRANCH_NAV;
  if (portal === 'maintenance') return MAINTENANCE_NAV;
  return DISTRICT_NAV;
}

export function portalBrand(portal: Portal) {
  if (portal === 'branch') return { title: 'CBE BRANCH ATM PORTAL', kicker: 'Branch Operations' };
  if (portal === 'maintenance') return { title: 'MAINTENANCE OPERATIONS', kicker: 'Maintenance' };
  return { title: 'ATM OPERATIONS', kicker: 'ATM Operations' };
}
