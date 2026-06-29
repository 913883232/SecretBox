import "server-only";
import type { Store, KVNamespaceLike } from "./types";

/**
 * Production store backed by Tencent EdgeOne Pages KV.
 *
 * EdgeOne injects a KV namespace binding (the variable name you chose when
 * binding the namespace to your project, e.g. `DB`) into the request context.
 * Wire it into the store once via `setKVBinding(...)` — typically from the
 * EdgeOne Pages Function entry that bootstraps the runtime, or from an
 * `instrumentation.ts` hook if you host the Next.js app on EdgeOne Node
 * Functions. See README → "部署到 EdgeOne".
 */

let binding: KVNamespaceLike | null = null;

export function setKVBinding(kv: KVNamespaceLike): void {
  binding = kv;
}

export function hasKVBinding(): boolean {
  return binding !== null;
}

export const EdgeOneKVStore: Store = {
  async get<T>(key: string) {
    if (!binding) throw new Error("EdgeOne KV binding not configured");
    return (await binding.get(key, { type: "json" })) as T | null;
  },
  async put(key: string, value: unknown) {
    if (!binding) throw new Error("EdgeOne KV binding not configured");
    await binding.put(key, JSON.stringify(value));
  },
  async delete(key: string) {
    if (!binding) throw new Error("EdgeOne KV binding not configured");
    await binding.delete(key);
  },
  async listKeys(prefix: string) {
    if (!binding) throw new Error("EdgeOne KV binding not configured");
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await binding.list({ prefix, limit: 256, cursor });
      for (const k of res.keys) names.push(k.name);
      cursor = res.complete ? undefined : res.cursor;
    } while (cursor);
    return names;
  },
};
