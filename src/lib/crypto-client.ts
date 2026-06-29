/**
 * Client-side cryptography using the browser's built-in Web Crypto API.
 * Zero external dependencies. Everything here runs only in the browser.
 *
 * Design:
 *  - A random per-user "master key" (AES-GCM 256) encrypts note content.
 *  - That master key is wrapped (encrypted) by a KEK derived from the user's
 *    password via PBKDF2. The server only ever sees the wrapped form.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const PBKDF2_ITERATIONS = 200_000;

function bytesToB64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  // Allocate an explicit ArrayBuffer so the result is assignable to
  // Web Crypto's BufferSource (avoids the ArrayBufferLike mismatch).
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomSaltB64(byteLength = 16): string {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** Derive a key-encryption key (KEK) from password + salt. */
export async function deriveKek(password: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBytes(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"]
  );
}

/** Generate a fresh random master content key. */
export function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/** Wrap the master key with the KEK -> base64(iv(12) + ciphertext). */
export async function wrapMasterKey(master: CryptoKey, kek: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("raw", master, kek, {
    name: "AES-GCM",
    iv,
  });
  const combined = new Uint8Array(iv.length + wrapped.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(wrapped), iv.length);
  return bytesToB64(combined);
}

/** Unwrap the master key from base64(iv(12) + ciphertext) using the KEK. */
export async function unwrapMasterKey(wrappedB64: string, kek: CryptoKey): Promise<CryptoKey> {
  const data = b64ToBytes(wrappedB64);
  const iv = data.slice(0, 12);
  const wrapped = data.slice(12);
  return crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    kek,
    { name: "AES-GCM", iv },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt a string -> base64(iv(12) + ciphertext). */
export async function encryptString(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  return bytesToB64(combined);
}

/** Decrypt base64(iv(12) + ciphertext) -> string. */
export async function decryptString(payloadB64: string, key: CryptoKey): Promise<string> {
  const data = b64ToBytes(payloadB64);
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return decoder.decode(pt);
}

/** Export/import a raw key to/from base64 (used to persist in sessionStorage). */
export async function exportKeyB64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bytesToB64(raw);
}

export async function importKeyB64(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    b64ToBytes(b64),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
