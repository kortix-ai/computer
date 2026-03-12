import { Hono } from 'hono';
import { accountRouter } from './routes/account';
import { cloudSandboxRouter } from './routes/sandbox-cloud';
import { versionRouter } from './routes/version';
import { sandboxUpdateRouter } from './routes/sandbox-update';
import { apiKeysRouter } from './routes/api-keys';
import { sshRouter } from './routes/ssh';

const platformApp = new Hono();

// Sandbox version (from release.json)
// Full path: /v1/platform/sandbox/version
platformApp.route('/sandbox/version', versionRouter);

// Sandbox update (Docker image-based)
// Full path: /v1/platform/sandbox/update/*
platformApp.route('/sandbox/update', sandboxUpdateRouter);

// SSH key management
// Full path: /v1/platform/sandbox/ssh/*
platformApp.route('/sandbox/ssh', sshRouter);

// API key management (sandbox-scoped, DB-backed)
// Full path: /v1/platform/api-keys/*
platformApp.route('/api-keys', apiKeysRouter);

// Unified routes — always DB-backed.
// Full path: /v1/platform/providers, /v1/platform/init, /v1/platform/sandbox/*, etc.
platformApp.route('/', accountRouter);
platformApp.route('/sandbox', cloudSandboxRouter);

export { platformApp };
