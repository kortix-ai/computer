import { Hono } from 'hono';
import { config } from '../config';
import { accountRouter } from './routes/account';
import { localAccountRouter } from './routes/account-local';
import { localSandboxRouter } from './routes/sandbox-local';
import { cloudSandboxRouter } from './routes/sandbox-cloud';
import { versionRouter } from './routes/version';

const platformApp = new Hono();

// Sandbox version (no auth — npm registry lookup)
// Full path: /v1/platform/sandbox/version
platformApp.route('/sandbox/version', versionRouter);

// Both local and cloud use the same route prefix.
// The implementation differs (Docker vs DB-backed) but the API shape is identical.
// Full path: /v1/platform/providers, /v1/platform/init, /v1/platform/sandbox/*, etc.
if (config.isLocal()) {
  console.log('[PLATFORM] Using local Docker routes (ENV_MODE=local)');
  platformApp.route('/', localAccountRouter);
  platformApp.route('/sandbox', localSandboxRouter);
} else {
  platformApp.route('/', accountRouter);
  platformApp.route('/sandbox', cloudSandboxRouter);
}

export { platformApp };
