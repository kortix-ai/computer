import { createHmac, timingSafeEqual } from 'crypto';

const SIGNING_KEY_CONTEXT = 'kortix-tunnel-signing-v1';

export function deriveSigningKey(token: string): string {
  return createHmac('sha256', SIGNING_KEY_CONTEXT)
    .update(token)
    .digest('hex');
}

export function signMessage(signingKey: string, payload: string, nonce: number): string {
  return createHmac('sha256', signingKey)
    .update(`${nonce}:${payload}`)
    .digest('hex');
}

export function verifyMessageSignature(
  signingKey: string,
  payload: string,
  nonce: number,
  signature: string,
): boolean {
  try {
    const expected = signMessage(signingKey, payload, nonce);
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
