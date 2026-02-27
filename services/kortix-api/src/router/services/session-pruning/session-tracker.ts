/**
 * Session Pruning — Per-Session TTL Tracker
 *
 * Tracks when each session last had its Anthropic prompt cache "touched"
 * (either the first request, or the last time pruning ran). Includes
 * periodic cleanup to prevent memory leaks from abandoned sessions.
 */

interface SessionEntry {
  lastTouchAt: number;
}

class SessionTracker {
  private sessions = new Map<string, SessionEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly maxAge: number;

  constructor(maxAgeMs: number = 2 * 60 * 60 * 1000) {
    this.maxAge = maxAgeMs;
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    if (
      this.cleanupInterval &&
      typeof this.cleanupInterval === 'object' &&
      'unref' in this.cleanupInterval
    ) {
      (this.cleanupInterval as NodeJS.Timeout).unref();
    }
  }

  /** Get the last touch timestamp, or null if never seen. */
  getLastTouch(sessionId: string): number | null {
    return this.sessions.get(sessionId)?.lastTouchAt ?? null;
  }

  /** Record a touch (resets the TTL clock). */
  touch(sessionId: string): void {
    this.sessions.set(sessionId, { lastTouchAt: Date.now() });
  }

  /**
   * Check whether the TTL has expired.
   * Returns false for sessions never seen (first request = no prune).
   */
  isExpired(sessionId: string, ttlMs: number): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    return Date.now() - entry.lastTouchAt >= ttlMs;
  }

  /** Create an entry if one doesn't exist yet (first-seen touch). */
  ensureTracked(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      this.touch(sessionId);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, entry] of this.sessions) {
      if (now - entry.lastTouchAt > this.maxAge) {
        this.sessions.delete(id);
      }
    }
  }

  /** For testing: clear all sessions and stop cleanup. */
  destroy(): void {
    this.sessions.clear();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  get size(): number {
    return this.sessions.size;
  }
}

export const sessionTracker = new SessionTracker();
export { SessionTracker };
