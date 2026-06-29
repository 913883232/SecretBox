/**
 * Platform-agnostic storage interface.
 *
 * The whole data layer talks to this interface only, so the same business
 * logic runs on:
 *   - a local developer machine  -> LocalFileStore (JSON on disk, no DB)
 *   - Tencent EdgeOne production -> EdgeOneKVStore (EdgeOne Pages KV binding)
 *
 * It mirrors EdgeOne KV's primitives (get / put / delete / list-by-prefix),
 * which keeps the EdgeOne adapter trivial.
 */
export interface Store {
  get<T = unknown>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Return all keys that start with `prefix`. */
  listKeys(prefix: string): Promise<string[]>;
}

/**
 * Shape of an EdgeOne Pages KV namespace binding. Both the Edge (V8) and
 * Node runtimes expose the same four methods.
 */
export interface KVNamespaceLike {
  get(key: string, opts?: { type: "json" } | "json"): Promise<unknown>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    opts?: Record<string, unknown>
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: { name: string; metadata?: unknown }[];
    complete: boolean;
    cursor?: string;
  }>;
}
