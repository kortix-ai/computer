import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { createAuthProvider } from './providers';
import { config } from '../config';
import { db } from '../shared/db';
import {
  insertIntegration,
  listIntegrationsByAccount,
  getIntegrationById,
  deleteIntegration,
  linkSandboxIntegration,
  unlinkSandboxIntegration,
  getIntegrationForSandbox,
  updateIntegrationLastUsed,
  updateIntegrationLabel,
  getLinkedSandboxes,
  getAppSandboxLinks,
  getSandboxAppConflict,
  verifySandboxOwnership,
  listSandboxIntegrations,
} from './repositories';
import type { AppEnv } from '../types';
import { resolveAccountId } from '../shared/resolve-account';

type SandboxEnv = {
  Variables: {
    sandboxId: string;
    accountId: string;
  };
};

const connectTokenSchema = z.object({
  app: z.string().optional(),
});

const tokenRequestSchema = z.object({
  app: z.string().min(1),
});

const proxyRequestSchema = z.object({
  app: z.string().min(1),
  method: z.string().min(1).default('GET'),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  integration_id: z.string().uuid().optional(),
});

const linkSchema = z.object({
  sandbox_id: z.string().uuid(),
});

const runActionSchema = z.object({
  app: z.string().min(1),
  action_key: z.string().min(1),
  props: z.record(z.unknown()).default({}),
});

const webhookSchema = z.object({
  account_id: z.string(),
  app: z.string(),
  app_name: z.string().optional(),
  provider_account_id: z.string(),
  scopes: z.array(z.string()).optional(),
  status: z.enum(['active', 'revoked', 'expired', 'error']).optional(),
});

