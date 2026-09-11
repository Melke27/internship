import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Users,
  AlertTriangle,
  Wrench,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Edit3,
  Power,
  Activity,
  Layers,
  ChevronRight,
  BarChart3,
  UserCheck,
  Mail,
  X,
} from 'lucide-react';
import {
  Department,
  getDepartments,
  getDepartmentReports,
  getDepartmentSummary,
} from '../services/department';
import { DepartmentModal } from '../components/organization/DepartmentModal';
import { FIXED_DISTRICT_NAME } from '../lib/navigation';
import { LoadingState, ErrorState, EmptyState } from '../components/feedback/StateView';
import { StatusBadge } from '../components/ui/StatusBadge';
import { MetricCard } from '../components/ui/MetricCard';

export default function DepartmentDashboardPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'analytics' | 'management'>('analytics');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'deactivate'>('create');
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);

  // Summary Drawer State
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDeptId, setSummaryDeptId] = useState<number | null>(null);

  // Data Queries
  const {
    data: departments = [],
    isLoading: loadingDepts,
    isError: errorDepts,
    refetch: refetchDepts,
  } = useQuery({
    queryKey: ['departments', searchTerm, selectedType, selectedStatus],
    queryFn: () => getDepartments({ search: searchTerm, status: selectedStatus !== 'ALL' ? selectedStatus : undefined, department_type: selectedType !== 'ALL' ? selectedType : undefined }),
  });

  const { data: deptReports = [] } = useQuery({
    queryKey: ['department-reports'],
    queryFn: getDepartmentReports,
  });

  const { data: summaryData, isLoading: loadingSummary } = useQuery({
    queryKey: ['department-summary', summaryDeptId],
    queryFn: () => (summaryDeptId ? getDepartmentSummary(summaryDeptId) : null),
    enabled: !!summaryDeptId,
  });

  // Filtering
  const filteredDepts = departments.filter((dept) => {
    const matchesSearch =
      dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dept.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dept.head_name && dept.head_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = selectedType === 'ALL' || dept.department_type === selectedType;
    const matchesStatus = selectedStatus === 'ALL' || dept.status === selectedStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  // Calculate Metrics
  const totalStaff = departments.reduce((sum, d) => sum + (d.user_count || 0), 0);
  const totalOpenIncidents = departments.reduce((sum, d) => sum + (d.open_incidents_count || 0), 0);
  const totalActiveMaintenance = departments.reduce((sum, d) => sum + (d.active_maintenance_count || 0), 0);
  const activeDeptCount = departments.filter((d) => d.status === 'ACTIVE').length;

  const handleOpenCreate = () => {
    setSelectedDept(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const handleOpenEdit = (dept: Department) => {
    setSelectedDept(dept);
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleOpenDeactivate = (dept: Department) => {
    setSelectedDept(dept);
    setModalMode('deactivate');
    setModalOpen(true);
  };

  const handleViewSummary = (deptId: number) => {
    setSummaryDeptId(deptId);
    setSummaryOpen(true);
  };

  const handleModalSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['departments'] });
    queryClient.invalidateQueries({ queryKey: ['department-reports'] });
  };

  if (loadingDepts && departments.length === 0) {
    return <LoadingState label="Loading department dashboard..." />;
  }

  if (errorDepts) {
    return (
      <ErrorState
        message="Unable to retrieve department information from the backend API."
        onRetry={() => refetchDepts()}
      />
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold uppercase tracking-wider">
              {FIXED_DISTRICT_NAME} Operations
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-xs text-slate-400">Department Management Center</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-amber-500" />
            Department Dashboard
          </h1>
          <p className="text-sm text-slate-400">
            Monitor organizational structure, departmental workloads, incident resolution SLAs, and staff allocations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetchDepts()}
            className="p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all"
          >
            <Plus className="h-4 w-4" />
            Create Department
          </button>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Departments"
          value={departments.length}
          hint={`${activeDeptCount} Active • ${departments.length - activeDeptCount} Inactive`}
          icon={<Building2 className="h-5 w-5 text-amber-400" />}
          tone="default"
        />
        <MetricCard
          label="Total Staff Allocations"
          value={totalStaff}
          hint="Across all district departments"
          icon={<Users className="h-5 w-5 text-emerald-400" />}
          tone="success"
        />
        <MetricCard
          label="Open Department Incidents"
          value={totalOpenIncidents}
          hint="Active resolution tickets"
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
          tone={totalOpenIncidents > 5 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Active Maintenance Jobs"
          value={totalActiveMaintenance}
          hint="Assigned field maintenance"
          icon={<Wrench className="h-5 w-5 text-purple-400" />}
          tone="info"
        />
      </div>

      {/* Main Tabs Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'analytics'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Activity className="h-4 w-4" />
            Analytics & Operations
          </button>
          <button
            onClick={() => setActiveTab('management')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'management'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            Department Management ({filteredDepts.length})
          </button>
        </div>

        {activeTab === 'management' && (
          <div className="text-xs text-slate-400 hidden sm:block">
            Showing {filteredDepts.length} of {departments.length} departments
          </div>
        )}
      </div>

      {/* TAB 1: ANALYTICS & OPERATIONS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Department Health Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {departments.map((dept) => {
              const openIncidents = dept.open_incidents_count || 0;
              const activeMaint = dept.active_maintenance_count || 0;

              return (
                <div
                  key={dept.id}
                  className="group relative flex flex-col justify-between p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 shadow-lg hover:shadow-2xl hover:shadow-amber-500/5 transition-all duration-300"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-amber-400 group-hover:bg-amber-500/10 group-hover:border-amber-500/30 transition-all">
                          <Building2 className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
                            {dept.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-slate-400 border border-slate-800">
                              {dept.code}
                            </span>
                            <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                              {dept.department_type}
                            </span>
                          </div>
                        </div>
                      </div>
                      <StatusBadge value={dept.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'} />
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px]">
                      {dept.description || 'No description configured for this operational department.'}
                    </p>

                    {/* Stats Highlights */}
                    <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                      <div className="text-center">
                        <span className="block text-[10px] text-slate-500 font-semibold uppercase">Staff</span>
                        <span className="text-base font-bold text-slate-100">{dept.user_count || 0}</span>
                      </div>
                      <div className="text-center border-x border-slate-800/80">
                        <span className="block text-[10px] text-slate-500 font-semibold uppercase">Incidents</span>
                        <span className={`text-base font-bold ${openIncidents > 0 ? 'text-amber-400' : 'text-slate-100'}`}>
                          {openIncidents}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] text-slate-500 font-semibold uppercase">Maintenance</span>
                        <span className={`text-base font-bold ${activeMaint > 0 ? 'text-purple-400' : 'text-slate-100'}`}>
                          {activeMaint}
                        </span>
                      </div>
                    </div>

                    {/* Head of Department & Contact */}
                    <div className="space-y-1.5 pt-1 text-xs">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5 text-slate-500" /> Head:
                        </span>
                        <span className="font-semibold text-slate-200">{dept.head_name || 'Unassigned'}</span>
                      </div>
                      {dept.email && (
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-slate-500" /> Email:
                          </span>
                          <span className="text-slate-300 font-mono text-[11px] truncate max-w-[180px]">{dept.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => handleViewSummary(dept.id)}
                      className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                    >
                      View Summary <ChevronRight className="h-3.5 w-3.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(dept)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                        title="Edit Department"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleOpenDeactivate(dept)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                        title="Deactivate Department"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Department Performance Overview Bar */}
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-amber-400" />
                  Department Workload Distribution
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time active tickets and staff allocation comparison per operational unit.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                SLA Compliance: 96.8% Target
              </span>
            </div>

            <div className="space-y-3 pt-2">
              {departments.map((dept) => {
                const percentage = totalStaff > 0 ? Math.round(((dept.user_count || 0) / totalStaff) * 100) : 0;
                return (
                  <div key={dept.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">{dept.name} ({dept.code})</span>
                      <span className="text-slate-400">
                        {dept.user_count} Staff • {dept.open_incidents_count} Open Tickets ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden flex">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
                        style={{ width: `${Math.max(percentage, 5)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEPARTMENT MANAGEMENT & ROSTER */}
      {activeTab === 'management' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search departments by name, code, or head..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-amber-500/50"
                >
                  <option value="ALL">All Categories</option>
                  <option value="OPERATIONS">ATM Operations</option>
                  <option value="TECHNICAL">IT Technical</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="AUDIT">Audit & Compliance</option>
                  <option value="ADMINISTRATION">Cash / Vault</option>
                </select>
              </div>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-amber-500/50"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>

          {/* Department Table */}
          {filteredDepts.length === 0 ? (
            <EmptyState
              title="No Departments Found"
              description="No operational departments match the specified search query or filters."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4">Department</th>
                    <th className="py-3.5 px-4">Category</th>
                    <th className="py-3.5 px-4">Department Head</th>
                    <th className="py-3.5 px-4 text-center">Staff Members</th>
                    <th className="py-3.5 px-4 text-center">Open Incidents</th>
                    <th className="py-3.5 px-4 text-center">Maintenance</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm text-slate-200">
                  {filteredDepts.map((dept) => (
                    <tr key={dept.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div>
                          <div className="font-bold text-slate-100 flex items-center gap-2">
                            {dept.name}
                            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-slate-950 text-slate-400 border border-slate-800 rounded">
                              {dept.code}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 truncate max-w-xs">{dept.description || 'No description'}</div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-950 text-amber-400 border border-slate-800">
                          {dept.department_type}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-slate-500 shrink-0" />
                          <span className="font-medium text-slate-200">{dept.head_name || 'Unassigned'}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center font-bold text-slate-100">
                        {dept.user_count || 0}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className={`font-bold ${dept.open_incidents_count > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {dept.open_incidents_count || 0}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className={`font-bold ${dept.active_maintenance_count > 0 ? 'text-purple-400' : 'text-slate-400'}`}>
                          {dept.active_maintenance_count || 0}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <StatusBadge value={dept.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'} />
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewSummary(dept.id)}
                            className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-xs font-semibold text-amber-400 hover:text-amber-300 hover:border-amber-500/40 transition-colors"
                          >
                            Summary
                          </button>
                          <button
                            onClick={() => handleOpenEdit(dept)}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenDeactivate(dept)}
                            className="p-1.5 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                            title="Deactivate"
                          >
                            <Power className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DEPARTMENT SUMMARY MODAL DRAWER */}
      {summaryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
          <div className="relative w-full max-w-2xl rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">
                    {summaryData ? `${summaryData.name} (${summaryData.code})` : 'Department Summary'}
                  </h3>
                  <p className="text-xs text-slate-400">Detailed staff roster & workload metrics</p>
                </div>
              </div>
              <button
                onClick={() => setSummaryOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {loadingSummary ? (
                <div className="py-12 flex justify-center">
                  <div className="h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : summaryData ? (
                <>
                  {/* Overview Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div>
                      <span className="block text-[10px] text-slate-500 font-semibold uppercase">Category</span>
                      <span className="text-sm font-bold text-slate-200">{summaryData.department_type}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-500 font-semibold uppercase">Head</span>
                      <span className="text-sm font-bold text-slate-200">{summaryData.head || 'None'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-500 font-semibold uppercase">Open Incidents</span>
                      <span className="text-sm font-bold text-amber-400">{summaryData.open_incidents}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-500 font-semibold uppercase">Maintenance</span>
                      <span className="text-sm font-bold text-purple-400">{summaryData.active_maintenance}</span>
                    </div>
                  </div>

                  {/* Staff Members List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Assigned Staff Members ({summaryData.staff_members.length})</span>
                      <span className="text-[11px] text-slate-500">Showing top 10</span>
                    </h4>

                    {summaryData.staff_members.length === 0 ? (
                      <div className="p-4 text-center rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400">
                        No staff members assigned to this department yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {summaryData.staff_members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded bg-slate-900 text-slate-400">
                                <Users className="h-4 w-4" />
                              </div>
                              <div>
                                <span className="font-semibold text-slate-200">{member.name}</span>
                                <span className="block text-[11px] text-slate-500">{member.email}</span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-slate-400 border border-slate-800">
                              {member.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex justify-end p-4 border-t border-slate-800 bg-slate-950/40">
              <button
                onClick={() => setSummaryOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 text-sm font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT / DEACTIVATE MODAL */}
      <DepartmentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleModalSuccess}
        department={selectedDept}
        mode={modalMode}
      />
    </div>
  );
}
