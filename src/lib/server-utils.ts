import "server-only";
import { getSessionUser, type SessionUser } from "./session";

/** Returns the authenticated user from the session cookie, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

/**
 * CSRF protection: browsers will not send custom headers on cross-site
 * "simple" requests, so requiring our custom header on mutations blocks
 * CSRF for cookie-authenticated endpoints.
 */
export function isCsrfOk(request: Request): boolean {
  return request.headers.get("x-csrf") === "1";
}

/** Parse a JSON request body with a fallback to null. */
export async function readJson<T = unknown>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function unauthorized(): Response {
  return Response.json({ error: "未登录或会话已过期" }, { status: 401 });
}
