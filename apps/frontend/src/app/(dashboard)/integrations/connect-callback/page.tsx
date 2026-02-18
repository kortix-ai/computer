"use client";

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

/**
 * OAuth callback page for integration connections.
 * Handles the redirect from the OAuth provider (Pipedream Connect).
 *
 * Expected query params:
 * - status: 'success' | 'error'
 * - app: the app slug that was connected
 * - message: error message (if status=error)
 */
export default function ConnectCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    const status = searchParams.get('status');
    const app = searchParams.get('app');
    const message = searchParams.get('message');

    if (status === 'success') {
      toast.success(`${app || 'Integration'} connected successfully`);
      queryClient.invalidateQueries({ queryKey: ['integration-connections'] });
    } else if (status === 'error') {
      toast.error(message || `Failed to connect ${app || 'integration'}`);
    }

    // Redirect back to integrations page
    router.replace('/integrations');
  }, [searchParams, router, queryClient]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Completing connection...
        </p>
      </div>
    </div>
  );
}
