"use client";

import { useEffect } from 'react';
import { redirect } from 'next/navigation';
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
type ConnectCallbackPageProps = {
  status?: string;
  app?: string;
  message?: string;
};

function ConnectCallbackContent({ status, app, message }: ConnectCallbackPageProps) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status === 'success') {
      toast.success(`${app || 'Integration'} connected successfully`);
      queryClient.invalidateQueries({ queryKey: ['integration-connections'] });
    } else if (status === 'error') {
      toast.error(message || `Failed to connect ${app || 'integration'}`);
    }
  }, [status, app, message, queryClient]);

  redirect('/integrations');

  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Completing connection...
        </p>
      </div>
    </div>
  );
}

export default function ConnectCallbackPage(props: ConnectCallbackPageProps) {
  return <ConnectCallbackContent {...props} />;
}
