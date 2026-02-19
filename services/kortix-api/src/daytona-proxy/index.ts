import { Hono } from 'hono';
import { config } from '../config';
import { sandboxTokenAuth, supabaseAuthWithQueryParam } from '../middleware/auth';
import { preview } from './routes/preview';
import { localPreview } from './routes/local-preview';

const daytonaProxyApp = new Hono();

// Auth middleware for preview proxy:
//   - Local/VPS mode (config.isLocal()) → validate SANDBOX_AUTH_TOKEN if configured, else passthrough
//   - Cloud mode → validate Supabase JWT
daytonaProxyApp.use('/:sandboxId/:port/*', async (c, next) => {
  if (config.isLocal()) return sandboxTokenAuth(c, next);
  return supabaseAuthWithQueryParam(c, next);
});
daytonaProxyApp.use('/:sandboxId/:port', async (c, next) => {
  if (config.isLocal()) return sandboxTokenAuth(c, next);
  return supabaseAuthWithQueryParam(c, next);
});

// Mount handler based on mode — only one is active per deployment.
// Local mode: proxy directly to sandbox containers via Docker DNS.
// Cloud mode: proxy through Daytona SDK.
if (config.isLocal()) {
  daytonaProxyApp.route('/', localPreview);
} else {
  daytonaProxyApp.route('/', preview);
}

export { daytonaProxyApp };
