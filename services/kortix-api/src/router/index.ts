import { Hono } from 'hono';
import { config } from '../config';
import { apiKeyAuth } from '../middleware/auth';
import { webSearch } from './routes/search-web';
import { imageSearch } from './routes/search-image';
import { llm } from './routes/llm';
import { proxy } from './routes/proxy';

const router = new Hono();

// Health checks (no auth)
router.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'kortix-router',
    timestamp: new Date().toISOString(),
    env: config.ENV_MODE,
  });
});

router.get('/v1/health', (c) => {
  return c.json({ status: 'ok', service: 'kortix', timestamp: new Date().toISOString() });
});

// System status (no auth — polled by frontend for maintenance banners)
router.get('/v1/system/status', (c) => {
  return c.json({
    maintenanceNotice: { enabled: false },
    technicalIssue: { enabled: false },
    updatedAt: new Date().toISOString(),
  });
});

// Search routes (apiKeyAuth)
router.use('/web-search/*', apiKeyAuth);
router.use('/image-search/*', apiKeyAuth);
router.route('/web-search', webSearch);
router.route('/image-search', imageSearch);

// LLM routes (apiKeyAuth)
router.use('/v1/chat/*', apiKeyAuth);
router.use('/v1/models', apiKeyAuth);
router.use('/v1/models/*', apiKeyAuth);
router.route('/v1', llm);

// Proxy routes (auth handled internally — dual mode)
router.route('/', proxy);

export { router };
