import { Hono } from 'hono';
import { accountRouter } from './routes/account';
import { cloudSandboxRouter } from './routes/sandbox-cloud';
import { versionRouter } from './routes/version';
import { apiKeysRouter } from './routes/api-keys';
import { sshRouter } from './routes/ssh';

const platformApp = new Hono();

// Sandbox version (no auth — npm registry lookup) 
// Full path: /v1/platform/sandbox/version
platformApp.route('/sandbox/version', versionRouter);

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
