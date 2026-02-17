import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import { sandboxesRouter } from './routes/sandboxes';
import { triggersRouter } from './routes/triggers';
import { executionsRouter } from './routes/executions';
import { tickRouter } from './routes/tick';

export {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  schedulePgCronJob,
  unschedulePgCronJob,
} from './services/scheduler';

const cronApp = new Hono();

// Tick/execute endpoints use x-cron-secret auth (pg_cron can't produce JWTs)
cronApp.route('/tick', tickRouter);

// All other cron routes require supabaseAuth
cronApp.use('/sandboxes/*', supabaseAuth);
cronApp.use('/triggers/*', supabaseAuth);
cronApp.use('/executions/*', supabaseAuth);

cronApp.route('/sandboxes', sandboxesRouter);
cronApp.route('/triggers', triggersRouter);
cronApp.route('/executions', executionsRouter);

export { cronApp };
