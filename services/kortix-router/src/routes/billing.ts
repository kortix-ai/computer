import { Hono } from 'hono';
import { config } from '../config';
import type { AppContext } from '../types';

export const billing = new Hono<{ Variables: AppContext }>();

async function proxyToBilling(c: any) {
  // Strip /v1 prefix if present: /v1/billing/... → /billing/...
  const path = c.req.path.replace(/^\/v1/, '');
  const url = `${config.BILLING_SERVICE_URL}${path}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete('host');

  const res = await fetch(url, {
    method: c.req.method,
    headers,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
      ? c.req.raw.body
      : undefined,
    // @ts-ignore - duplex needed for streaming request body
    duplex: 'half',
  });

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
}

// Match both /billing/* and /v1/billing/*
billing.all('/billing/*', proxyToBilling);
billing.all('/v1/billing/*', proxyToBilling);
billing.all('/setup/*', proxyToBilling);
billing.all('/v1/setup/*', proxyToBilling);
billing.all('/webhooks/*', proxyToBilling);
billing.all('/v1/webhooks/*', proxyToBilling);
