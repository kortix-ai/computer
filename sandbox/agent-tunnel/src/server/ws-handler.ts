import type { TunnelRelay } from './relay';
import type { HeartbeatManager } from './heartbeat';

export interface WsHandlerOptions {
  heartbeat?: HeartbeatManager;
  maxMessageSize?: number;
}

export interface WsHandlers {
  onOpen(tunnelId: string, ws: WebSocket, signingKey: string, metadata?: Record<string, unknown>): void;
  onMessage(tunnelId: string, message: string | Buffer): void;
  onClose(tunnelId: string): void;
}

export function createWsHandlers(relay: TunnelRelay, opts?: WsHandlerOptions): WsHandlers {
  const maxMessageSize = opts?.maxMessageSize ?? 5 * 1024 * 1024;
  const heartbeat = opts?.heartbeat;

  return {
    onOpen(tunnelId: string, ws: WebSocket, signingKey: string, metadata?: Record<string, unknown>) {
      relay.registerAgent(tunnelId, ws, signingKey, metadata);
      if (heartbeat) {
        heartbeat.register(tunnelId);
      }
    },

    onMessage(tunnelId: string, message: string | Buffer) {
      const msgSize = typeof message === 'string' ? message.length : (message as Buffer).byteLength;
      if (msgSize > maxMessageSize) {
        console.warn(`[tunnel-ws] Oversized message from ${tunnelId}: ${msgSize} bytes (limit: ${maxMessageSize})`);
        return;
      }

      try {
        const parsed = JSON.parse(typeof message === 'string' ? message : message.toString('utf-8'));
        if (parsed.method === 'tunnel.pong') {
          if (heartbeat) {
            heartbeat.recordPong(tunnelId);
          }
        }
      } catch {
      }

      relay.handleAgentMessage(tunnelId, message);
    },

    onClose(tunnelId: string) {
      relay.unregisterAgent(tunnelId);
      if (heartbeat) {
        heartbeat.unregister(tunnelId);
      }
    },
  };
}
