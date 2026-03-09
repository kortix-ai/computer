let counter = 0;

function toHex(n: number, pad: number): string {
  return n.toString(16).padStart(pad, '0');
}

function randomBase62(length: number): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function ascendingId(prefix: 'msg' | 'prt' | 'ses' = 'msg'): string {
  const timestamp = Date.now();
  counter++;
  return `${prefix}_${toHex(timestamp, 12)}_${toHex(counter, 4)}${randomBase62(10)}`;
}

export function sessionId(): string {
  return ascendingId('ses');
}

export function messageId(): string {
  return ascendingId('msg');
}

export function partId(): string {
  return ascendingId('prt');
}
