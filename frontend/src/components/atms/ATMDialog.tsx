import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { extractError, listResource } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import type { ATM } from '../../types/api';
import type { BranchRow } from '../../pages/BranchesPage';
import { CheckField, Dialog, Field, FormGrid, SelectInput, TextInput } from '../ui/form';

const STATUS_OPTIONS = ['OPERATIONAL', 'DEGRADED', 'WARNING', 'FAULT', 'CRITICAL', 'MAINTENANCE', 'UNDER_REPAIR', 'OFFLINE'];
const HEALTH_OPTIONS = ['HEALTHY', 'GOOD', 'WARNING', 'DEGRADED', 'CRITICAL', 'MAINTENANCE', 'OFFLINE'];

interface ATMDialogProps {
  onClose: () => void;
  atm?: ATM | null;
}

function inputValue(form: HTMLFormElement, name: string) {
  return (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
}

function optionLabel(value: string) {
  return value.replaceAll('_', ' ');
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
    <Dialog
      title={editing ? `Edit ${atm?.reference}` : 'Register ATM'}
      description={editing ? 'Update the technical details of this ATM.' : 'Required fields are marked with *. The reference is how the ATM appears across the platform.'}
      onClose={onClose}
      onSubmit={(event) => {
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
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Register ATM'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="error-box">
          <strong>{error}</strong>
        </div>
      ) : null}

      <FormGrid>
        <Field label="ATM Reference" required hint="Unique code such as YKA-1011">
          <TextInput name="reference" required defaultValue={atm?.reference || ''} placeholder="e.g. YKA-1011" />
        </Field>
        <Field label="ATM Name">
          <TextInput name="name" defaultValue={atm?.name || ''} placeholder="Floor or location name" />
        </Field>
      </FormGrid>

      <Field label="Branch" required>
        <SelectInput name="branch" required defaultValue={atm?.branch || ''}>
          <option value="" disabled>
            Select branch
          </option>
          {(branches.data || []).map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </SelectInput>
      </Field>

      <FormGrid cols={2}>
        <Field label="Technical Status">
          <SelectInput name="status" defaultValue={atm?.status || 'OPERATIONAL'}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {optionLabel(option)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Health">
          <SelectInput name="health" defaultValue={atm?.health || 'HEALTHY'}>
            {HEALTH_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {optionLabel(option)}
              </option>
            ))}
          </SelectInput>
        </Field>
      </FormGrid>

      <FormGrid cols={2}>
        <Field label="Manufacturer">
          <TextInput name="manufacturer" defaultValue={atm?.manufacturer || ''} placeholder="NCR" />
        </Field>
        <Field label="Model">
          <TextInput name="model" defaultValue={atm?.model || ''} placeholder="e.g. NCR SelfServ 86" />
        </Field>
      </FormGrid>
      <Field label="Serial Number">
        <TextInput name="serial_number" defaultValue={atm?.serial_number || ''} placeholder="SN-..." />
      </Field>
      <FormGrid cols={2}>
        <Field label="Location">
          <TextInput name="location" defaultValue={atm?.location || ''} placeholder="e.g. Main Lobby" />
        </Field>
        <Field label="Address">
          <TextInput name="address" defaultValue={atm?.address || ''} placeholder="Street or building address" />
        </Field>
      </FormGrid>

      <CheckField label="Active in district operations" hint="Disabled ATMs are hidden from operations views.">
        <input name="is_active" type="checkbox" defaultChecked={atm?.is_active !== false} />
      </CheckField>
    </Dialog>
  );
}