"use client";

import { useEffect, useCallback, useRef } from 'react';
import { createFrontendClient } from '@pipedream/sdk/browser';
import { useAuth } from '@/components/AuthProvider';
import { useCreateConnectToken, useSaveConnection, useIntegrationConnections } from '@/hooks/integrations';
import { useIntegrationConnectStore } from '@/stores/integration-connect-store';
import { toast } from 'sonner';

/**
 * Mount this provider at the app root (e.g. in layout or providers wrapper).
 * It registers a global handler so any component can trigger the Pipedream OAuth popup
 * without navigating to /integrations in a new tab.
 */
export function IntegrationConnectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const createToken = useCreateConnectToken();
  const saveConnection = useSaveConnection();
  const { data: connections = [] } = useIntegrationConnections();

  // Access store methods via .getState() to avoid subscribing to store changes
  // and causing re-render loops. These functions are stable references.
  const storeRef = useRef(useIntegrationConnectStore);

  // Keep connections in a ref to avoid re-creating the callback
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;

  const userRef = useRef(user);
  userRef.current = user;

  // Keep mutation refs stable to avoid re-creating the callback
  const createTokenRef = useRef(createToken);
  createTokenRef.current = createToken;
  const saveConnectionRef = useRef(saveConnection);
  saveConnectionRef.current = saveConnection;

  const handleConnect = useCallback(
    async (appSlug: string, sandboxId?: string) => {
      const currentUser = userRef.current;
      if (!currentUser?.id) {
        toast.error('Please sign in to connect integrations.');
        return;
      }

      storeRef.current.getState().setConnectingApp(appSlug);
      const displayName = appSlug;

      try {
        // 1. Get a connect token from the backend
        const result = await createTokenRef.current.mutateAsync(appSlug);

        // 2. Create Pipedream frontend client and open OAuth popup
        const pd = createFrontendClient({
          environment: 'https://api.pipedream.com' as any,
          externalUserId: currentUser.id,
        } as any);

        await pd.connectAccount({
          app: appSlug,
          token: result.token,
          onSuccess: async ({ id: providerAccountId }: { id: string }) => {
            try {
              // Figure out label for duplicate accounts
              const existing = connectionsRef.current.filter((c) => c.app === appSlug);
              let label: string | undefined;
              if (existing.length > 0) {
                label = `${appSlug} Account ${existing.length + 1}`;
              }

              const saveResult = await saveConnectionRef.current.mutateAsync({
                app: appSlug,
                app_name: displayName,
                provider_account_id: providerAccountId,
                label,
                sandbox_id: sandboxId,
              });

              if (saveResult.link?.attempted && !saveResult.link.linked) {
                const reason = saveResult.link.reason;
                if (reason === 'sandbox_not_owned') {
                  toast.error(
                    `${displayName} connected, but it could not be linked to this sandbox.`,
                  );
                } else {
                  toast.error(
                    `${displayName} connected, but sandbox linking failed.`,
                  );
                }
              } else {
                toast.success(`${displayName} connected successfully!`);
              }
            } catch {
              toast.error('Connected but failed to save. Please refresh.');
            }
          },
        });
      } catch (err) {
        // Don't show error toast if user simply closed the popup
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('closed') && !msg.includes('cancel')) {
          toast.error(`Failed to connect ${displayName}`);
        }
      } finally {
        storeRef.current.getState().setConnectingApp(null);
      }
    },
    // No deps needed — everything is accessed via refs
    [],
  );

  useEffect(() => {
    const store = storeRef.current;
    store.getState().registerHandler(handleConnect);
    return () => {
      store.getState().unregisterHandler();
    };
  }, [handleConnect]);

  return <>{children}</>;
}
