/**
 * Standalone tunnel server — one function call to get a working relay.
 *
 * Usage:
 *   import { startTunnelServer } from 'agent-tunnel';
 *   const server = startTunnelServer({ port: 8080 });
 *
 * That's it. Agents connect via: ws://localhost:8080/ws?token=xxx&tunnelId=yyy
 * Your app calls relay.relayRPC(tunnelId, method, params) to reach the agent.
 */

import { Hono } from 'hono';
import { TunnelRelay } from './relay';
import { HeartbeatManager } from './heartbeat';
import { createTunnelRouter } from './routes';
import { createWsHandlers } from './ws-handler';
import { deriveSigningKey } from '../shared/crypto';
import type { TunnelServerConfig } from '../shared/types';

export interface TunnelServer {
  /** Hono app — mount additional routes if needed. */
  app: Hono;
  /** The relay instance — call relayRPC() to reach connected agents. */
  relay: TunnelRelay;
  heartbeat: HeartbeatManager;
  wsHandlers: ReturnType<typeof createWsHandlers>;
  /** Stop the server, heartbeat, and close all connections. */
  stop: () => void;
}

/**
 * Start a tunnel relay server. Handles everything:
 * - HTTP routes for connections list + RPC
 * - WebSocket upgrades on /ws for agent connections
 * - Heartbeat ping/pong
 * - HMAC signing key derivation from tokens
 *
 * Requires Bun runtime for WebSocket server support.
 */
export function startTunnelServer(config?: TunnelServerConfig): TunnelServer {
  const port = config?.port ?? parseInt(process.env.PORT || '8080', 10);

  const relay = new TunnelRelay(config?.relay);
  const heartbeat = new HeartbeatManager(relay, config?.heartbeat);
  const wsHandlers = createWsHandlers(relay, { heartbeat });

  const app = new Hono();

  // Mount tunnel routes (GET /connections, POST /rpc/:tunnelId, etc.)
  const tunnelRouter = createTunnelRouter(relay);
  app.route('/', tunnelRouter);

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok', connections: relay.getConnectedCount() }));

  // Start heartbeat
  heartbeat.start();

  // Start Bun server with WS support
  const bunServer = Bun.serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      // WS upgrade on /ws
      if (url.pathname === '/ws') {
        const token = url.searchParams.get('token');
        const tunnelId = url.searchParams.get('tunnelId');

        if (!token || !tunnelId) {
          return new Response(JSON.stringify({ error: 'Missing token or tunnelId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const signingKey = deriveSigningKey(token);

        const success = server.upgrade(req, {
          data: { tunnelId, signingKey } as any,
        });
        if (success) return undefined;

        return new Response('WebSocket upgrade failed', { status: 500 });
      }

      // All other requests → Hono
      return app.fetch(req);
    },

    websocket: {
      idleTimeout: 0,
      open(ws: any) {
        wsHandlers.onOpen(ws.data.tunnelId, ws, ws.data.signingKey);
      },
      message(ws: any, message: string | Buffer) {
        wsHandlers.onMessage(ws.data.tunnelId, message);
      },
      close(ws: any) {
        wsHandlers.onClose(ws.data.tunnelId);
      },
    },
  });

  console.log(`[agent-tunnel] Server listening on port ${port}`);

  const stop = () => {
    heartbeat.stop();
    relay.shutdown();
    bunServer.stop();
  };

  return { app, relay, heartbeat, wsHandlers, stop };
}
