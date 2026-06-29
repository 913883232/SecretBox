"use client";

/**
 * Thin fetch wrapper for the browser. Always sends the custom CSRF header
 * (which the server requires on mutations) and same-origin credentials.
 */

const CSRF_HEADER = "x-csrf";

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      [CSRF_HEADER]: "1",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  del: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};
