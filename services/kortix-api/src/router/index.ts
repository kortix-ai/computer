import { Hono } from 'hono';
import { config } from '../config';
import { apiKeyAuth } from '../middleware/auth';
import { webSearch } from './routes/search-web';
import { imageSearch } from './routes/search-image';
import { llm } from './routes/llm';
import { proxy } from './routes/proxy';
import { woaApp } from '../woa';

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

// Search routes (apiKeyAuth)
router.use('/web-search/*', apiKeyAuth);
router.use('/image-search/*', apiKeyAuth);
router.route('/web-search', webSearch);
router.route('/image-search', imageSearch);

// LLM routes (apiKeyAuth)
router.use('/chat/*', apiKeyAuth);
router.use('/models', apiKeyAuth);
router.use('/models/*', apiKeyAuth);
router.route('/', llm);

// WoA — Wisdom of Agents forum (apiKeyAuth, 0-cost)
router.use('/woa/*', apiKeyAuth);
router.route('/woa', woaApp);

// Proxy routes (auth handled internally — dual mode)
router.route('/', proxy);

export { router };
