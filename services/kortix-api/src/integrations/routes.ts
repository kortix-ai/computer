import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { createAuthProvider } from './providers';
import { config } from '../config';
import {
  insertIntegration,
  listIntegrationsByAccount,
  getIntegrationById,
  deleteIntegration,
  linkSandboxIntegration,
  unlinkSandboxIntegration,
  getIntegrationForSandbox,
  updateIntegrationLastUsed,
  verifySandboxOwnership,
  listSandboxIntegrations,
} from './repositories';
import type { AppEnv } from '../types';

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
    const accountId = userId;

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
    const accountId = userId;

    const body = await c.req.json();
    const saveSchema = z.object({
      app: z.string().min(1),
      app_name: z.string().optional(),
      provider_account_id: z.string().min(1),
    });
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'app and provider_account_id are required' });
    }

    try {
      const provider = createAuthProvider();
      await insertIntegration({
        accountId,
        app: parsed.data.app,
        appName: parsed.data.app_name,
        providerName: provider.name,
        providerAccountId: parsed.data.provider_account_id,
      });

      console.log(`[INTEGRATIONS] Saved: ${parsed.data.app} for account ${accountId}`);
      return c.json({ success: true });
    } catch (err) {
      console.error('[INTEGRATIONS] Error saving connection:', err);
      return c.json({ error: 'Failed to save connection' }, 500);
    }
  });

  app.get('/connections', async (c) => {
    try {
      const userId = c.get('userId') as string;
      console.log('[INTEGRATIONS] GET /connections userId:', userId);
      const accountId = userId;
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
    const accountId = userId;
    const { integrationId } = c.req.param();

    const row = await getIntegrationById(integrationId);
    if (!row || row.accountId !== accountId) {
      throw new HTTPException(404, { message: 'Integration not found' });
    }

    return c.json(row);
  });

  app.delete('/connections/:integrationId', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = userId;
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
    const accountId = userId;
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

    
    await linkSandboxIntegration(parsed.data.sandbox_id, integrationId);
    return c.json({ success: true }, 201);
  });

  app.delete('/connections/:integrationId/link/:sandboxId', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = userId;
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
    const accountId = userId;

    const body = await c.req.json();
    const parsed = proxyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'Invalid proxy request: app, url are required' });
    }

    const { app: appSlug, method, url, headers, body: reqBody } = parsed.data;

    try {
      const provider = createAuthProvider();
      const result = await provider.proxyRequest(accountId, appSlug, {
        method,
        url,
        headers,
        body: reqBody,
      });

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
  app.post('/token', async (c) => {
    const sandboxId = c.get('sandboxId') as string;
    const accountId = c.get('accountId') as string;

    if (!sandboxId) {
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (sbt_)' });
    }

    const body = await c.req.json();
    const parsed = tokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'app is required' });
    }

    const { app: appSlug } = parsed.data;

    const linked = await getIntegrationForSandbox(sandboxId, appSlug, accountId);
    if (!linked) {
      throw new HTTPException(403, {
        message: `No connected integration for "${appSlug}" linked to this sandbox`,
      });
    }

    try {
      const provider = createAuthProvider();
      const token = await provider.getAuthToken(accountId, appSlug);

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
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (sbt_)' });
    }

    const body = await c.req.json();
    const parsed = proxyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'Invalid proxy request: app, method, and url are required' });
    }

    const { app: appSlug, method, url, headers, body: reqBody } = parsed.data;

    const linked = await getIntegrationForSandbox(sandboxId, appSlug, accountId);
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
      });

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
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (sbt_)' });
    }

    const linked = await listSandboxIntegrations(sandboxId, accountId);
    return c.json({
      integrations: linked.map((l) => ({
        app: l.integration.app,
        appName: l.integration.appName,
        status: l.integration.status,
      })),
    });
  });

  app.get('/actions', async (c) => {
    const sandboxId = c.get('sandboxId') as string;

    if (!sandboxId) {
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (sbt_)' });
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
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (sbt_)' });
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

      const dashboardUrl = `${config.FRONTEND_URL}/integrations?connect=${encodeURIComponent(appSlug)}`;
      console.log(`[INTEGRATIONS] Connect token created: app=${appSlug} sandbox=${sandboxId} account=${accountId}`);
      return c.json({
        connectUrl: dashboardUrl,
        token: result.token,
        app: appSlug,
      });
    } catch (err) {
      console.error(`[INTEGRATIONS] Connect token failed for ${appSlug}:`, err);
      throw new HTTPException(502, { message: `Failed to create connect token for "${appSlug}"` });
    }
  });

  app.get('/search-apps', async (c) => {
    const sandboxId = c.get('sandboxId') as string;

    if (!sandboxId) {
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (sbt_)' });
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
      throw new HTTPException(403, { message: 'This endpoint requires a sandbox token (sbt_)' });
    }

    const body = await c.req.json();
    const parsed = runActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'app, action_key are required' });
    }

    const { app: appSlug, action_key, props } = parsed.data;

    const linked = await getIntegrationForSandbox(sandboxId, appSlug, accountId);
    if (!linked) {
      throw new HTTPException(403, {
        message: `No connected integration for "${appSlug}" linked to this sandbox`,
      });
    }

    try {
      const provider = createAuthProvider();
      const result = await provider.runAction(accountId, action_key, props, appSlug);

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
