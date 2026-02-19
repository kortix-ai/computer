import { Hono } from 'hono';
import { config } from '../config';
import { sandboxTokenAuth, supabaseAuthWithQueryParam } from '../middleware/auth';
import { preview } from './routes/preview';
import { localPreview } from './routes/local-preview';

const daytonaProxyApp = new Hono();

// Auth middleware for preview proxy:
//   - sandboxId === 'local' → validate SANDBOX_AUTH_TOKEN if configured, else passthrough
//   - sandboxId !== 'local' → validate Supabase JWT (cloud/Daytona)
daytonaProxyApp.use('/:sandboxId/:port/*', async (c, next) => {
  if (c.req.param('sandboxId') === 'local') return sandboxTokenAuth(c, next);
  return supabaseAuthWithQueryParam(c, next);
});
daytonaProxyApp.use('/:sandboxId/:port', async (c, next) => {
  if (c.req.param('sandboxId') === 'local') return sandboxTokenAuth(c, next);
  return supabaseAuthWithQueryParam(c, next);
});

// Mount local preview handler (handles sandboxId=local, skips Daytona)
daytonaProxyApp.route('/', localPreview);
// Mount cloud preview handler (handles all other sandboxIds via Daytona)
daytonaProxyApp.route('/', preview);

export { daytonaProxyApp };
