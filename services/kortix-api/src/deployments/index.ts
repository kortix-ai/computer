import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import { deploymentsRouter } from './routes/deployments';

const deploymentsApp = new Hono();

// Full path: /v1/deployments/*
deploymentsApp.use('/*', supabaseAuth);
deploymentsApp.route('/', deploymentsRouter);

export { deploymentsApp };
