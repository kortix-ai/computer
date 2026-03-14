/**
 * Slack signature verification utilities.
 *
 * Note: In the sandbox-first architecture, signature verification is done by
 * opencode-channels inside the sandbox (via @chat-adapter/slack). kortix-api
 * no longer verifies signatures — it's a pure proxy.
 *
 * These utils are kept for potential future use or direct verification scenarios.
 */

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
