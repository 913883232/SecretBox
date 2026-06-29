import "server-only";
import { cookies } from "next/headers";

/**
 * Stateless, HMAC-signed session stored in an httpOnly cookie.
 * Uses Web Crypto (SubtleCrypto) — runs on both Node and Edge runtimes.
 *
 * Token = base64url(payload) + "." + base64url(HMAC-SHA256(payload))
 */

export const SESSION_COOKIE = "mn_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionUser = { id: string; email: string };

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET must be set (>= 16 characters) in production."
      );
    }
    return "dev-only-insecure-session-secret";
  }
  return secret;
}

let hmacKeyPromise: Promise<CryptoKey> | null = null;
function getHmacKey(): Promise<CryptoKey> {
  if (!hmacKeyPromise) {
    hmacKeyPromise = crypto.subtle.importKey(
      "raw",
      encoder.encode(getSecret()) as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
  }
  return hmacKeyPromise;
}

function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of view) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64uDecode(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sign(body: string): Promise<string> {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body) as BufferSource
  );
  return b64u(sig);
}

export async function createSession(user: SessionUser): Promise<void> {
  const now = Date.now();
  const payload = JSON.stringify({
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + MAX_AGE_SECONDS * 1000,
  });
  const body = b64u(encoder.encode(payload));
  const token = `${body}.${await sign(body)}`;
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const key = await getHmacKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    b64uDecode(sig) as BufferSource,
    encoder.encode(body) as BufferSource
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(b64uDecode(body))
    ) as { sub?: string; email?: string; exp?: number };
    if (typeof payload.exp === "number" && Date.now() > payload.exp) return null;
    if (!payload.sub || !payload.email) return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
