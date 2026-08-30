import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  CircleOff,
  OctagonAlert,
  Settings2,
  WifiOff,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const labels: Record<string, string> = {
  OPERATIONAL: 'Operational',
  AVAILABLE: 'Available',
  OFFLINE: 'Offline',
  UNAVAILABLE: 'Unavailable',
  FAULT: 'Fault',
  COMMUNICATION_PROBLEM: 'Communication Problem',
  MAINTENANCE: 'Maintenance',
  UNDER_REPAIR: 'Under Repair',
  ERROR: 'Error',
  HEALTHY: 'Healthy',
  WARNING: 'Warning',
  DEGRADED: 'Degraded',
  CRITICAL: 'Critical',
  UNKNOWN: 'Unknown',
  REPORTED: 'Reported',
  ACKNOWLEDGED: 'Acknowledged',
  ASSIGNED: 'Assigned',
  INVESTIGATING: 'Investigating',
  TROUBLESHOOTING: 'Troubleshooting',
  WAITING: 'Waiting',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  VERIFIED: 'Verified',
  CLOSED: 'Closed',
  SCHEDULED: 'Scheduled',
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  STARTED: 'Started',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  TESTING: 'Testing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ONLINE: 'Online',
  NORMAL: 'Normal',
  SUBMITTED: 'Submitted',
  RECEIVED: 'Received',
  REVIEWING: 'Reviewing',
  CONVERTED_TO_INCIDENT: 'Converted to Incident',
  REVIEWED: 'Reviewed',
  DISMISSED: 'Dismissed',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  PASSED: 'Passed',
  FAILED: 'Failed',
  PARTIAL: 'Partial',
  PENDING: 'Pending',
};

export function statusLabel(value?: string | null) {
  if (!value) return '';
  return labels[value] || value.replaceAll('_', ' ');
}

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`status-badge status-${value.toLowerCase()}`}>
      {statusLabel(value)}
    </span>
  );
}

export function PriorityBadge({ value }: { value: string }) {
  return (
    <span className={`priority-badge priority-${value.toLowerCase()}`}>
      <i />
      {statusLabel(value) || value}
    </span>
  );
}

export function OperationalBadge({ active }: { active: boolean }) {
  return <StatusBadge value={active ? 'ACTIVE' : 'INACTIVE'} />;
}

const icons: Record<string, LucideIcon> = {
  OPERATIONAL: CheckCircle2,
  WARNING: AlertTriangle,
  DEGRADED: AlertTriangle,
  FAULT: CircleAlert,
  OFFLINE: WifiOff,
  CRITICAL: OctagonAlert,
  MAINTENANCE: Wrench,
  UNDER_REPAIR: Settings2,
  INACTIVE: CircleOff,
  UNKNOWN: CircleOff,
};

export function StatusIcon({ value, size = 16 }: { value: string; size?: number }) {
  const Icon = icons[value] || CircleAlert;
  return <Icon size={size} aria-hidden />;
}

export function DualStatus({
  active,
  technical,
}: {
  active: boolean;
  technical: string;
}) {
  const critical = technical === 'CRITICAL';
  return (
    <div className={`dual-status ${critical ? 'is-critical' : ''}`}>
      <span className={`live-dot tone-${(critical ? 'CRITICAL' : technical).toLowerCase()}`} />
      <div>
        <strong>{critical ? 'Critical' : active ? 'Active' : 'Inactive'}</strong>
        <small>{critical ? 'Immediate Attention' : statusLabel(technical)}</small>
      </div>
    </div>
  );
}
