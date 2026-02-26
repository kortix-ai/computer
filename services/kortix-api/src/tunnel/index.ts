/**
 * Tunnel Sub-Service — reverse-tunnel infrastructure for connecting
 * cloud sandboxes to local machine resources.
 *
 * Architecture follows the channels pattern: Hono sub-app + lifecycle exports.
 *
 * Routes:
 *   /connections/*           — CRUD for tunnel connections
 *   /permissions/*           — manage granted permissions
 *   /permission-requests/*   — real-time permission approval flow (incl. SSE)
 *   /rpc/*                   — RPC relay (sandbox → local agent)
 *   /audit/*                 — paginated audit logs
 */

import { Hono } from 'hono';
import { config } from '../config';
import { createConnectionsRouter } from './routes/connections';
import { createPermissionsRouter } from './routes/permissions';
import { createPermissionRequestsRouter } from './routes/permission-requests';
import { createRpcRouter } from './routes/rpc';
import { createAuditRouter } from './routes/audit';
import { tunnelRelay } from './core/relay';
import { heartbeatManager } from './core/heartbeat';
import { notifyTunnelEvent } from './routes/permission-requests';

const tunnelApp = new Hono();

tunnelApp.route('/connections', createConnectionsRouter());
tunnelApp.route('/permissions', createPermissionsRouter());
tunnelApp.route('/permission-requests', createPermissionRequestsRouter());
tunnelApp.route('/rpc', createRpcRouter());
tunnelApp.route('/audit', createAuditRouter());

let permissionCleanupInterval: ReturnType<typeof setInterval> | null = null;

function startTunnelService(): void {
  if (!config.TUNNEL_ENABLED) {
    console.log('[TUNNEL] Tunnel disabled (TUNNEL_ENABLED=false)');
    return;
  }

  heartbeatManager.start();

  tunnelRelay.onConnectionReplaced = (tunnelId, accountId) => {
    notifyTunnelEvent(accountId, 'connection_replaced', { tunnelId });
  };

  permissionCleanupInterval = setInterval(async () => {
    try {
      const { eq, and, lt } = await import('drizzle-orm');
      const { tunnelPermissions } = await import('@kortix/db');
      const { db } = await import('../shared/db');

      await db
        .update(tunnelPermissions)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(
          and(
            eq(tunnelPermissions.status, 'active'),
            lt(tunnelPermissions.expiresAt, new Date()),
          ),
        );
    } catch (err) {
      console.warn('[TUNNEL] Permission cleanup error:', err);
    }
  }, 5 * 60_000);

  console.log('[TUNNEL] Tunnel service started');
}

function stopTunnelService(): void {
  if (permissionCleanupInterval) {
    clearInterval(permissionCleanupInterval);
    permissionCleanupInterval = null;
  }
  heartbeatManager.stop();
  tunnelRelay.shutdown();
  console.log('[TUNNEL] Tunnel service stopped');
}

function getTunnelServiceStatus(): { enabled: boolean; connectedAgents: number } {
  return {
    enabled: config.TUNNEL_ENABLED,
    connectedAgents: tunnelRelay.getConnectedCount(),
  };
}

export {
  tunnelApp,
  startTunnelService,
  stopTunnelService,
  getTunnelServiceStatus,
};
