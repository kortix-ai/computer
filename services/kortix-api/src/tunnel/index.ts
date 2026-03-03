/**
 * Tunnel Sub-Service — reverse-tunnel infrastructure for connecting
 * cloud sandboxes to local machine resources.
 *
 * Uses the agent-tunnel library for transport (relay, heartbeat, WS handlers).
 * This file wires in Kortix-specific business logic: DB persistence,
 * permission sync, event notifications, and cleanup.
 *
 * Routes:
 *   /connections/*           — CRUD for tunnel connections
 *   /permissions/*           — manage granted permissions
 *   /permission-requests/*   — real-time permission approval flow (incl. SSE)
 *   /rpc/*                   — RPC relay (sandbox → local agent)
 *   /audit/*                 — paginated audit logs
 */

import { Hono } from 'hono';
import { createWsHandlers } from 'agent-tunnel';
import { config } from '../config';
import { createConnectionsRouter } from './routes/connections';
import { createPermissionsRouter } from './routes/permissions';
import { createPermissionRequestsRouter } from './routes/permission-requests';
import { createRpcRouter } from './routes/rpc';
import { createAuditRouter } from './routes/audit';
import { tunnelRelay } from './core/relay';
import { heartbeatManager } from './core/heartbeat';
import { notifyTunnelEvent } from './routes/permission-requests';

// ─── Hono Sub-App ────────────────────────────────────────────────────────────

const tunnelApp = new Hono();

tunnelApp.route('/connections', createConnectionsRouter());
tunnelApp.route('/permissions', createPermissionsRouter());
tunnelApp.route('/permission-requests', createPermissionRequestsRouter());
tunnelApp.route('/rpc', createRpcRouter());
tunnelApp.route('/audit', createAuditRouter());

// ─── WS Handlers (used by index.ts Bun server) ──────────────────────────────

const wsHandlers = createWsHandlers(tunnelRelay, {
  heartbeat: heartbeatManager,
  maxMessageSize: config.TUNNEL_MAX_WS_MESSAGE_SIZE,
});

// ─── Lifecycle ───────────────────────────────────────────────────────────────

let permissionCleanupInterval: ReturnType<typeof setInterval> | null = null;

function startTunnelService(): void {
  if (!config.TUNNEL_ENABLED) {
    console.log('[TUNNEL] Tunnel disabled (TUNNEL_ENABLED=false)');
    return;
  }

  heartbeatManager.start();

  // ── DB persistence via relay events ──────────────────────────────────

  tunnelRelay.on('agent:connect', async ({ tunnelId, metadata }) => {
    const accountId = metadata?.accountId as string | undefined;
    if (accountId) {
      notifyTunnelEvent(accountId, 'tunnel_connected', { tunnelId });
    }

    try {
      const { eq } = await import('drizzle-orm');
      const { tunnelConnections, tunnelPermissions } = await import('@kortix/db');
      const { db } = await import('../shared/db');

      db.update(tunnelConnections)
        .set({ status: 'online', lastHeartbeatAt: new Date(), updatedAt: new Date() })
        .where(eq(tunnelConnections.tunnelId, tunnelId))
        .catch((err: any) => console.warn(`[tunnel] DB update failed:`, err));

      // Sync active permissions to the agent
      const { and } = await import('drizzle-orm');
      const activePerms = await db
        .select({
          permissionId: tunnelPermissions.permissionId,
          capability: tunnelPermissions.capability,
          scope: tunnelPermissions.scope,
          expiresAt: tunnelPermissions.expiresAt,
        })
        .from(tunnelPermissions)
        .where(
          and(
            eq(tunnelPermissions.tunnelId, tunnelId),
            eq(tunnelPermissions.status, 'active'),
          ),
        );

      tunnelRelay.sendNotification(tunnelId, 'tunnel.permissions.sync', {
        permissions: activePerms.map((p) => ({
          permissionId: p.permissionId,
          capability: p.capability,
          scope: p.scope,
          expiresAt: p.expiresAt?.toISOString() ?? undefined,
        })),
      });
    } catch (err) {
      console.warn(`[tunnel] Permission sync failed:`, err);
    }
  });

  tunnelRelay.on('agent:disconnect', async ({ tunnelId }) => {
    const metadata = tunnelRelay.getAgentMetadata(tunnelId);
    const accountId = metadata?.accountId as string | undefined;

    if (accountId) {
      notifyTunnelEvent(accountId, 'tunnel_disconnected', { tunnelId });
    }

    try {
      const { eq } = await import('drizzle-orm');
      const { tunnelConnections } = await import('@kortix/db');
      const { db } = await import('../shared/db');

      db.update(tunnelConnections)
        .set({ status: 'offline', updatedAt: new Date() })
        .where(eq(tunnelConnections.tunnelId, tunnelId))
        .catch((err: any) => console.warn(`[tunnel] DB update failed:`, err));
    } catch {}
  });

  tunnelRelay.on('connection:replaced', ({ tunnelId }) => {
    const metadata = tunnelRelay.getAgentMetadata(tunnelId);
    const accountId = metadata?.accountId as string | undefined;
    if (accountId) {
      notifyTunnelEvent(accountId, 'connection_replaced', { tunnelId });
    }
  });

  tunnelRelay.on('message:pong', async ({ tunnelId, params }) => {
    try {
      const { eq } = await import('drizzle-orm');
      const { tunnelConnections } = await import('@kortix/db');
      const { db } = await import('../shared/db');

      db.update(tunnelConnections)
        .set({ lastHeartbeatAt: new Date(), updatedAt: new Date() })
        .where(eq(tunnelConnections.tunnelId, tunnelId))
        .catch((err) => console.warn(`[tunnel-heartbeat] DB update failed for ${tunnelId}:`, err));

      const mi = params?.machineInfo;
      if (mi && typeof mi === 'object' && (mi as any).hostname) {
        db.update(tunnelConnections)
          .set({ machineInfo: mi, updatedAt: new Date() })
          .where(eq(tunnelConnections.tunnelId, tunnelId))
          .catch(() => {});
      }
    } catch {}
  });

  tunnelRelay.on('agent:timeout', async ({ tunnelId }) => {
    console.warn(`[tunnel] Agent ${tunnelId} timed out — marking offline`);
    try {
      const { eq } = await import('drizzle-orm');
      const { tunnelConnections } = await import('@kortix/db');
      const { db } = await import('../shared/db');

      await db
        .update(tunnelConnections)
        .set({ status: 'offline', updatedAt: new Date() })
        .where(eq(tunnelConnections.tunnelId, tunnelId));
    } catch (err) {
      console.error(`[tunnel] Failed to mark ${tunnelId} offline:`, err);
    }
  });

  // ── Permission expiry cleanup ────────────────────────────────────────

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
  wsHandlers,
  startTunnelService,
  stopTunnelService,
  getTunnelServiceStatus,
};
