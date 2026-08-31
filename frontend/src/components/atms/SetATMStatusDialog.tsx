import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { extractError } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { StatusBadge } from '../ui/StatusBadge';
import { Dialog, Field, FormGrid, SelectInput, TextArea } from '../ui/form';
import type { ATM } from '../../types/api';

const ATM_STATUS_OPTIONS = [
  { value: 'OPERATIONAL', label: 'Operational', desc: 'ATM is fully functional and serving cash' },
  { value: 'WARNING', label: 'Warning', desc: 'Non-critical warning or low receipt paper' },
  { value: 'DEGRADED', label: 'Degraded', desc: 'Partial functionality or slow performance' },
  { value: 'FAULT', label: 'Fault', desc: 'Hardware/software fault requiring attention' },
  { value: 'OFFLINE', label: 'Offline', desc: 'Network or power loss; unreachable' },
  { value: 'UNDER_REPAIR', label: 'Under Repair', desc: 'Technician currently performing repair' },
  { value: 'MAINTENANCE', label: 'Maintenance', desc: 'Scheduled maintenance work in progress' },
  { value: 'CRITICAL', label: 'Critical', desc: 'Severe failure; immediate dispatch required' },
];

export default function SetATMStatusDialog({
  atm,
  onClose,
}: {
  atm: ATM;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(atm.status);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (payload: { status: string; reason: string }) =>
      api.post(`/atms/${atm.id}/set_status/`, payload),
    onSuccess: async () => {
      showToast(`ATM ${atm.reference} status updated to ${status.replaceAll('_', ' ')}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['atm', String(atm.id)] }),
        queryClient.invalidateQueries({ queryKey: ['atm', atm.id] }),
        queryClient.invalidateQueries({ queryKey: ['atms'] }),
        queryClient.invalidateQueries({ queryKey: ['atm-history', String(atm.id)] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
      onClose();
    },
    onError: (err) => setError(extractError(err, 'Unable to update ATM status.')),
  });

  return (
    <Dialog
      title="Update Technical Status"
      description={`${atm.reference} — ${atm.branch_name}`}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        if (status === atm.status) {
          setError('Please select a different status.');
          return;
        }
        mutation.mutate({ status, reason });
      }}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Updating…' : 'Update Status'}
          </button>
        </>
      }
    >
      <div className="readonly-card">
        <span>Current Status</span>
        <div style={{ marginTop: 4 }}>
          <StatusBadge value={atm.status} />
        </div>
      </div>
      <Field label="New Technical Status" required>
        <SelectInput
          value={status}
          onChange={(e) => { setStatus(e.target.value); setError(''); }}
          required
        >
          {ATM_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} — {opt.desc}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Reason for Change" required hint="Explain why this status is being set (e.g. Card reader replaced, power restored)">
        <TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          required
          placeholder="Explain why this status is being set (e.g. Card reader replaced, power restored)."
        />
      </Field>
      {error ? <div className="error-banner"><strong>{error}</strong></div> : null}
    </Dialog>
  );
}