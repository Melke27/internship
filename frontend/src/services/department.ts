import { api } from '../lib/api';

export interface Department {
  id: number;
  name: string;
  code: string;
  district_name: string;
  head: number | null;
  head_name: string | null;
  head_email: string | null;
  department_type: 'OPERATIONS' | 'TECHNICAL' | 'MAINTENANCE' | 'AUDIT' | 'ADMINISTRATION';
  description: string;
  email: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE';
  user_count: number;
  open_incidents_count: number;
  active_maintenance_count: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentReport {
  id: number;
  name: string;
  code: string;
  department_type: string;
  status: string;
  head: string | null;
  staff_count: number;
  total_incidents: number;
  open_incidents: number;
  resolved_incidents: number;
  active_maintenance: number;
  sla_met_percentage: number;
}

export interface DepartmentSummary {
  id: number;
  name: string;
  code: string;
  department_type: string;
  district: string;
  status: string;
  head: string | null;
  total_users: number;
  open_incidents: number;
  active_maintenance: number;
  staff_members: Array<{
    id: number;
    name: string;
    email: string;
    role: string;
  }>;
}

export async function getDepartments(params?: {
  search?: string;
  status?: string;
  department_type?: string;
}): Promise<Department[]> {
  const res = await api.get('/departments/', { params });
  const data = res.data;
  if (data && Array.isArray(data.results)) {
    return data.results;
  }
  return Array.isArray(data) ? data : [];
}

export async function getDepartment(id: number): Promise<Department> {
  const res = await api.get(`/departments/${id}/`);
  return res.data;
}

export async function createDepartment(data: Partial<Department>): Promise<Department> {
  const res = await api.post('/departments/', data);
  return res.data;
}

export async function updateDepartment(id: number, data: Partial<Department>): Promise<Department> {
  const res = await api.patch(`/departments/${id}/`, data);
  return res.data;
}

export async function deactivateDepartment(
  id: number,
  reason: string
): Promise<{ department: Department; warning: any }> {
  const res = await api.post(`/departments/${id}/deactivate/`, { reason });
  return res.data;
}

export async function getDepartmentSummary(id: number): Promise<DepartmentSummary> {
  const res = await api.get(`/departments/${id}/summary/`);
  return res.data;
}

export async function getDepartmentReports(): Promise<DepartmentReport[]> {
  const res = await api.get('/reports/departments/');
  return res.data;
}
