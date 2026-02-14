import { Hono } from 'hono';
import { supabaseAuthWithQueryParam } from '../middleware/auth';
import { preview } from './routes/preview';

const daytonaProxyApp = new Hono();

// Auth: Supabase JWT from header or ?token= query param (for SSE)
daytonaProxyApp.use('/:sandboxId/:port/*', supabaseAuthWithQueryParam);
daytonaProxyApp.use('/:sandboxId/:port', supabaseAuthWithQueryParam);
daytonaProxyApp.route('/', preview);

export { daytonaProxyApp };
