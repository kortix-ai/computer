import { Hono } from 'hono';
import { config } from '../config';
import { accountRouter } from './routes/account';
import { localAccountRouter } from './routes/account-local';
import { localSandboxRouter } from './routes/sandbox-local';
import { versionRouter } from './routes/version';

const platformApp = new Hono();

// Sandbox version (no auth — npm registry lookup)
platformApp.route('/v1/sandbox/version', versionRouter);

// Account routes — use Docker-backed local router when ENV_MODE=local,
// otherwise use the DB-backed router with Supabase auth.
if (config.isLocal()) {
  console.log('[PLATFORM] Using local Docker routes (ENV_MODE=local)');
  platformApp.route('/v1/account', localAccountRouter);
  platformApp.route('/v1/sandbox', localSandboxRouter);
} else {
  platformApp.route('/v1/account', accountRouter);
  // Cloud mode: sandbox routes are handled within the account router for now
}

export { platformApp };
