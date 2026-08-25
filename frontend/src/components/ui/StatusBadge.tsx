const labels: Record<string, string> = {
  OPERATIONAL: 'Operational',
  AVAILABLE: 'Available',
  OFFLINE: 'Offline',
  UNAVAILABLE: 'Unavailable',
  FAULT: 'Fault',
  COMMUNICATION_PROBLEM: 'Communication Problem',
  MAINTENANCE: 'Maintenance',
  ERROR: 'Error',
  HEALTHY: 'Healthy',
  WARNING: 'Warning',
  DEGRADED: 'Degraded',
  CRITICAL: 'Critical',
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
  STARTED: 'Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ONLINE: 'Online',
  NORMAL: 'Normal',
  UNKNOWN: 'Unknown',
};

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge status-${value.toLowerCase()}`}>{labels[value] || value.replaceAll('_', ' ')}</span>;
}

export function PriorityBadge({ value }: { value: string }) {
  return <span className={`priority-badge priority-${value.toLowerCase()}`}><i />{labels[value] || value}</span>;
}