export function createIntegrationsRouter(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get('/apps', async (c) => {
    try {
      const query = c.req.query('q');
      const limit = parseInt(c.req.query('limit') || '48', 10);
      const cursor = c.req.query('cursor');
      const provider = createAuthProvider();
      const result = await provider.listApps(query, limit, cursor);
      return c.json(result);
    } catch (err) {
      console.error('[INTEGRATIONS] Error listing apps:', err);
      return c.json({ error: 'Failed to list apps' }, 500);
    }
  });

  app.post('/connect-token', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);

    const body = await c.req.json().catch(() => ({}));
    const parsed = connectTokenSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'Invalid request' });
    }

    try {
      const provider = createAuthProvider();
      const result = await provider.createConnectToken(accountId, parsed.data.app);
      return c.json(result);
    } catch (err) {
      console.error('[INTEGRATIONS] Error creating connect token:', err);
      return c.json({ error: 'Failed to create connect token' }, 500);
    }
  });

  app.post('/connections/save', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);

    const body = await c.req.json();
    const saveSchema = z.object({
      app: z.string().min(1),
      app_name: z.string().optional(),
      provider_account_id: z.string().min(1),
      label: z.string().max(255).optional(),
      sandbox_id: z.string().uuid().optional(),
    });
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'app and provider_account_id are required' });
    }

    try {
      const provider = createAuthProvider();
      const row = await insertIntegration({
        accountId,
        app: parsed.data.app,
        appName: parsed.data.app_name,
        providerName: provider.name,
        providerAccountId: parsed.data.provider_account_id,
        label: parsed.data.label,
      });

      const link = {
        attempted: false,
        linked: false,
        reason: null as string | null,
      };

      if (parsed.data.sandbox_id && row) {
        link.attempted = true;
        const sandboxOwned = await verifySandboxOwnership(parsed.data.sandbox_id, accountId);
        if (sandboxOwned) {
          const conflict = await getSandboxAppConflict(parsed.data.sandbox_id, row.integrationId, row.app);
          if (!conflict) {
            await linkSandboxIntegration(parsed.data.sandbox_id, row.integrationId);
            console.log(`[INTEGRATIONS] Auto-linked: ${parsed.data.app} → sandbox ${parsed.data.sandbox_id}`);
            link.linked = true;
          } else {
            console.warn(
              `[INTEGRATIONS] Auto-link skipped due active conflict: app=${parsed.data.app} sandbox=${parsed.data.sandbox_id} existingIntegration=${conflict.integrationId}`,
            );
            link.reason = 'sandbox_conflict';
          }
        } else {
          console.warn(
            `[INTEGRATIONS] Auto-link skipped: sandbox not owned by account. app=${parsed.data.app} sandbox=${parsed.data.sandbox_id} account=${accountId}`,
          );
          link.reason = 'sandbox_not_owned';
        }
      }

      console.log(`[INTEGRATIONS] Saved: ${parsed.data.app} for account ${accountId}`);
      return c.json({ success: true, integration: row, link });
    } catch (err) {
      console.error('[INTEGRATIONS] Error saving connection:', err);
      return c.json({ error: 'Failed to save connection' }, 500);
    }
  });

  app.get('/connections', async (c) => {
    try {
      const userId = c.get('userId') as string;
      console.log('[INTEGRATIONS] GET /connections userId:', userId);
      const accountId = await resolveAccountId(userId);
      console.log('[INTEGRATIONS] GET /connections accountId:', accountId);
      const rows = await listIntegrationsByAccount(accountId);
      console.log('[INTEGRATIONS] GET /connections rows:', rows.length);
      return c.json({ connections: rows });
    } catch (err) {
      console.error('[INTEGRATIONS] GET /connections error:', err);
      return c.json({ connections: [] }, 500);
    }
  });

  app.get('/connections/:integrationId', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const { integrationId } = c.req.param();

    const row = await getIntegrationById(integrationId);
    if (!row || row.accountId !== accountId) {
      throw new HTTPException(404, { message: 'Integration not found' });
    }

    return c.json(row);
  });

  app.patch('/connections/:integrationId/label', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const { integrationId } = c.req.param();

    const body = await c.req.json();
    const labelSchema = z.object({
      label: z.string().min(1).max(255),
    });
    const parsed = labelSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'label is required (1-255 chars)' });
    }

    const row = await getIntegrationById(integrationId);
    if (!row || row.accountId !== accountId) {
      throw new HTTPException(404, { message: 'Integration not found' });
    }

    const updated = await updateIntegrationLabel(integrationId, parsed.data.label);
    return c.json({ success: true, integration: updated });
  });

  app.get('/connections/:integrationId/sandboxes', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const { integrationId } = c.req.param();

    const row = await getIntegrationById(integrationId);
    if (!row || row.accountId !== accountId) {
      throw new HTTPException(404, { message: 'Integration not found' });
    }

    const linkedSandboxes = await getLinkedSandboxes(integrationId);
    const appLinks = await getAppSandboxLinks(accountId, row.app);

    return c.json({
      sandboxes: linkedSandboxes,
      appSandboxLinks: appLinks,
    });
  });

  app.delete('/connections/:integrationId', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const { integrationId } = c.req.param();

    const row = await getIntegrationById(integrationId);
    if (!row || row.accountId !== accountId) {
      throw new HTTPException(404, { message: 'Integration not found' });
    }

    try {
      const provider = createAuthProvider();
      await provider.deleteAccount(accountId, row.providerAccountId as string);
    } catch (err) {
      console.error('[INTEGRATIONS] Error revoking on provider:', err);
    }

    await deleteIntegration(integrationId);
    return c.json({ success: true });
  });

  app.post('/connections/:integrationId/link', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const { integrationId } = c.req.param();

    const body = await c.req.json();
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'sandbox_id is required' });
    }

    const integration = await getIntegrationById(integrationId);
    if (!integration || integration.accountId !== accountId) {
      throw new HTTPException(404, { message: 'Integration not found' });
    }

    const sandboxOwned = await verifySandboxOwnership(parsed.data.sandbox_id, accountId);
    if (!sandboxOwned) {
      throw new HTTPException(403, { message: 'Sandbox not found or not owned by account' });
    }

    const conflict = await getSandboxAppConflict(parsed.data.sandbox_id, integrationId, integration.app);
    if (conflict) {
      throw new HTTPException(409, {
        message: `This sandbox already has a different ${integration.appName || integration.app} profile linked ("${conflict.label || 'Unnamed'}"). Unlink it first.`,
      });
    }

    await linkSandboxIntegration(parsed.data.sandbox_id, integrationId);
    return c.json({ success: true }, 201);
  });

  app.delete('/connections/:integrationId/link/:sandboxId', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const { integrationId, sandboxId } = c.req.param();

    const integration = await getIntegrationById(integrationId);
    if (!integration || integration.accountId !== accountId) {
      throw new HTTPException(404, { message: 'Integration not found' });
    }

    await unlinkSandboxIntegration(sandboxId, integrationId);
    return c.json({ success: true });
  });

  app.post('/connections/proxy', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);

    const body = await c.req.json();
    const parsed = proxyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'Invalid proxy request: app, url are required' });
    }

    const { app: appSlug, method, url, headers, body: reqBody, integration_id } = parsed.data;
    let providerAccountId: string | undefined;
    if (integration_id) {
      const integration = await getIntegrationById(integration_id);
      if (integration && integration.accountId === accountId) {
        providerAccountId = integration.providerAccountId;
      }
    }

    try {
      const provider = createAuthProvider();
      const result = await provider.proxyRequest(accountId, appSlug, {
        method,
        url,
        headers,
        body: reqBody,
      }, providerAccountId);

      console.log(`[INTEGRATIONS] User proxy: app=${appSlug} ${method} ${url} → ${result.status}`);
      c.header('Cache-Control', 'no-store');
      return c.json({
        status: result.status,
        body: result.body,
      });
    } catch (err) {
      console.error(`[INTEGRATIONS] User proxy failed for ${appSlug}:`, err);
      return c.json({ error: `Proxy request failed: ${err}` }, 502);
    }
  });

  app.post('/webhook', async (c) => {
    const body = await c.req.json();
    const parsed = webhookSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid webhook payload' }, 400);
    }

    const { account_id, app, app_name, provider_account_id, scopes, status } = parsed.data;

    try {
      const provider = createAuthProvider();
      await insertIntegration({
        accountId: account_id,
        app,
        appName: app_name,
        providerName: provider.name,
        providerAccountId: provider_account_id,
        scopes,
      });

      console.log(`[INTEGRATIONS] Webhook: ${app} connected for account ${account_id}`);
      return c.json({ success: true });
    } catch (err) {
      console.error('[INTEGRATIONS] Webhook processing error:', err);
      return c.json({ error: 'Webhook processing failed' }, 500);
    }
  });

  return app;
}

