export type UserRole = 'ADMINISTRATOR' | 'SUPERVISOR' | 'TECHNICIAN' | 'MONITORING_OFFICER' | 'AUDITOR';

export interface User {
  id: number;
  username: string;
  email?: string;
  full_name: string;
  role: UserRole;
  district: number | null;
  branch: number | null;
  permissions?: string[];
  is_active?: boolean;
}

export interface Branch {
  id: number;
  name: string;
  code: string;
  status: string;
  district: number | null;
  district_name: string;
}

export interface ATMComponent {
  id: number;
  atm: number;
  component_type: string;
  status: string;
  condition: string;
  notes: string;
}

export interface ActiveIncidentSummary {
  id: number;
  incident_number: string;
  status: string;
  priority: string;
  category: string;
  title: string;
}

export interface ATM {
  id: number;
  reference: string;
  name: string;
  branch: number;
  branch_name: string;
  district_name: string;
  status: string;
  health: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  location: string;
  address: string;
  ip_address: string | null;
  installation_date: string | null;
  network_status: string;
  power_status: string;
  hardware_status: string;
  communication_status: string;
  last_checked: string | null;
  last_status_change: string | null;
  last_maintenance: string | null;
  next_maintenance: string | null;
  assigned_technician: number | null;
  assigned_technician_name?: string | null;
  active_incident?: ActiveIncidentSummary | null;
  components?: ATMComponent[];
}

export interface TroubleshootingAction {
  id: number;
  incident: number;
  technician: number;
  technician_name?: string | null;
  action_type: string;
  action: string;
  observation: string;
  result: string;
  next_action: string;
  remarks: string;
  created_at: string;
}

export interface Escalation {
  id: number;
  incident: number;
  reason: string;
  technical_findings: string;
  troubleshooting_summary: string;
  priority: string;
  required_team: string;
  assigned_team: string;
  escalated_by_name?: string | null;
  status: string;
  resolved_at: string | null;
  remarks: string;
  created_at: string;
}

export interface Resolution {
  id: number;
  incident: number;
  description: string;
  action_performed: string;
  final_status: string;
  technician_name?: string | null;
  resolved_at: string;
}

export interface Verification {
  id: number;
  notes: string;
  atm_available: boolean;
  issue_cleared: boolean;
  communication_working: boolean;
  approved_test_completed: boolean;
  verified_by_name?: string | null;
  created_at: string;
}

export interface Incident {
  id: number;
  incident_id: string;
  atm: number;
  atm_reference: string;
  branch_name: string;
  district_name: string;
  reported_by_name?: string | null;
  assigned_to: number | null;
  assigned_to_name?: string | null;
  category: string;
  priority: string;
  status: string;
  title: string;
  description: string;
  error_message: string;
  service_impact: string;
  final_result: string;
  escalation_status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  actions?: TroubleshootingAction[];
  escalations?: Escalation[];
  resolution?: Resolution | null;
  verification?: Verification | null;
}

export interface Maintenance {
  id: number;
  atm: number;
  atm_reference: string;
  branch_name: string;
  district_name: string;
  technician: number | null;
  technician_name?: string | null;
  maintenance_type: string;
  reason: string;
  work_performed: string;
  start_date: string | null;
  end_date: string | null;
  result: string;
  status: string;
  remarks: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  district_name: string;
  last_updated: string;
  branches: number;
  atms: number;
  open_incidents: number;
  critical_incidents: number;
  escalated_incidents: number;
  maintenance_count: number;
  resolved_today: number;
  atm_status: Record<string, number>;
  atm_health: Record<string, number>;
  attention_atms: Array<{
    id: number;
    reference: string;
    name: string;
    status: string;
    health: string;
    branch: string;
    network_status: string;
    hardware_status: string;
    last_checked: string | null;
    active_incident: string | null;
    active_incident_id: number | null;
  }>;
  recent_incidents: Array<{
    id: number;
    incident_id: string;
    title: string;
    status: string;
    priority: string;
    atm_reference: string;
    assigned_to_name: string | null;
    created_at: string;
  }>;
  recent_actions: Array<{
    id: number;
    action: string;
    result: string;
    technician: string;
    incident_id: string;
    atm: string;
    created_at: string;
  }>;
  recent_status_changes: Array<{
    id: number;
    atm_reference: string;
    old_status: string;
    new_status: string;
    reason: string;
    changed_by_name: string | null;
    created_at: string;
  }>;
  technician_workload: Array<{
    id: number;
    name: string;
    assigned_incidents: number;
    critical_incidents: number;
  }>;
}
