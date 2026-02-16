import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { config } from '../config';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomAlphanumeric(length: number): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARS[bytes[i]! % CHARS.length];
  }
  return result;
}

/**
 * Generate a public/secret key pair.
 * Public key: pk_<32 chars>  (safe to store/display)
 * Secret key: sk_<32 chars>  (shown once, only hash stored)
 */
export function generateApiKeyPair(): { publicKey: string; secretKey: string } {
  return {
    publicKey: `pk_${randomAlphanumeric(32)}`,
    secretKey: `sk_${randomAlphanumeric(32)}`,
  };
}

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
