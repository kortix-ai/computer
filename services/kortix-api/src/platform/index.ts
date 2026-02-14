import { Hono } from 'hono';
import { config } from '../config';
import { accountRouter } from './routes/account';
import { localAccountRouter } from './routes/account-local';
import { localSandboxRouter } from './routes/sandbox-local';
import { cloudSandboxRouter } from './routes/sandbox-cloud';
import { versionRouter } from './routes/version';

const platformApp = new Hono();

// Sandbox version (no auth — npm registry lookup)
platformApp.route('/v1/sandbox/version', versionRouter);

// Both local and cloud use the same /v1/sandbox route prefix.
// The implementation differs (Docker vs DB-backed) but the API shape is identical.
if (config.isLocal()) {
  console.log('[PLATFORM] Using local Docker routes (ENV_MODE=local)');
  platformApp.route('/v1/account', localAccountRouter);
  platformApp.route('/v1/sandbox', localSandboxRouter);
} else {
  platformApp.route('/v1/account', accountRouter);
  platformApp.route('/v1/sandbox', cloudSandboxRouter);
}

export { platformApp };
