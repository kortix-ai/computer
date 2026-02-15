import { describe, it, expect } from 'bun:test';
import {
  createPermissionRequest,
  replyPermissionRequest,
  isPermissionPending,
  pendingCount,
} from '../channels/core/pending-permissions';

describe('Pending Permissions Store', () => {
  it('creates a pending request and resolves it', async () => {
    const promise = createPermissionRequest('test-1');
    expect(isPermissionPending('test-1')).toBe(true);
    expect(pendingCount()).toBeGreaterThanOrEqual(1);

    const found = replyPermissionRequest('test-1', true);
    expect(found).toBe(true);
    expect(isPermissionPending('test-1')).toBe(false);

    const result = await promise;
    expect(result).toBe(true);
  });

  it('rejects a pending request', async () => {
    const promise = createPermissionRequest('test-2');

    replyPermissionRequest('test-2', false);

    const result = await promise;
    expect(result).toBe(false);
  });

  it('returns false when replying to unknown request', () => {
    const found = replyPermissionRequest('nonexistent', true);
    expect(found).toBe(false);
  });

  it('replaces existing request with same ID', async () => {
    const first = createPermissionRequest('test-dup');
    const second = createPermissionRequest('test-dup');

    // First promise should resolve as false (replaced)
    const firstResult = await first;
    expect(firstResult).toBe(false);

    // Second is still pending
    expect(isPermissionPending('test-dup')).toBe(true);
    replyPermissionRequest('test-dup', true);

    const secondResult = await second;
    expect(secondResult).toBe(true);
  });
});
