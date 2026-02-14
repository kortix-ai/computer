import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import { sandboxesRouter } from './routes/sandboxes';
import { triggersRouter } from './routes/triggers';
import { executionsRouter } from './routes/executions';

export { startScheduler, stopScheduler, getSchedulerStatus } from './services/scheduler';

const cronApp = new Hono();

// All cron routes require supabaseAuth
// Full paths: /v1/cron/sandboxes/*, /v1/cron/triggers/*, /v1/cron/executions/*
cronApp.use('/sandboxes/*', supabaseAuth);
cronApp.use('/triggers/*', supabaseAuth);
cronApp.use('/executions/*', supabaseAuth);

cronApp.route('/sandboxes', sandboxesRouter);
cronApp.route('/triggers', triggersRouter);
cronApp.route('/executions', executionsRouter);

export { cronApp };
