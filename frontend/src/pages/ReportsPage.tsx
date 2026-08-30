import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';

import { api } from '../lib/api';
import { showToast } from '../lib/toast';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/StateView';
import type { DashboardSummary, Maintenance } from '../types/api';

interface DistrictReport {
  district: string;
  code: string;
  branches: number;
  atms: number;
  atm_availability: number;
  incidents: number;
  open_incidents: number;
  escalations: number;
  resolved: number;
}

interface BranchReport {
  branch: string;
  district: string;
  code: string;
  atms: number;
  incidents: number;
  resolved: number;
  common_categories: { category: string; count: number }[];
}

interface TechnicianReport {
  technician: string;
  assigned: number;
  pending: number;
  resolved: number;
  escalations: number;
  avg_resolution_hours: number | null;
}

function list<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

export default function ReportsPage() {
  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard/').then((response) => response.data),
  });
  const districts = useQuery({
    queryKey: ['reports', 'districts'],
    queryFn: () => api.get<DistrictReport[]>('/reports/districts/').then((response) => response.data),
  });
  const branches = useQuery({
    queryKey: ['reports', 'branches'],
    queryFn: () => api.get<BranchReport[]>('/reports/branches/').then((response) => response.data),
  });
  const technicians = useQuery({
    queryKey: ['reports', 'technicians'],
    queryFn: () => api.get<TechnicianReport[]>('/reports/technicians/').then((response) => response.data),
  });
  const maintenance = useQuery({
    queryKey: ['maintenance-report'],
    queryFn: () => list<Maintenance>('/maintenance/'),
  });

  function exportCSV() {
    const lines: string[] = ['CBE ATM Operations Report', `Generated: ${new Date().toLocaleString()}`, ''];
    lines.push('DISTRICT ATM SUMMARY');
    lines.push('District,Branches,ATMs,Availability %,Incidents,Open,Escalated,Resolved');
    (districts.data || []).forEach((row) => {
      lines.push(`"${row.district}",${row.branches},${row.atms},${row.atm_availability},${row.incidents},${row.open_incidents},${row.escalations},${row.resolved}`);
    });
    lines.push('');
    lines.push('BRANCH OVERVIEW');
    lines.push('Branch,ATMs,Incidents,Resolved');
    (branches.data || []).forEach((row) => {
      lines.push(`"${row.branch}",${row.atms},${row.incidents},${row.resolved}`);
    });
    lines.push('');
    lines.push('TECHNICIAN ACTIVITY');
    lines.push('Technician,Assigned,Pending,Resolved,Escalations,Avg Resolution (hrs)');
    (technicians.data || []).forEach((row) => {
      lines.push(`"${row.technician}",${row.assigned},${row.pending},${row.resolved},${row.escalations},${row.avg_resolution_hours ?? ''}`);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `CBE_ATM_District_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Report CSV downloaded successfully');
  }

  if (summary.isLoading || districts.isLoading) {
    return <LoadingState label="Compiling technical reports..." />;
  }
  if (districts.isError) return <ErrorState message="Unable to load reports." />;

  const data = summary.data;
  const maintenanceRows = maintenance.data || [];
  const maintenanceStats = {
    scheduled: maintenanceRows.filter((row) => row.status === 'SCHEDULED').length,
    inProgress: maintenanceRows.filter((row) => ['STARTED', 'IN_PROGRESS'].includes(row.status)).length,
    completed: maintenanceRows.filter((row) => row.status === 'COMPLETED').length,
    emergency: maintenanceRows.filter((row) => row.maintenance_type === 'EMERGENCY').length,
  };

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Monitoring</p>
          <h1>Reports</h1>
          <p className="page-copy">District ATM availability, incident activity, technician performance and maintenance summaries.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" onClick={exportCSV}>
            <Download size={14} style={{ marginRight: 6 }} /> Export CSV
          </button>
          <button className="button primary" onClick={() => window.print()}>
            <Printer size={14} style={{ marginRight: 6 }} /> Print / Save PDF
          </button>
        </div>
      </div>

      {data ? (
        <div className="kpi-grid compact">
          <article className="metric-card"><span>Total ATMs</span><strong>{data.atms}</strong></article>
          <article className="metric-card success"><span>Operational</span><strong>{(data.atm_status.OPERATIONAL || 0) + (data.atm_status.AVAILABLE || 0)}</strong></article>
          <article className="metric-card danger"><span>Offline</span><strong>{data.atm_status.OFFLINE || 0}</strong></article>
          <article className="metric-card danger"><span>Fault</span><strong>{data.atm_status.FAULT || 0}</strong></article>
          <article className="metric-card warning"><span>Open Incidents</span><strong>{data.open_incidents}</strong></article>
          <article className="metric-card"><span>Escalated</span><strong>{data.escalated_incidents}</strong></article>
        </div>
      ) : null}

      <div className="panel" style={{ marginBottom: 20 }}>
        <h2>District ATM Report</h2>
        {(districts.data || []).length === 0 ? (
          <EmptyState title="No district data in scope." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>District</th>
                  <th>Branches</th>
                  <th>ATMs</th>
                  <th>Availability</th>
                  <th>Incidents</th>
                  <th>Open</th>
                  <th>Escalated</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {(districts.data || []).map((row) => (
                  <tr key={row.code}>
                    <td><strong>{row.district}</strong></td>
                    <td>{row.branches}</td>
                    <td>{row.atms}</td>
                    <td>{row.atm_availability}%</td>
                    <td>{row.incidents}</td>
                    <td>{row.open_incidents}</td>
                    <td>{row.escalations}</td>
                    <td>{row.resolved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!branches.isError && (branches.data || []).length > 0 ? (
        <div className="panel" style={{ marginBottom: 20 }}>
          <h2>Branch Overview</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>ATMs</th>
                  <th>Incidents</th>
                  <th>Resolved</th>
                  <th>Problem Categories</th>
                </tr>
              </thead>
              <tbody>
                {(branches.data || []).map((row) => (
                  <tr key={row.code}>
                    <td><strong>{row.branch}</strong></td>
                    <td>{row.atms}</td>
                    <td>{row.incidents}</td>
                    <td>{row.resolved}</td>
                    <td><small>{row.common_categories.map((category) => `${category.category} (${category.count})`).join(', ') || '—'}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!technicians.isError && (technicians.data || []).length > 0 ? (
        <div className="panel" style={{ marginBottom: 20 }}>
          <h2>Technician Activity</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Assigned</th>
                  <th>Pending</th>
                  <th>Resolved</th>
                  <th>Escalations</th>
                  <th>Avg Resolution (hrs)</th>
                </tr>
              </thead>
              <tbody>
                {(technicians.data || []).map((row) => (
                  <tr key={row.technician}>
                    <td><strong>{row.technician}</strong></td>
                    <td>{row.assigned}</td>
                    <td>{row.pending}</td>
                    <td>{row.resolved}</td>
                    <td>{row.escalations}</td>
                    <td>{row.avg_resolution_hours ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <h2>Maintenance Summary</h2>
        <div className="kpi-grid compact">
          <article className="metric-card"><span>Scheduled</span><strong>{maintenanceStats.scheduled}</strong></article>
          <article className="metric-card warning"><span>In Progress</span><strong>{maintenanceStats.inProgress}</strong></article>
          <article className="metric-card success"><span>Completed</span><strong>{maintenanceStats.completed}</strong></article>
          <article className="metric-card danger"><span>Emergency</span><strong>{maintenanceStats.emergency}</strong></article>
        </div>
      </div>
    </section>
  );
}
