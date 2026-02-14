import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import { sandboxesRouter } from './routes/sandboxes';
import { triggersRouter } from './routes/triggers';
import { executionsRouter } from './routes/executions';

export { startScheduler, stopScheduler, getSchedulerStatus } from './services/scheduler';

const cronApp = new Hono();

// All cron routes require supabaseAuth
cronApp.use('/v1/sandboxes/*', supabaseAuth);
cronApp.use('/v1/triggers/*', supabaseAuth);
cronApp.use('/v1/executions/*', supabaseAuth);

cronApp.route('/v1/sandboxes', sandboxesRouter);
cronApp.route('/v1/triggers', triggersRouter);
cronApp.route('/v1/executions', executionsRouter);

export { cronApp };
