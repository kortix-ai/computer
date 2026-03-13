import { config as appConfig } from '../../../config';
import { getSlackPlatformCredentials } from '../../lib/platform-credentials';

export async function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const basestring = `v0:${timestamp}:${body}`;
  const key = new TextEncoder().encode(signingSecret);
  const message = new TextEncoder().encode(basestring);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, message);
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const expected = `v0=${hex}`;

  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifySlackRequest(
  rawBody: string,
  headers: { timestamp: string; signature: string },
  accountId?: string,
): Promise<boolean> {
  let signingSecret = appConfig.SLACK_SIGNING_SECRET;

  if (!signingSecret && accountId) {
    const platformCreds = await getSlackPlatformCredentials(accountId);
    signingSecret = platformCreds?.signingSecret || '';
  }

  if (!signingSecret) return true;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(headers.timestamp)) > 300) {
    return false;
  }

  return verifySlackSignature(signingSecret, headers.timestamp, rawBody, headers.signature);
}
