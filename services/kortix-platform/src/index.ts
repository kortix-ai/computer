import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';

import { config } from './config';
import { accountRouter } from './routes/account';
import { getAvailableProviders } from './providers';
import { versionRouter } from './routes/version';
import type { AuthVariables } from './types';

const app = new Hono<{ Variables: AuthVariables }>();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: [
      'https://www.kortix.com',
      'https://kortix.com',
      'https://dev.kortix.com',
      'https://staging.kortix.com',
      ...(config.isDevelopment()
        ? ['http://localhost:3000', 'http://127.0.0.1:3000']
        : []),
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'kortix-platform',
    timestamp: new Date().toISOString(),
    env: config.ENV_MODE,
    providers: getAvailableProviders(),
  });
});

// Mount routes
app.route('/v1/account', accountRouter);
app.route('/v1/sandbox/version', versionRouter);

// Error handler
app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`, err.stack);

  if (err instanceof HTTPException) {
    return c.json(
      {
        error: true,
        message: err.message,
        status: err.status,
      },
      err.status
    );
  }

  return c.json(
    {
      error: true,
      message: 'Internal server error',
      status: 500,
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: true, message: 'Not found', status: 404 }, 404);
});

// Start server
const port = config.PORT;
const providers = getAvailableProviders();

console.log(`
╔═══════════════════════════════════════════════════════════╗
║              Kortix Platform Starting                     ║
╠═══════════════════════════════════════════════════════════╣
║  Port: ${port.toString().padEnd(49)}║
║  Mode: ${config.ENV_MODE.padEnd(49)}║
╠═══════════════════════════════════════════════════════════╣
║  Endpoints:                                               ║
║    GET   /v1/account/providers       Available providers   ║
║    POST  /v1/account/init            Init account+sandbox  ║
║    GET   /v1/account/sandbox         Get active sandbox    ║
║    GET   /v1/account/sandboxes       List all sandboxes    ║
║    POST  /v1/account/sandbox/:id/start  Start sandbox      ║
║    POST  /v1/account/sandbox/:id/stop   Stop sandbox       ║
║    DELETE /v1/account/sandbox/:id       Remove sandbox     ║
║    GET   /v1/sandbox/version         Sandbox version       ║
╠═══════════════════════════════════════════════════════════╣
║  Database:   ${config.DATABASE_URL ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Supabase:   ${config.SUPABASE_URL ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Providers:  ${providers.join(', ').padEnd(42)}║
║  Kortix URL: ${(config.KORTIX_URL || 'NOT SET').padEnd(42)}║
╚═══════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
