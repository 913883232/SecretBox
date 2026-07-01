import { getStore } from "@edgeone/pages-blob";

/**
 * EdgeOne Pages Blob adapter used by the EdgeOne Pages Function backend.
 *
 * Mirrors the small kv-like interface expected by edgeone/lib/router.js:
 *   get(key) -> json | null
 *   put(key, value)
 *   del(key)
 *   list(prefix) -> string[]
 *
 * getStore() is called lazily so the module can be imported in environments
 * where Pages Blob is not configured (e.g. during local/next build).
 */
let blobStore;
function getBlobStore() {
  if (!blobStore) {
    blobStore = getStore({ name: "secret-box", consistency: "strong" });
  }
  return blobStore;
}

export const store = {
  async get(key) {
    return (await getBlobStore().get(key, { type: "json", consistency: "strong" })) ?? null;
  },
  async put(key, value) {
    await getBlobStore().setJSON(key, value);
  },
  async del(key) {
    await getBlobStore().delete(key);
  },
  async list(prefix) {
    const { blobs } = await getBlobStore().list({ prefix, consistency: "strong" });
    return blobs.map((b) => b.key);
  },
};
