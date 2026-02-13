import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';

import { config } from './config';
import { authMiddleware } from './middleware/auth';
import { preview } from './routes/preview';
import { isSupabaseConfigured } from './lib/supabase';
import { isDaytonaConfigured } from './lib/daytona';
import type { AppContext } from './types';

const app = new Hono<{ Variables: AppContext }>();

// === Global Middleware ===

app.use(
  '*',
  cors({
    origin: [
      'https://www.kortix.com',
      'https://kortix.com',
      'https://dev.kortix.com',
      'https://staging.kortix.com',
      'https://kortix.cloud',
      'https://www.kortix.cloud',
      ...(config.isDevelopment()
        ? ['http://localhost:3000', 'http://127.0.0.1:3000']
        : []),
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use('*', logger());

// === Health Check (no auth) ===

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'kortix-daytona-proxy',
    timestamp: new Date().toISOString(),
    env: config.ENV_MODE,
  });
});

// === Preview Routes (auth required) ===

app.use('/:sandboxId/:port/*', authMiddleware);
app.use('/:sandboxId/:port', authMiddleware);
app.route('/', preview);

// === Error Handling ===

app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`, err.stack);

  if (err instanceof HTTPException) {
    const response: Record<string, unknown> = {
      error: true,
      message: err.message,
      status: err.status,
    };

    // Add Retry-After header for 503s (sandbox waking up)
    if (err.status === 503) {
      c.header('Retry-After', '10');
    }

    return c.json(response, err.status);
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

// === 404 Handler ===

app.notFound((c) => {
  return c.json(
    {
      error: true,
      message: 'Not found',
      status: 404,
    },
    404
  );
});

// === Start Server ===

console.log(`
╔═══════════════════════════════════════════════════════════╗
║          Kortix Daytona Proxy Starting                     ║
╠═══════════════════════════════════════════════════════════╣
║  Port: ${config.PORT.toString().padEnd(49)}║
║  Mode: ${config.ENV_MODE.padEnd(49)}║
╠═══════════════════════════════════════════════════════════╣
║  Database:  ${config.DATABASE_URL ? '✓ Configured'.padEnd(43) : '✗ NOT SET'.padEnd(43)}║
║  Supabase:  ${isSupabaseConfigured() ? '✓ Configured'.padEnd(43) : '✗ NOT SET'.padEnd(43)}║
║  Daytona:   ${isDaytonaConfigured() ? '✓ Configured'.padEnd(43) : '✗ NOT SET'.padEnd(43)}║
╚═══════════════════════════════════════════════════════════╝
`);

export default {
  port: config.PORT,
  fetch: app.fetch,
};
