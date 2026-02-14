import { Hono } from 'hono';
import { config } from '../config';
import { accountRouter } from './routes/account';
import { localAccountRouter } from './routes/account-local';
import { versionRouter } from './routes/version';

const platformApp = new Hono();

// Sandbox version (no auth — npm registry lookup)
platformApp.route('/v1/sandbox/version', versionRouter);

// Account routes — use Docker-backed local router when ENV_MODE=local,
// otherwise use the DB-backed router with Supabase auth.
if (config.isLocal()) {
  console.log('[PLATFORM] Using local Docker account router (ENV_MODE=local)');
  platformApp.route('/v1/account', localAccountRouter);
} else {
  platformApp.route('/v1/account', accountRouter);
}

export { platformApp };
