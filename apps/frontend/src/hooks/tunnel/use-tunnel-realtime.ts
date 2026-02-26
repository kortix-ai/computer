'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useTunnelStore } from '@/stores/tunnel-store';
import { tunnelKeys } from './use-tunnel';
import type { TunnelPermissionRequest } from './use-tunnel';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export function useTunnelRealtimeSync() {
  const queryClient = useQueryClient();
  const addPendingRequest = useTunnelStore((s) => s.addPendingRequest);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const url = `${API_URL}/tunnel/permission-requests/stream?token=${encodeURIComponent(session.access_token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener('tunnel_connected', () => {
        queryClient.invalidateQueries({ queryKey: tunnelKeys.connections() });
      });

      es.addEventListener('tunnel_disconnected', () => {
        queryClient.invalidateQueries({ queryKey: tunnelKeys.connections() });
      });

      es.addEventListener('connection_replaced', () => {
        queryClient.invalidateQueries({ queryKey: tunnelKeys.connections() });
      });

      es.addEventListener('permission_request', (event) => {
        try {
          const request = JSON.parse(event.data) as TunnelPermissionRequest;
          addPendingRequest(request);
        } catch {}
      });

      es.addEventListener('error', () => {
        es.close();
        eventSourceRef.current = null;
        if (!cancelled) {
          reconnectTimerRef.current = setTimeout(connect, 5_000);
        }
      });
    }

    connect();

    return () => {
      cancelled = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [queryClient, addPendingRequest]);
}
