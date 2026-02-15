import { config } from '../../config';

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;
const TAG_LENGTH = 128;
const ENCRYPTED_PREFIX = 'enc:';

let _cryptoKey: CryptoKey | null = null;

async function getCryptoKey(): Promise<CryptoKey | null> {
  const keyHex = config.CHANNELS_CREDENTIAL_KEY;
  if (!keyHex) return null;

  if (!_cryptoKey) {
    const keyBytes = hexToBytes(keyHex);
    if (keyBytes.length !== 32) {
      console.error('[CREDENTIALS] CHANNELS_CREDENTIAL_KEY must be 64 hex chars (32 bytes). Credentials will NOT be encrypted.');
      return null;
    }
    _cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: ALGORITHM },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  return _cryptoKey;
}

export async function encryptCredentials(
  credentials: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const key = await getCryptoKey();
  if (!key) return credentials;

  const plaintext = JSON.stringify(credentials);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    new TextEncoder().encode(plaintext),
  );

  const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.length);

  const encoded = ENCRYPTED_PREFIX + bytesToBase64(combined);

  return { _encrypted: encoded };
}

export async function decryptCredentials(
  credentials: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const encrypted = credentials._encrypted as string | undefined;

  if (!encrypted || typeof encrypted !== 'string' || !encrypted.startsWith(ENCRYPTED_PREFIX)) {
    return credentials;
  }

  const key = await getCryptoKey();
  if (!key) {
    console.error('[CREDENTIALS] Cannot decrypt: CHANNELS_CREDENTIAL_KEY not set but encrypted credentials found.');
    return credentials;
  }

  const combined = base64ToBytes(encrypted.slice(ENCRYPTED_PREFIX.length));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    ciphertext,
  );

  return JSON.parse(new TextDecoder().decode(plainBuffer));
}

export function isCredentialEncryptionEnabled(): boolean {
  return !!config.CHANNELS_CREDENTIAL_KEY;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
