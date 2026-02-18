import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { config } from '../config';
import { supabaseAuthWithQueryParam } from '../middleware/auth';
import { preview } from './routes/preview';

const sandboxProxyApp = new Hono();

// Auth: Supabase JWT from header or ?token= query param (for SSE/iframes).
// In local mode, skip auth entirely — local sandboxes are trusted.
// We check at request time (not module load time) so config changes take effect.
async function conditionalAuth(c: Context, next: Next) {
  if (config.isLocal()) {
    return next();
  }
  return supabaseAuthWithQueryParam(c, next);
}

sandboxProxyApp.use('/:sandboxId/:port/*', conditionalAuth);
sandboxProxyApp.use('/:sandboxId/:port', conditionalAuth);

sandboxProxyApp.route('/', preview);

export { sandboxProxyApp };
