import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { GetAccountsResponse } from '@usebasejump/shared';

export const useAccounts = (options?: Partial<UseQueryOptions<GetAccountsResponse>> & { enabled?: boolean }) => {
  return useQuery<GetAccountsResponse>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .schema('basejump')
        .from('accounts')
        .select('id, name, slug, personal_account, primary_owner_user_id, created_at, updated_at');

      if (error) {
        throw new Error(error.message || 'Failed to fetch accounts');
      }

      return (data || []).map((row: any) => ({
        account_id: row.id,
        role: 'owner' as const,
        is_primary_owner: true,
        name: row.name,
        slug: row.slug,
        personal_account: row.personal_account,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })) as GetAccountsResponse;
    },
    enabled: options?.enabled !== false,
    ...options,
  });
};
