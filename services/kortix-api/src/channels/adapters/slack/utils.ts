import { eq, and } from 'drizzle-orm';
import { db } from '../../../shared/db';
import { channelConfigs } from '@kortix/db';
import type { ChannelConfig } from '@kortix/db';
import { config as appConfig } from '../../../config';
import { decryptCredentials } from '../../lib/credentials';

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

export async function findConfigByTeamId(teamId: string): Promise<ChannelConfig | null> {
  const configs = await db
    .select()
    .from(channelConfigs)
    .where(
      and(
        eq(channelConfigs.channelType, 'slack'),
        eq(channelConfigs.enabled, true),
      ),
    );

  for (const cfg of configs) {
    const creds = await decryptCredentials(cfg.credentials as Record<string, unknown>);
    if (creds?.teamId === teamId) {
      // Attach decrypted credentials so callers don't need to decrypt again
      cfg.credentials = creds;
      return cfg;
    }
  }

  return null;
}

export async function verifySlackRequest(
  rawBody: string,
  headers: { timestamp: string; signature: string },
): Promise<boolean> {
  const signingSecret = appConfig.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(headers.timestamp)) > 300) {
    return false;
  }

  return verifySlackSignature(signingSecret, headers.timestamp, rawBody, headers.signature);
}
