import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { config } from './config';
import { authMiddleware } from './middleware/auth';
import { sandboxesRouter } from './routes/sandboxes';
import { triggersRouter } from './routes/triggers';
import { executionsRouter } from './routes/executions';
import { startScheduler, getSchedulerStatus } from './scheduler';

const app = new Hono();

// ─── Global Middleware ───────────────────────────────────────────────────────
app.use('*', logger());
app.use('*', cors());

// ─── Health Check (no auth) ─────────────────────────────────────────────────
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'kortix-cron',
    timestamp: new Date().toISOString(),
    scheduler: getSchedulerStatus(),
  });
});

// ─── Auth Middleware ─────────────────────────────────────────────────────────
app.use('/v1/*', authMiddleware);

// ─── Routes ─────────────────────────────────────────────────────────────────
app.route('/v1/sandboxes', sandboxesRouter);
app.route('/v1/triggers', triggersRouter);
app.route('/v1/executions', executionsRouter);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// ─── Start Server & Scheduler ────────────────────────────────────────────────
const port = config.PORT;

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                        KORTIX CRON                              ║
╠══════════════════════════════════════════════════════════════════╣
║  Scheduled agent trigger service                                 ║
╠══════════════════════════════════════════════════════════════════╣
║  Endpoints:                                                      ║
║    GET    /health                    Health + scheduler status    ║
║    POST   /v1/sandboxes             Register sandbox target      ║
║    GET    /v1/sandboxes             List sandboxes                ║
║    GET    /v1/sandboxes/:id         Get sandbox                  ║
║    PATCH  /v1/sandboxes/:id         Update sandbox               ║
║    DELETE /v1/sandboxes/:id         Delete sandbox               ║
║    POST   /v1/sandboxes/:id/health  Check sandbox health         ║
║    POST   /v1/triggers              Create cron trigger           ║
║    GET    /v1/triggers              List triggers                 ║
║    GET    /v1/triggers/:id          Get trigger                   ║
║    PATCH  /v1/triggers/:id          Update trigger                ║
║    DELETE /v1/triggers/:id          Delete trigger                ║
║    POST   /v1/triggers/:id/pause    Pause trigger                 ║
║    POST   /v1/triggers/:id/resume   Resume trigger                ║
║    POST   /v1/triggers/:id/run      Manual fire trigger           ║
║    GET    /v1/executions            List executions               ║
║    GET    /v1/executions/:id        Get execution                 ║
║    GET    /v1/executions/by-trigger/:id  Executions by trigger    ║
╠══════════════════════════════════════════════════════════════════╣
║  Environment: ${config.ENV_MODE.padEnd(49)}║
║  Port: ${port.toString().padEnd(57)}║
║  Database: ${config.DATABASE_URL ? 'CONFIGURED' : 'NOT SET'.padEnd(53)}║
║  Supabase: ${(config.SUPABASE_URL ? 'CONFIGURED' : 'NOT SET').padEnd(53)}║
║  Scheduler: ${(config.SCHEDULER_ENABLED ? 'ENABLED' : 'DISABLED').padEnd(52)}║
║  Tick interval: ${(config.SCHEDULER_TICK_INTERVAL_MS + 'ms').padEnd(47)}║
╚══════════════════════════════════════════════════════════════════╝
`);

// Start the scheduler
startScheduler();

export default {
  port,
  fetch: app.fetch,
};
