import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import { useAuth } from '@/components/AuthProvider';

interface AdminRoleResponse {
  isAdmin: boolean;
  role?: 'admin' | 'super_admin' | null;
}

export const useAdminRole = (
  options?: Partial<UseQueryOptions<AdminRoleResponse>>
) => {
  const { user } = useAuth();

  return useQuery<AdminRoleResponse>({
    queryKey: ['admin-role', user?.id],
    queryFn: async () => {
      if (!user) {
        return { isAdmin: false, role: null };
      }

      const response = await backendApi.get<AdminRoleResponse>('/user-roles', {
        showErrors: false,
      });

      if (response.error) {
        // Silently handle errors (e.g. 404 when backend doesn't have this endpoint)
        return { isAdmin: false, role: null };
      }

      return response.data || { isAdmin: false, role: null };
    },
    enabled: !!user && (options?.enabled !== false),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch if we have cached data
    ...options,
  });
};
