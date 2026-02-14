import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  getProxyServices,
  matchAllowedRoute,
  type ProxyServiceConfig,
} from '../config/proxy-services';
import { validateSecretKey } from '../../repositories/api-keys';
import { validateSandboxToken } from '../../repositories/sandboxes';
import { config } from '../../config';
import { checkCredits, deductToolCredits } from '../services/billing';

const proxy = new Hono();

const services = getProxyServices();

for (const [prefix, serviceConfig] of Object.entries(services)) {
  proxy.all(`/${prefix}/*`, (c) => handleProxy(c, serviceConfig, prefix));
  proxy.all(`/${prefix}`, (c) => handleProxy(c, serviceConfig, prefix));
}

// === Core Proxy Handler ===
//
// 1. Valid KORTIX token (sk_xxx in our DB)
//    → Match against allowedRoutes (exact model paths for replicate, etc.)
//    → Inject Kortix's API key, forward, bill user with route-specific pricing.
//
// 2. Not a Kortix token (user's own API key)
//    → Pure passthrough. No billing, no gating.

async function handleProxy(c: any, service: ProxyServiceConfig, prefix: string) {
  const fullPath = new URL(c.req.url).pathname;
  const prefixStr = `/${prefix}`;
  // Find the prefix anywhere in the path (handles mount-point prefixing by Hono)
  const prefixIdx = fullPath.indexOf(prefixStr);
  const subPath = prefixIdx !== -1
    ? fullPath.slice(prefixIdx + prefixStr.length) || '/'
    : '/';
  const queryString = new URL(c.req.url).search;
  const method = c.req.method;

  const auth = await tryAuthenticate(c);

  if (auth.isKortixUser && auth.accountId) {
    return handleKortixProxy(c, service, subPath, queryString, method, auth.accountId);
  } else {
    return handlePassthrough(c, service, subPath, queryString, method);
  }
}

// === Kortix User: match allowed route, inject our key, bill with route-specific pricing ===

async function handleKortixProxy(
  c: any,
  service: ProxyServiceConfig,
  subPath: string,
  queryString: string,
  method: string,
  accountId: string
) {
  const matchedRoute = matchAllowedRoute(method, subPath, service.allowedRoutes);
  if (!matchedRoute) {
    throw new HTTPException(403, {
      message: `Route not available: ${method} ${subPath}`,
    });
  }

  const creditCheck = await checkCredits(accountId, 0.01, { skipDevCheck: true });
  if (!creditCheck.hasCredits) {
    throw new HTTPException(402, { message: creditCheck.message });
  }

  const kortixKey = service.getKortixApiKey();
  if (!kortixKey) {
    throw new HTTPException(503, {
      message: `${service.name} not configured`,
    });
  }

  const targetUrl = `${service.targetBaseUrl}${subPath}${queryString}`;
  const headers = buildForwardHeaders(c);
  let body = await getRequestBody(c, method);

  body = injectApiKey(service, headers, body);

  // Route-specific billing overrides service default
  const billingToolName = matchedRoute.billingToolName || service.billingToolName;

  console.log(`[PROXY] ${service.name} (kortix:${accountId}) ${method} ${subPath} → ${targetUrl} [bill:${billingToolName}]`);

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    // @ts-ignore
    duplex: 'half',
  });

  // Bill the user (fire-and-forget, don't block response)
  deductToolCredits(
    accountId,
    billingToolName,
    0,
    `Proxy ${service.name}: ${method} ${subPath}`,
    undefined,
    { skipDevCheck: true },
  ).catch((err) => console.error(`[PROXY] Billing error: ${err}`));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

// === Not Kortix user: pure passthrough ===

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

async function tryAuthenticate(c: any): Promise<{ isKortixUser: boolean; accountId?: string }> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { isKortixUser: false };
  }

  const token = authHeader.slice(7);
  if (!token) return { isKortixUser: false };

  if (token.startsWith('sk_') && config.DATABASE_URL) {
    try {
      const result = await validateSecretKey(token);
      if (result.isValid && result.accountId) {
        return { isKortixUser: true, accountId: result.accountId };
      }
    } catch {
      // Not valid → passthrough
    }
  }

  if (token.startsWith('sbt_') && config.DATABASE_URL) {
    try {
      const result = await validateSandboxToken(token);
      if (result.isValid && result.accountId) {
        return { isKortixUser: true, accountId: result.accountId };
      }
    } catch {
      // Not valid → passthrough
    }
  }

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
