import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

export function hashSecretKey(secretKey: string): string {
  const secret = config.API_KEY_SECRET;
  if (!secret) {
    throw new Error('API_KEY_SECRET not configured');
  }

  return createHmac('sha256', secret)
    .update(secretKey)
    .digest('hex');
}

export function verifySecretKey(secretKey: string, storedHash: string): boolean {
  try {
    const computedHash = hashSecretKey(secretKey);

    const storedBuffer = Buffer.from(storedHash, 'hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');

    if (storedBuffer.length !== computedBuffer.length) {
      return false;
    }

    return timingSafeEqual(storedBuffer, computedBuffer);
  } catch {
    return false;
  }
}

export function isApiKeySecretConfigured(): boolean {
  return !!config.API_KEY_SECRET;
}
