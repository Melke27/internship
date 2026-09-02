import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleOff,
  Clock,
  OctagonAlert,
  Search,
  Settings2,
  ShieldCheck,
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

export function StatusBadge({ value, showIcon = true }: { value: string; showIcon?: boolean }) {
  const upper = (value || '').toUpperCase();
  const Icon = icons[upper];
  
  let pulseTone = '';
  if (['OPERATIONAL', 'HEALTHY', 'ONLINE', 'PASSED'].includes(upper)) pulseTone = 'green';
  else if (['CRITICAL', 'FAULT', 'FAILED'].includes(upper)) pulseTone = 'red';
  else if (['WARNING', 'DEGRADED', 'MAINTENANCE', 'UNDER_REPAIR', 'ESCALATED'].includes(upper)) pulseTone = 'amber';

  return (
    <span className={`status-badge status-${(value || '').toLowerCase()}`}>
      {pulseTone ? <span className={`pulse-dot ${pulseTone}`} aria-hidden /> : null}
      {showIcon && Icon != null && !pulseTone ? <Icon size={12} style={{ flexShrink: 0 }} aria-hidden /> : null}
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
  AVAILABLE: CheckCircle2,
  ACTIVE: CheckCircle2,
  HEALTHY: CheckCircle2,
  ONLINE: CheckCircle2,
  NORMAL: CheckCircle2,
  PASSED: CircleCheck,
  RESOLVED: CircleCheck,
  VERIFIED: ShieldCheck,
  CLOSED: CheckCircle2,
  COMPLETED: CheckCircle2,
  WARNING: AlertTriangle,
  DEGRADED: AlertTriangle,
  FAULT: CircleAlert,
  OFFLINE: WifiOff,
  COMMUNICATION_PROBLEM: WifiOff,
  CRITICAL: OctagonAlert,
  MAINTENANCE: Wrench,
  UNDER_REPAIR: Settings2,
  INACTIVE: CircleOff,
  UNKNOWN: CircleOff,
  INVESTIGATING: Search,
  TROUBLESHOOTING: Activity,
  IN_PROGRESS: Activity,
  TESTING: Settings2,
  ESCALATED: ArrowUpRight,
  REPORTED: CircleAlert,
  ACKNOWLEDGED: CircleDot,
  ASSIGNED: CircleDot,
  SUBMITTED: Clock,
  RECEIVED: Clock,
  REVIEWING: Search,
  CONVERTED_TO_INCIDENT: ArrowUpRight,
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
  const tone = critical ? 'red' : active ? 'green' : 'amber';
  return (
    <div className={`dual-status ${critical ? 'is-critical' : ''}`}>
      <span className={`pulse-dot ${tone}`} />
      <div>
        <strong>{critical ? 'Critical' : active ? 'Active' : 'Inactive'}</strong>
        <small>{critical ? 'Immediate Attention' : statusLabel(technical)}</small>
      </div>
    </div>
  );
}