export function createIntegrationsTokenRouter(): Hono<SandboxEnv> {
  const app = new Hono<SandboxEnv>();

  async function ensureSandboxIntegrationForApp(sandboxId: string, accountId: string, appSlug: string) {
    const linked = await getIntegrationForSandbox(sandboxId, appSlug, accountId);
    if (linked) return linked;

    const accountIntegrations = await listIntegrationsByAccount(accountId);
    const candidates = accountIntegrations
      .filter((row) => row.app === appSlug && row.status === 'active')
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt ?? a.createdAt).getTime();
        const bTime = new Date(b.updatedAt ?? b.createdAt).getTime();
        return bTime - aTime;
      });

    const selected = candidates[0];
    if (!selected) return null;

    const conflict = await getSandboxAppConflict(sandboxId, selected.integrationId, appSlug);
    if (conflict) {
      console.warn(
        `[INTEGRATIONS] Auto-heal skipped for ${appSlug}: sandbox=${sandboxId} has active conflicting integration=${conflict.integrationId}`,
      );
      return null;
    }

    await linkSandboxIntegration(sandboxId, selected.integrationId);
    console.log(
      `[INTEGRATIONS] Auto-healed sandbox link: app=${appSlug} sandbox=${sandboxId} integration=${selected.integrationId}`,
    );

    return await getIntegrationForSandbox(sandboxId, appSlug, accountId);
  }

  app.post('/token', async (c) => {
    const sandboxId = c.get('sandboxId') as string;
    const accountId = c.get('accountId') as string;

    if (!sandboxId) {
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (kortix_sb_)' });
    }

    const body = await c.req.json();
    const parsed = tokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'app is required' });
    }

    const { app: appSlug } = parsed.data;

    const linked = await ensureSandboxIntegrationForApp(sandboxId, accountId, appSlug);
    if (!linked) {
      throw new HTTPException(403, {
        message: `No connected integration for "${appSlug}" linked to this sandbox`,
      });
    }

    try {
      const provider = createAuthProvider();
      const token = await provider.getAuthToken(accountId, appSlug, linked.providerAccountId);

      console.log(`[INTEGRATIONS] Token fetched: app=${appSlug} sandbox=${sandboxId} account=${accountId}`);
      await updateIntegrationLastUsed(linked.integrationId as string);

      c.header('Cache-Control', 'no-store');
      return c.json({
        access_token: token.accessToken,
        token_type: token.tokenType || 'Bearer',
        app: appSlug,
      });
    } catch (err) {
      console.error(`[INTEGRATIONS] Token fetch failed for ${appSlug}:`, err);
      throw new HTTPException(502, { message: `Failed to retrieve token for "${appSlug}"` });
    }
  });

  app.post('/proxy', async (c) => {
    const sandboxId = c.get('sandboxId') as string;
    const accountId = c.get('accountId') as string;

    if (!sandboxId) {
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (kortix_sb_)' });
    }

    const body = await c.req.json();
    const parsed = proxyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'Invalid proxy request: app, method, and url are required' });
    }

    const { app: appSlug, method, url, headers, body: reqBody } = parsed.data;

    const linked = await ensureSandboxIntegrationForApp(sandboxId, accountId, appSlug);
    if (!linked) {
      throw new HTTPException(403, {
        message: `No connected integration for "${appSlug}" linked to this sandbox`,
      });
    }

    try {
      const provider = createAuthProvider();
      const result = await provider.proxyRequest(accountId, appSlug, {
        method,
        url,
        headers,
        body: reqBody,
      }, linked.providerAccountId);

      console.log(`[INTEGRATIONS] Proxy: app=${appSlug} ${method} ${url} → ${result.status} sandbox=${sandboxId}`);
      await updateIntegrationLastUsed(linked.integrationId as string);

      c.header('Cache-Control', 'no-store');
      return c.json({
        status: result.status,
        body: result.body,
      });
    } catch (err) {
      console.error(`[INTEGRATIONS] Proxy failed for ${appSlug}:`, err);
      throw new HTTPException(502, { message: `Proxy request failed for "${appSlug}": ${err}` });
    }
  });

  app.get('/list', async (c) => {
    const sandboxId = c.get('sandboxId') as string;
    const accountId = c.get('accountId') as string;

    if (!sandboxId) {
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (kortix_sb_)' });
    }

    let linked = await listSandboxIntegrations(sandboxId, accountId);

    if (linked.length === 0) {
      const accountIntegrations = await listIntegrationsByAccount(accountId);
      const activeByApp = new Map<string, (typeof accountIntegrations)[number]>();

      for (const row of accountIntegrations) {
        if (row.status !== 'active') continue;
        const existing = activeByApp.get(row.app);
        if (!existing) {
          activeByApp.set(row.app, row);
          continue;
        }
        const existingTime = new Date(existing.updatedAt ?? existing.createdAt).getTime();
        const rowTime = new Date(row.updatedAt ?? row.createdAt).getTime();
        if (rowTime > existingTime) {
          activeByApp.set(row.app, row);
        }
      }

      for (const row of activeByApp.values()) {
        const conflict = await getSandboxAppConflict(sandboxId, row.integrationId, row.app);
        if (conflict) continue;
        await linkSandboxIntegration(sandboxId, row.integrationId);
      }

      linked = await listSandboxIntegrations(sandboxId, accountId);
      if (linked.length > 0) {
        console.log(
          `[INTEGRATIONS] Auto-healed sandbox links from account integrations: sandbox=${sandboxId} count=${linked.length}`,
        );
      }
    }

    return c.json({
      integrations: linked.map((l) => ({
        app: l.integration.app,
        appName: l.integration.appName,
        label: l.integration.label,
        status: l.integration.status,
      })),
    });
  });

  app.get('/actions', async (c) => {
    const sandboxId = c.get('sandboxId') as string;

    if (!sandboxId) {
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (kortix_sb_)' });
    }

    const appSlug = c.req.query('app');
    if (!appSlug) {
      throw new HTTPException(400, { message: 'app query parameter is required' });
    }

    const query = c.req.query('q');
    const limit = parseInt(c.req.query('limit') || '50', 10);

    try {
      const provider = createAuthProvider();
      const result = await provider.listActions(appSlug, query, limit);
      return c.json(result);
    } catch (err) {
      console.error(`[INTEGRATIONS] Error listing actions for ${appSlug}:`, err);
      return c.json({ error: `Failed to list actions for "${appSlug}"` }, 500);
    }
  });

  app.post('/connect', async (c) => {
    const sandboxId = c.get('sandboxId') as string;
    const accountId = c.get('accountId') as string;

    if (!sandboxId) {
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (kortix_sb_)' });
    }

    const body = await c.req.json();
    const parsed = tokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'app is required' });
    }

    const { app: appSlug } = parsed.data;

    try {
      const provider = createAuthProvider();
      const result = await provider.createConnectToken(accountId, appSlug);

      const dashboardUrl = `${config.FRONTEND_URL}/integrations?connect=${encodeURIComponent(appSlug)}&sandbox_id=${encodeURIComponent(sandboxId)}`;
      console.log(`[INTEGRATIONS] Connect token created: app=${appSlug} sandbox=${sandboxId} account=${accountId}`);
      return c.json({
        connectUrl: dashboardUrl,
        token: result.token,
        app: appSlug,
      });
    } catch (err) {
      console.error(`[INTEGRATIONS] Connect token failed for ${appSlug}:`, err);
      const detail = err instanceof Error ? err.message : String(err);
      throw new HTTPException(502, { message: `Failed to create connect token for "${appSlug}": ${detail}` });
    }
  });

  app.get('/search-apps', async (c) => {
    const sandboxId = c.get('sandboxId') as string;

    if (!sandboxId) {
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (kortix_sb_)' });
    }

    const query = c.req.query('q');
    const limit = parseInt(c.req.query('limit') || '20', 10);

    try {
      const provider = createAuthProvider();
      const result = await provider.listApps(query, limit);
      return c.json(result);
    } catch (err) {
      console.error('[INTEGRATIONS] Error searching apps:', err);
      return c.json({ error: 'Failed to search apps' }, 500);
    }
  });

  app.post('/run-action', async (c) => {
    const sandboxId = c.get('sandboxId') as string;
    const accountId = c.get('accountId') as string;

    if (!sandboxId) {
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (kortix_sb_)' });
    }

    const body = await c.req.json();
    const parsed = runActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'app, action_key are required' });
    }

    const { app: appSlug, action_key, props } = parsed.data;

    const linked = await ensureSandboxIntegrationForApp(sandboxId, accountId, appSlug);
    if (!linked) {
      throw new HTTPException(403, {
        message: `No connected integration for "${appSlug}" linked to this sandbox`,
      });
    }

    try {
      const provider = createAuthProvider();
      const result = await provider.runAction(accountId, action_key, props, appSlug, linked.providerAccountId);

      console.log(`[INTEGRATIONS] Action run: ${action_key} app=${appSlug} sandbox=${sandboxId} success=${result.success}`);
      await updateIntegrationLastUsed(linked.integrationId as string);

      c.header('Cache-Control', 'no-store');
      return c.json(result);
    } catch (err) {
      console.error(`[INTEGRATIONS] Action run failed for ${action_key}:`, err);
      throw new HTTPException(502, { message: `Action execution failed: ${err}` });
    }
  });

  return app;
}
