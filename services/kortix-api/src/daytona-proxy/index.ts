import { Hono } from 'hono';
import { config } from '../config';
import { previewProxyAuth } from '../middleware/auth';
import { preview } from './routes/preview';
import { proxyToSandbox } from './routes/local-preview';
import { getAuthToken } from './routes/auth';

const daytonaProxyApp = new Hono();

// ── Cookie auth endpoint ────────────────────────────────────────────────────
// POST /v1/preview/auth — validates JWT and sets __preview_session cookie.
daytonaProxyApp.route('/auth', getAuthToken);

// ── Path-based proxy ────────────────────────────────────────────────────────
// Auth middleware for both modes (Supabase JWT, sbt_ tokens, cookies).
daytonaProxyApp.use('/:sandboxId/:port/*', previewProxyAuth);
daytonaProxyApp.use('/:sandboxId/:port', previewProxyAuth);

if (config.isDaytonaEnabled()) {
  // Cloud/Daytona: full Daytona SDK preview resolution + auto-wake.
  daytonaProxyApp.route('/', preview);
} else {
  // Local mode: path-based proxy to sandbox container.
  // Used by the frontend for OpenCode API calls (health, events, files, sessions).
  // User-facing preview iframes use subdomain routing (handled in index.ts).
  const localPathProxy = new Hono();

  localPathProxy.all('/:sandboxId/:port/*', async (c) => {
    const sandboxId = c.req.param('sandboxId');
    const port = parseInt(c.req.param('port'), 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return c.json({ error: `Invalid port: ${c.req.param('port')}` }, 400);
    }

    const fullPath = new URL(c.req.url).pathname;
    const prefix = `/${sandboxId}/${port}`;
    const idx = fullPath.indexOf(prefix);
    const remainingPath = idx !== -1 ? fullPath.slice(idx + prefix.length) || '/' : '/';

    const urlObj = new URL(c.req.url);
    urlObj.searchParams.delete('token');
    const queryString = urlObj.search;

    const method = c.req.method;
    let body: ArrayBuffer | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      body = await c.req.raw.arrayBuffer();
    }

    const acceptsSSE = (c.req.header('accept') || '').includes('text/event-stream');
    const origin = c.req.header('Origin') || '';

    return proxyToSandbox(sandboxId, port, method, remainingPath, queryString, c.req.raw.headers, body, acceptsSSE, origin);
  });

  localPathProxy.all('/:sandboxId/:port', async (c) => {
    const sandboxId = c.req.param('sandboxId');
    const port = c.req.param('port');
    return c.redirect(`/${sandboxId}/${port}/`, 301);
  });

  daytonaProxyApp.route('/', localPathProxy);
}

export { daytonaProxyApp };
