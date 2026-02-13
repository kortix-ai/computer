import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { GetAccountsResponse } from '@usebasejump/shared';
import { backendApi } from '@/lib/api-client';

export const useAccounts = (
  options?: Partial<UseQueryOptions<GetAccountsResponse>> & {
    enabled?: boolean;
  },
) => {
  return useQuery<GetAccountsResponse>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await backendApi.get<GetAccountsResponse>('/accounts', {
        showErrors: false,
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch accounts');
      }

      const data = response.data;
      // The API may return an array directly or wrap it in an object
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object' && Array.isArray((data as any).data))
        return (data as any).data;
      return [];
    },
    enabled: options?.enabled !== false,
    ...options,
  });
};
