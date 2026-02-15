interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  private readonly configLimit = 60;
  private readonly userLimit = 20;
  private readonly windowMs = 60_000;

  check(configId: string, userId: string): { allowed: boolean; retryAfterMs?: number } {
    const configKey = `config:${configId}`;
    const userKey = `user:${configId}:${userId}`;

    const configResult = this.checkBucket(configKey, this.configLimit);
    if (!configResult.allowed) {
      return configResult;
    }

    const userResult = this.checkBucket(userKey, this.userLimit);
    if (!userResult.allowed) {
      return userResult;
    }

    this.consume(configKey);
    this.consume(userKey);

    return { allowed: true };
  }

  private checkBucket(key: string, limit: number): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: limit, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor((elapsed / this.windowMs) * limit);
    if (refill > 0) {
      bucket.tokens = Math.min(limit, bucket.tokens + refill);
      bucket.lastRefill = now;
    }

    if (bucket.tokens <= 0) {
      const retryAfterMs = this.windowMs - elapsed;
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }

    return { allowed: true };
  }

  private consume(key: string): void {
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.tokens--;
    }
  }

  cleanup(): void {
    const now = Date.now();
    const maxAge = this.windowMs * 2;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }
}
