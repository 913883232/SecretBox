/**
 * Password hashing via Web Crypto (PBKDF2-SHA256). Works on both the Node.js
 * and Edge runtimes — no node:crypto dependency.
 *
 * Stored format: pbkdf2$<iterations>$<saltB64>$<hashB64>
 */

const DEFAULT_ITERATIONS = 200_000;
const KEY_BITS = 256;

const encoder = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64d(str: string): Uint8Array {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/** Constant-time byte comparison (no node:crypto timingSafeEqual needed). */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, DEFAULT_ITERATIONS);
  return `pbkdf2$${DEFAULT_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = b64d(parts[2]);
  const expected = b64d(parts[3]);
  if (!iterations || salt.length === 0 || expected.length === 0) return false;
  const hash = await derive(password, salt, iterations);
  return equalBytes(hash, expected);
}
