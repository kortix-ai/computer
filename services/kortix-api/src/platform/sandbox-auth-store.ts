/**
 * SandboxAuthTokenStore — manages the sandbox access key for proxy auth.
 *
 * The access key (sak_...) is the user-facing token for accessing the sandbox
 * through the proxy. Generated on demand, shown to the user once, persisted
 * to a JSON file so it survives API restarts.
 *
 * Resolution order:
 *   1. kortix-api's own SANDBOX_AUTH_TOKEN env var (manual/VPS setup)
 *   2. Manually set token (from generate-token endpoint, persisted to file)
 *   3. Neither set → no auth, open access
 *
 * Key design: tokens are stored in-memory + on disk. NO container restart
 * needed when generating a token — the proxy middleware just checks this store.
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { config } from '../config';

/** File where the generated token is persisted across API restarts. */
const TOKEN_FILE = resolve(process.cwd(), '.sandbox-auth-token.json');

interface TokenData {
  accessKey: string;
  createdAt: string;
}

class SandboxAuthTokenStore {
  private token: string | null = null;
  private loaded = false;

  /**
   * Set a new access key (called by generate-token endpoint).
   * Stores in memory and persists to disk. Instant — no container restart.
   */
  setAccessKey(accessKey: string): void {
    this.token = accessKey;
    this.loaded = true;
    this.persist(accessKey);
    console.log('[SANDBOX-AUTH-STORE] Token set and persisted');
  }

  /**
   * Get the access key. Returns empty string if no auth is configured.
   */
  getAccessKey(): string {
    // Priority 1: kortix-api's own env var (manual/VPS setup)
    if (config.SANDBOX_AUTH_TOKEN) {
      return config.SANDBOX_AUTH_TOKEN;
    }

    // Priority 2: manually set / persisted token
    if (!this.loaded) {
      this.loadFromDisk();
    }
    return this.token || '';
  }

  /**
   * Get the service key (kortix-api → sandbox).
   */
  getServiceKey(): string {
    return config.INTERNAL_SERVICE_KEY;
  }

  /**
   * Check if sandbox auth is enabled.
   */
  hasAuth(): boolean {
    return !!this.getAccessKey();
  }

  /**
   * Clear the token (e.g. when sandbox is removed).
   */
  clear(): void {
    this.token = null;
    this.loaded = true;
    try {
      unlinkSync(TOKEN_FILE);
    } catch {
      // File may not exist
    }
    console.log('[SANDBOX-AUTH-STORE] Token cleared');
  }

  /**
   * Invalidate in-memory state — forces re-read from disk on next access.
   */
  invalidate(): void {
    this.loaded = false;
    this.token = null;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private loadFromDisk(): void {
    this.loaded = true;
    try {
      const raw = readFileSync(TOKEN_FILE, 'utf-8');
      const data: TokenData = JSON.parse(raw);
      if (data.accessKey) {
        this.token = data.accessKey;
      }
    } catch {
      // File doesn't exist or is invalid — no token configured
      this.token = null;
    }
  }

  private persist(accessKey: string): void {
    try {
      mkdirSync(dirname(TOKEN_FILE), { recursive: true });
      const data: TokenData = {
        accessKey,
        createdAt: new Date().toISOString(),
      };
      writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SANDBOX-AUTH-STORE] Failed to persist token:', err);
    }
  }
}

/** Singleton instance — used by auth middleware and proxy routes. */
export const sandboxAuthStore = new SandboxAuthTokenStore();
