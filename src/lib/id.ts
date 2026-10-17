const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short random id for entities inside a plan (not a security token). */
export function uid(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** 192-bit hex token, used by the local backend to mirror the server's tokens. */
export function secureToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
