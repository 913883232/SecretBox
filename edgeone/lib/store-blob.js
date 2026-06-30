import { getStore } from "@edgeone/pages-blob";

const blobStore = getStore({ name: "secret-box", consistency: "strong" });

/**
 * EdgeOne Pages Blob adapter used by the EdgeOne Pages Function backend.
 *
 * Mirrors the small kv-like interface expected by edgeone/lib/router.js:
 *   get(key) -> json | null
 *   put(key, value)
 *   del(key)
 *   list(prefix) -> string[]
 */
export const store = {
  async get(key) {
    return (await blobStore.get(key, { type: "json", consistency: "strong" })) ?? null;
  },
  async put(key, value) {
    await blobStore.setJSON(key, value);
  },
  async del(key) {
    await blobStore.delete(key);
  },
  async list(prefix) {
    const { blobs } = await blobStore.list({ prefix, consistency: "strong" });
    return blobs.map((b) => b.key);
  },
};
