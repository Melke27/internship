import React, { useState, useEffect } from 'react';
import { Building2, X, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Department, createDepartment, updateDepartment, deactivateDepartment } from '../../services/department';
import { showToast } from '../../lib/toast';

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  department?: Department | null;
  mode?: 'create' | 'edit' | 'deactivate';
}

const DEPARTMENT_TYPES = [
  { value: 'OPERATIONS', label: 'ATM Operations & Monitoring' },
  { value: 'TECHNICAL', label: 'IT Infrastructure & Support' },
  { value: 'MAINTENANCE', label: 'Maintenance & Engineering' },
  { value: 'AUDIT', label: 'Audit, Risk & Compliance' },
  { value: 'ADMINISTRATION', label: 'Cash Replenishment & Vault Services' },
];

export const DepartmentModal: React.FC<DepartmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  department,
  mode = 'create',
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [departmentType, setDepartmentType] = useState('OPERATIONS');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [deactivateReason, setDeactivateReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (department && (mode === 'edit' || mode === 'deactivate')) {
      setName(department.name || '');
      setCode(department.code || '');
      setDepartmentType(department.department_type || 'OPERATIONS');
      setDescription(department.description || '');
      setEmail(department.email || '');
      setPhone(department.phone || '');
    } else {
      setName('');
      setCode('');
      setDepartmentType('OPERATIONS');
      setDescription('');
      setEmail('');
      setPhone('');
    }
    setDeactivateReason('');
    setError(null);
  }, [department, mode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'create') {
        if (!name.trim() || !code.trim()) {
          setError('Department name and code are required.');
          setSubmitting(false);
          return;
        }
        await createDepartment({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          department_type: departmentType as any,
          description: description.trim(),
          email: email.trim(),
          phone: phone.trim(),
        });
        showToast('Department created successfully', 'success');
      } else if (mode === 'edit' && department) {
        await updateDepartment(department.id, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          department_type: departmentType as any,
          description: description.trim(),
          email: email.trim(),
          phone: phone.trim(),
        });
        showToast('Department updated successfully', 'success');
      } else if (mode === 'deactivate' && department) {
        if (!deactivateReason.trim()) {
          setError('A reason for deactivation is required.');
          setSubmitting(false);
          return;
        }
        await deactivateDepartment(department.id, deactivateReason.trim());
        showToast(`Department ${department.name} deactivated.`, 'warning');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Department operation error:', err);
      const errMsg = err.response?.data?.detail || err.response?.data?.code?.[0] || 'Operation failed. Please try again.';
      setError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-lg rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${mode === 'deactivate' ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-500/10 text-amber-500'}`}>
              {mode === 'deactivate' ? <AlertTriangle className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">
                {mode === 'create' && 'Create New Department'}
                {mode === 'edit' && 'Edit Department Details'}
                {mode === 'deactivate' && 'Deactivate Department'}
              </h3>
              <p className="text-xs text-slate-400">
                {mode === 'deactivate'
                  ? 'Safely deactivate operational department'
                  : 'Configure department parameters & contact info'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'deactivate' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/10 text-slate-300 text-sm space-y-2">
                <p className="font-semibold text-amber-400">
                  Deactivating Department: {department?.name} ({department?.code})
                </p>
                <p className="text-slate-400 text-xs">
                  This action marks the department as INACTIVE. Historical logs, incident records, and assigned staff members will remain preserved for audit compliance.
                </p>
                {department && (department.user_count > 0 || department.open_incidents_count > 0) && (
                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-3 text-xs text-amber-300">
                    <span>Staff Members: {department.user_count}</span>
                    <span>•</span>
                    <span>Open Incidents: {department.open_incidents_count}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Deactivation Reason <span className="text-rose-400">*</span>
                </label>
                <textarea
                  value={deactivateReason}
                  onChange={(e) => setDeactivateReason(e.target.value)}
                  rows={3}
                  placeholder="Provide justification for deactivating this department..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                  required
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Department Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. ATM Operations"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Department Code <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. DEP-OPS"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm uppercase focus:outline-none focus:border-amber-500/50 transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Department Category
                </label>
                <select
                  value={departmentType}
                  onChange={(e) => setDepartmentType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                >
                  {DEPARTMENT_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {dt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="dept@cbe.com.et"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+251 11 661 0000"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Description & Scope
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Operational responsibilities and scope of this department..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
            </>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-800 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all shadow-lg ${
                mode === 'deactivate'
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {submitting ? (
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {mode === 'create' && 'Create Department'}
              {mode === 'edit' && 'Save Changes'}
              {mode === 'deactivate' && 'Confirm Deactivation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
