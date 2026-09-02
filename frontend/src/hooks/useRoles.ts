import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';

export interface RoleOption {
  value: string;
  label: string;
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data } = await api.get<{ roles: RoleOption[] }>('/users/roles/');
      return data.roles;
    },
  });
}
