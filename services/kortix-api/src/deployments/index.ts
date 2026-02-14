import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import { deploymentsRouter } from './routes/deployments';

const deploymentsApp = new Hono();

deploymentsApp.use('/v1/deployments/*', supabaseAuth);
deploymentsApp.route('/v1/deployments', deploymentsRouter);

export { deploymentsApp };
