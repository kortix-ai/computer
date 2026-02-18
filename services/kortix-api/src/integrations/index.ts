import { Hono } from 'hono';
import { supabaseAuth, apiKeyAuth } from '../middleware/auth';
import { createIntegrationsRouter, createIntegrationsTokenRouter } from './routes';

const integrationsApp = new Hono();

integrationsApp.use('/apps', supabaseAuth);
integrationsApp.use('/connect-token', supabaseAuth);
integrationsApp.use('/connections/*', supabaseAuth);
integrationsApp.use('/connections', supabaseAuth);
integrationsApp.use('/connections/save', supabaseAuth);

integrationsApp.use('/token', apiKeyAuth);
integrationsApp.use('/proxy', apiKeyAuth);
integrationsApp.use('/list', apiKeyAuth);
integrationsApp.use('/actions', apiKeyAuth);
integrationsApp.use('/run-action', apiKeyAuth);
integrationsApp.use('/connect', apiKeyAuth);
integrationsApp.use('/search-apps', apiKeyAuth);

integrationsApp.route('/', createIntegrationsRouter());
integrationsApp.route('/', createIntegrationsTokenRouter());

export { integrationsApp };
