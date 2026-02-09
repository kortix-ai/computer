import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  getProxyServices,
  isRouteAllowed,
  type ProxyServiceConfig,
} from '../config/proxy-services';
import { validateSecretKey } from '../repositories/api-keys';
import { isSupabaseConfigured } from '../lib/supabase';
import { checkCredits, deductToolCredits } from '../services/billing';

const proxy = new Hono();

const services = getProxyServices();

for (const [prefix, serviceConfig] of Object.entries(services)) {
  proxy.all(`/${prefix}/*`, (c) => handleProxy(c, serviceConfig, prefix));
  proxy.all(`/${prefix}`, (c) => handleProxy(c, serviceConfig, prefix));
}

// === Core Proxy Handler ===
//
// Two modes:
//
// 1. Request has a valid KORTIX token (sk_xxx validated against our DB)
//    → This is our user, using our infrastructure.
//    → Check if route is in includedRoutes (we only allow certain endpoints through our key).
//    → Inject Kortix's own API key for the upstream service.
//    → Forward to upstream, bill the user.
//
// 2. Request does NOT have a valid Kortix token (user has their own API key)
//    → Just passthrough. Forward everything as-is to upstream.
//    → No billing, no gating, no interference.

async function handleProxy(c: any, service: ProxyServiceConfig, prefix: string) {
  const fullPath = new URL(c.req.url).pathname;
  const prefixStr = `/${prefix}`;
  const subPath = fullPath.startsWith(prefixStr)
    ? fullPath.slice(prefixStr.length) || '/'
    : '/';
  const queryString = new URL(c.req.url).search;
  const method = c.req.method;

  const auth = await tryAuthenticate(c);

  if (auth.isKortixUser && auth.accountId) {
    // Kortix user → inject our key, bill them
    return handleKortixProxy(c, service, subPath, queryString, method, auth.accountId);
  } else {
    // Not our user → pure passthrough, their own key
    return handlePassthrough(c, service, subPath, queryString, method);
  }
}

// === Kortix User: inject our API key, bill them ===

async function handleKortixProxy(
  c: any,
  service: ProxyServiceConfig,
  subPath: string,
  queryString: string,
  method: string,
  accountId: string
) {
  // Only allow included routes through our key
  if (!isRouteAllowed(method, subPath, service.allowedRoutes)) {
    throw new HTTPException(403, {
      message: `Route not available: ${method} ${subPath}`,
    });
  }

  // Check credits
  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) {
    throw new HTTPException(402, { message: creditCheck.message });
  }

  // Check that we have a key configured for this service
  const kortixKey = service.getKortixApiKey();
  if (!kortixKey) {
    throw new HTTPException(503, {
      message: `${service.name} not configured`,
    });
  }

  const targetUrl = `${service.targetBaseUrl}${subPath}${queryString}`;
  const headers = buildForwardHeaders(c);
  let body = await getRequestBody(c, method);

  // Inject OUR API key (replacing whatever was there)
  body = injectApiKey(service, headers, body);

  console.log(`[PROXY] ${service.name} (kortix:${accountId}) ${method} ${subPath} → ${targetUrl}`);

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    // @ts-ignore
    duplex: 'half',
  });

  // Bill the user (fire-and-forget)
  deductToolCredits(
    accountId,
    service.billingToolName,
    0,
    `Proxy ${service.name}: ${method} ${subPath}`,
  ).catch((err) => console.error(`[PROXY] Billing error: ${err}`));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

// === Not Kortix user: pure passthrough, no billing ===

async function handlePassthrough(
  c: any,
  service: ProxyServiceConfig,
  subPath: string,
  queryString: string,
  method: string
) {
  const targetUrl = `${service.targetBaseUrl}${subPath}${queryString}`;
  const headers = buildForwardHeaders(c);
  const body = await getRequestBody(c, method);

  console.log(`[PROXY] ${service.name} (passthrough) ${method} ${subPath}`);

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    // @ts-ignore
    duplex: 'half',
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

// === Helpers ===

/**
 * Check if the request has a valid Kortix token.
 * Only sk_xxx keys validated against our DB count as "Kortix user".
 * Anything else (user's own Tavily key, etc.) is not ours → passthrough.
 */
async function tryAuthenticate(c: any): Promise<{ isKortixUser: boolean; accountId?: string }> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { isKortixUser: false };
  }

  const token = authHeader.slice(7);
  if (!token) return { isKortixUser: false };

  // Test token (dev mode)
  if (token === '00000') {
    return { isKortixUser: true, accountId: 'test_account' };
  }

  // Validate sk_xxx against our DB
  if (token.startsWith('sk_') && isSupabaseConfigured()) {
    try {
      const result = await validateSecretKey(token);
      if (result.isValid && result.accountId) {
        return { isKortixUser: true, accountId: result.accountId };
      }
    } catch {
      // Not valid → passthrough
    }
  }

  // Anything else is NOT a Kortix token → passthrough
  return { isKortixUser: false };
}

function buildForwardHeaders(c: any): Headers {
  const headers = new Headers();
  for (const [key, value] of c.req.raw.headers.entries()) {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  }
  return headers;
}

async function getRequestBody(c: any, method: string): Promise<ArrayBuffer | string | undefined> {
  if (method === 'GET' || method === 'HEAD') return undefined;
  return await c.req.raw.clone().arrayBuffer();
}

/**
 * Inject Kortix's own API key, replacing whatever auth the request had.
 */
function injectApiKey(
  service: ProxyServiceConfig,
  headers: Headers,
  body: ArrayBuffer | string | undefined
): ArrayBuffer | string | undefined {
  const injection = service.keyInjection;
  const key = service.getKortixApiKey();

  switch (injection.type) {
    case 'header': {
      const value = injection.prefix ? `${injection.prefix}${key}` : key;
      headers.set(injection.headerName, value);
      return body;
    }

    case 'json_body_field': {
      if (!body) return body;
      try {
        const text = typeof body === 'string'
          ? body
          : new TextDecoder().decode(body);
        const json = JSON.parse(text);
        json[injection.field] = key;
        const newBody = JSON.stringify(json);
        headers.set('Content-Length', new TextEncoder().encode(newBody).length.toString());
        return newBody;
      } catch {
        console.warn(`[PROXY] Could not inject API key into body for ${service.name}`);
        return body;
      }
    }

    default:
      return body;
  }
}

export { proxy };
