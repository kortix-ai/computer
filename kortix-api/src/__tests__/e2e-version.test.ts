/**
 * E2E tests for the version endpoint.
 *
 * GET /v1/platform/sandbox/version returns the version from release.json.
 */
import { describe, it, expect } from 'bun:test';
import { createTestApp, jsonGet } from './helpers';
import { releaseManifest } from '../release';

const app = createTestApp({ mountPlatform: false });

describe('Version endpoint', () => {
  it('GET /v1/platform/sandbox/version returns 200 with version string', async () => {
    const res = await jsonGet(app, '/v1/platform/sandbox/version');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.version).toBeDefined();
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);

    expect(body.version).toBe(releaseManifest.version);
  });

  it('GET /v1/platform/sandbox/version respects SANDBOX_VERSION env override', async () => {
    const original = process.env.SANDBOX_VERSION;
    try {
      process.env.SANDBOX_VERSION = '99.88.77';

      const res = await jsonGet(app, '/v1/platform/sandbox/version');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.version).toBe('99.88.77');
    } finally {
      if (original !== undefined) {
        process.env.SANDBOX_VERSION = original;
      } else {
        delete process.env.SANDBOX_VERSION;
      }
    }
  });
});
