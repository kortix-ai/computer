import { describe, expect, test } from 'bun:test';

import {
  rewriteLocalhostUrl,
  parseSubdomainUrl,
  isPreviewUrl,
  isAppRouteUrl,
  type SubdomainUrlOptions,
} from './sandbox-url';

// ── Unit tests for rewriteLocalhostUrl ──────────────────────────────────────

describe('rewriteLocalhostUrl', () => {
  const localOpts: SubdomainUrlOptions = {
    sandboxId: 'kortix-sandbox',
    backendPort: 8008,
  };

  const vpsOpts: SubdomainUrlOptions = {
    sandboxId: 'kortix-sandbox',
    backendPort: 443,
    apiBaseUrl: 'https://e2e-test.kortix.cloud/v1',
  };

  test('no opts → plain localhost URL', () => {
    expect(rewriteLocalhostUrl(3210, '/viewer.html', '', undefined))
      .toBe('http://localhost:3210/viewer.html');
  });

  test('local opts without apiBaseUrl → subdomain URL', () => {
    // When no apiBaseUrl is set, always uses subdomain (local dev mode)
    expect(rewriteLocalhostUrl(3210, '/viewer.html', '', localOpts))
      .toBe('http://p3210-kortix-sandbox.localhost:8008/viewer.html');
  });

  test('VPS opts with apiBaseUrl → path-based proxy URL (non-localhost browser)', () => {
    // In test environment, window is undefined → isBrowserOnLocalhost() returns false
    // → path-based proxy is used when apiBaseUrl is set
    expect(rewriteLocalhostUrl(6080, '/', '', vpsOpts))
      .toBe('https://e2e-test.kortix.cloud/v1/p/kortix-sandbox/6080/');
  });

  test('VPS opts for desktop port 6080', () => {
    expect(rewriteLocalhostUrl(6080, '/', '', vpsOpts))
      .toBe('https://e2e-test.kortix.cloud/v1/p/kortix-sandbox/6080/');
  });

  test('VPS opts with path', () => {
    expect(rewriteLocalhostUrl(3210, '/api/docs', '', vpsOpts))
      .toBe('https://e2e-test.kortix.cloud/v1/p/kortix-sandbox/3210/api/docs');
  });

  test('VPS opts strips trailing slash from apiBaseUrl', () => {
    const opts: SubdomainUrlOptions = {
      ...vpsOpts,
      apiBaseUrl: 'https://example.com/v1/',
    };
    expect(rewriteLocalhostUrl(8080, '/', '', opts))
      .toBe('https://example.com/v1/p/kortix-sandbox/8080/');
  });

  test('normalizes empty path to /', () => {
    expect(rewriteLocalhostUrl(3000, '', '', localOpts))
      .toBe('http://p3000-kortix-sandbox.localhost:8008/');
  });
});

// ── Unit tests for parseSubdomainUrl ────────────────────────────────────────

describe('parseSubdomainUrl', () => {
  test('parses subdomain format', () => {
    const result = parseSubdomainUrl('http://p3210-kortix-sandbox.localhost:8008/viewer.html');
    expect(result).toEqual({
      port: 3210,
      sandboxId: 'kortix-sandbox',
      backendPort: 8008,
      path: '/viewer.html',
    });
  });

  test('parses path-based proxy format', () => {
    const result = parseSubdomainUrl('https://e2e-test.kortix.cloud/v1/p/kortix-sandbox/6080/');
    expect(result).toEqual({
      port: 6080,
      sandboxId: 'kortix-sandbox',
      backendPort: 443,
      path: '/',
    });
  });

  test('parses path-based proxy with deep path', () => {
    const result = parseSubdomainUrl('https://my-server.com/v1/p/my-sandbox/3210/api/docs');
    expect(result).toEqual({
      port: 3210,
      sandboxId: 'my-sandbox',
      backendPort: 443,
      path: '/api/docs',
    });
  });

  test('returns null for non-proxy URL', () => {
    expect(parseSubdomainUrl('https://google.com')).toBeNull();
  });

  test('returns null for plain localhost', () => {
    expect(parseSubdomainUrl('http://localhost:3000/')).toBeNull();
  });
});

// ── Unit tests for isPreviewUrl ─────────────────────────────────────────────

describe('isPreviewUrl', () => {
  test('detects subdomain preview URL', () => {
    expect(isPreviewUrl('http://p3210-kortix-sandbox.localhost:8008/')).toBe(true);
  });

  test('detects path-based preview URL', () => {
    expect(isPreviewUrl('https://e2e-test.kortix.cloud/v1/p/kortix-sandbox/6080/')).toBe(true);
  });

  test('rejects plain localhost URL', () => {
    expect(isPreviewUrl('http://localhost:3000/')).toBe(false);
  });

  test('rejects external URL', () => {
    expect(isPreviewUrl('https://google.com')).toBe(false);
  });
});

// ── Unit tests for isAppRouteUrl ────────────────────────────────────────────

describe('isAppRouteUrl', () => {
  test('detects integrations route', () => {
    expect(isAppRouteUrl('http://localhost:3000/integrations?connect=true')).toBe(true);
  });

  test('detects settings route', () => {
    expect(isAppRouteUrl('http://localhost:3000/settings')).toBe(true);
  });

  test('detects /p route prefix', () => {
    expect(isAppRouteUrl('http://localhost:3000/p/browser')).toBe(true);
  });

  test('rejects external URL', () => {
    expect(isAppRouteUrl('https://google.com/settings')).toBe(false);
  });

  test('rejects sandbox service URL', () => {
    expect(isAppRouteUrl('http://localhost:8080/api')).toBe(false);
  });
});
