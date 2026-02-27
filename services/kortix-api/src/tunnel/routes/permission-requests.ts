/**
 * Tunnel Permission Requests Routes — real-time permission approval flow.
 *
 * GET  /permission-requests              — list pending requests for account
 * GET  /permission-requests/stream       — SSE stream of new requests
 * POST /permission-requests/:id/approve  — approve a request (creates permission)
 * POST /permission-requests/:id/deny     — deny a request
 */

import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { tunnelPermissionRequests, tunnelPermissions, tunnelConnections } from '@kortix/db';
import { db } from '../../shared/db';
import { tunnelRelay } from '../core/relay';
import { tunnelRateLimiter } from '../core/rate-limiter';
import { isValidCapability, validateScope as validateScopeInput } from '../core/scope-validator';
import type { TunnelCapability } from '../types';
import { TunnelErrorCode } from '../types';

type SSEWriter = (event: string, data: unknown) => void;
const sseSubscribers = new Map<string, Set<SSEWriter>>();

export function notifyPermissionRequest(accountId: string, request: unknown): void {
  notifyTunnelEvent(accountId, 'permission_request', request);
}

export function notifyTunnelEvent(accountId: string, event: string, data: unknown): void {
  const subscribers = sseSubscribers.get(accountId);
  if (!subscribers || subscribers.size === 0) return;

  for (const writer of subscribers) {
    try {
      writer(event, data);
    } catch {
    }
  }
}

export function createPermissionRequestsRouter(): Hono {
  const router = new Hono();

  router.get('/', async (c: any) => {
    const accountId = c.get('userId') as string;

    const requests = await db
      .select()
      .from(tunnelPermissionRequests)
      .where(
        and(
          eq(tunnelPermissionRequests.accountId, accountId),
          eq(tunnelPermissionRequests.status, 'pending'),
        ),
      )
      .orderBy(desc(tunnelPermissionRequests.createdAt));

    return c.json(requests);
  });

  router.get('/stream', async (c: any) => {
    const accountId = c.get('userId') as string;

    return new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();

          const writer: SSEWriter = (event, data) => {
            const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          };

          if (!sseSubscribers.has(accountId)) {
            sseSubscribers.set(accountId, new Set());
          }
          sseSubscribers.get(accountId)!.add(writer);

          writer('connected', { timestamp: Date.now() });

          const keepAlive = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
            } catch {
              clearInterval(keepAlive);
            }
          }, 30_000);

          c.req.raw.signal.addEventListener('abort', () => {
            clearInterval(keepAlive);
            sseSubscribers.get(accountId)?.delete(writer);
            if (sseSubscribers.get(accountId)?.size === 0) {
              sseSubscribers.delete(accountId);
            }
            try { controller.close(); } catch {}
          });
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      },
    );
  });

  // ─── Approve Request ───────────────────────────────────────────────

  router.post('/:requestId/approve', async (c: any) => {
    const accountId = c.get('userId') as string;
    const requestId = c.req.param('requestId');
    const body = await c.req.json().catch(() => ({}));

    // Rate limit approvals
    const rateCheck = tunnelRateLimiter.check('permGrant', accountId);
    if (!rateCheck.allowed) {
      return c.json({
        error: 'Rate limit exceeded',
        code: TunnelErrorCode.RATE_LIMITED,
        retryAfterMs: rateCheck.retryAfterMs,
      }, 429);
    }

    // Fetch the request
    const [request] = await db
      .select()
      .from(tunnelPermissionRequests)
      .where(
        and(
          eq(tunnelPermissionRequests.requestId, requestId),
          eq(tunnelPermissionRequests.accountId, accountId),
        ),
      );

    if (!request) {
      return c.json({ error: 'Permission request not found' }, 404);
    }

    if (request.status !== 'pending') {
      return c.json({ error: `Request already ${request.status}` }, 409);
    }

    // Validate capability
    if (!isValidCapability(request.capability)) {
      return c.json({ error: `Invalid capability: ${request.capability}` }, 400);
    }

    // Mark as approved
    await db
      .update(tunnelPermissionRequests)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(eq(tunnelPermissionRequests.requestId, requestId));

    // Create the permission — validate scope before storing
    const scope = body.scope || request.requestedScope || {};
    if (scope && Object.keys(scope).length > 0) {
      const scopeResult = validateScopeInput(request.capability, scope);
      if (!scopeResult.valid) {
        return c.json({ error: `Invalid scope: ${scopeResult.error}` }, 400);
      }
    }

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const [permission] = await db
      .insert(tunnelPermissions)
      .values({
        tunnelId: request.tunnelId,
        accountId,
        capability: request.capability as TunnelCapability,
        scope,
        expiresAt,
      })
      .returning();

    tunnelRelay.sendNotification(request.tunnelId, 'tunnel.permission.granted', {
      permissionId: permission.permissionId,
      capability: permission.capability,
      scope: permission.scope,
      expiresAt: permission.expiresAt?.toISOString() ?? undefined,
    });

    return c.json({ success: true, permission });
  });

  // ─── Deny Request ──────────────────────────────────────────────────

  router.post('/:requestId/deny', async (c: any) => {
    const accountId = c.get('userId') as string;
    const requestId = c.req.param('requestId');

    const [request] = await db
      .select()
      .from(tunnelPermissionRequests)
      .where(
        and(
          eq(tunnelPermissionRequests.requestId, requestId),
          eq(tunnelPermissionRequests.accountId, accountId),
        ),
      );

    if (!request) {
      return c.json({ error: 'Permission request not found' }, 404);
    }

    if (request.status !== 'pending') {
      return c.json({ error: `Request already ${request.status}` }, 409);
    }

    await db
      .update(tunnelPermissionRequests)
      .set({ status: 'denied', updatedAt: new Date() })
      .where(eq(tunnelPermissionRequests.requestId, requestId));

    return c.json({ success: true });
  });

  return router;
}
