import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { extractError, listResource } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import type { ATM } from '../../types/api';
import type { BranchRow } from '../../pages/BranchesPage';

const STATUS_OPTIONS = ['OPERATIONAL', 'DEGRADED', 'WARNING', 'FAULT', 'CRITICAL', 'MAINTENANCE', 'UNDER_REPAIR', 'OFFLINE'];
const HEALTH_OPTIONS = ['HEALTHY', 'GOOD', 'WARNING', 'DEGRADED', 'CRITICAL', 'MAINTENANCE', 'OFFLINE'];

interface ATMDialogProps {
  onClose: () => void;
  atm?: ATM | null;
}

function inputValue(form: HTMLFormElement, name: string) {
  return (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
}

export default function ATMDialog({ onClose, atm }: ATMDialogProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const editing = Boolean(atm);

  const branches = useQuery({
    queryKey: ['branches', 'atm-form'],
    queryFn: () => listResource<BranchRow>('/branches/?ordering=name'),
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? api.patch(`/atms/${atm!.id}/`, payload) : api.post('/atms/', payload),
    onSuccess: async () => {
      showToast(editing ? 'ATM updated' : 'ATM registered');
      await queryClient.invalidateQueries({ queryKey: ['atms'] });
      onClose();
    },
    onError: (err) => setError(extractError(err, 'ATM could not be saved.')),
  });

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form
        className="dialog-panel"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = event.currentTarget;
          save.mutate({
            reference: inputValue(form, 'reference'),
            name: inputValue(form, 'name'),
            branch: inputValue(form, 'branch') ? Number(inputValue(form, 'branch')) : null,
            model: inputValue(form, 'model'),
            manufacturer: inputValue(form, 'manufacturer'),
            serial_number: inputValue(form, 'serial_number'),
            location: inputValue(form, 'location'),
            address: inputValue(form, 'address'),
            status: inputValue(form, 'status'),
            health: inputValue(form, 'health'),
            is_active: (form.elements.namedItem('is_active') as HTMLInputElement | null)?.checked ?? true,
          });
        }}
      >
        <div className="dialog-header">
          <h2>{editing ? `Edit ${atm?.reference}` : 'Register ATM'}</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="helper-text">Required fields are marked with *.</p>

        {error ? (
          <div className="error-box">
            <strong>{error}</strong>
          </div>
        ) : null}

        <div className="form-grid">
          <label>
            ATM Reference *
            <input name="reference" required defaultValue={atm?.reference || ''} placeholder="e.g. YKA-1011" />
          </label>
          <label>
            ATM Name
            <input name="name" defaultValue={atm?.name || ''} placeholder="Floor or location name" />
          </label>
        </div>

        <label>
          Branch *
          <select name="branch" required defaultValue={atm?.branch || ''}>
            <option value="" disabled>
              Select branch
            </option>
            {(branches.data || []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        <div className="form-grid">
          <label>
            Manufacturer
            <input name="manufacturer" defaultValue={atm?.manufacturer || ''} placeholder="NCR" />
          </label>
          <label>
            Model
            <input name="model" defaultValue={atm?.model || ''} placeholder="e.g. NCR SelfServ 86" />
          </label>
          <label>
            Serial Number
            <input name="serial_number" defaultValue={atm?.serial_number || ''} placeholder="SN-..." />
          </label>
          <label>
            Technical Status
            <select name="status" defaultValue={atm?.status || 'OPERATIONAL'}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Health
            <select name="health" defaultValue={atm?.health || 'HEALTHY'}>
              {HEALTH_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="check-field">
            <input name="is_active" type="checkbox" defaultChecked={atm?.is_active !== false} />
            Active in district operations
          </label>
        </div>

        <label>
          Location
          <input name="location" defaultValue={atm?.location || ''} placeholder="e.g. Main Lobby" />
        </label>
        <label>
          Address
          <input name="address" defaultValue={atm?.address || ''} placeholder="Street or building address" />
        </label>

        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Register ATM'}
          </button>
        </div>
      </form>
    </div>
  );
}