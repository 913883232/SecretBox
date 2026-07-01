import "server-only";
import type { Store } from "./types";

/**
 * Production store backed by Tencent EdgeOne Pages Blob.
 *
 * Unlike the KV adapter, Blob is auto-provisioned by store name inside Pages
 * Functions — no manual namespace/binding step in the EdgeOne console.
 * Strong consistency is used for reads so register/login see fresh data.
 *
 * Uses dynamic import so @edgeone/pages-blob is never bundled during
 * 
ext build / static export. The SDK only loads when this store is
 * actually used at runtime inside an EdgeOne Pages Function.
 */

let blobStore: any = null;

async function getBlobStore() {
  if (!blobStore) {
    const { getStore } = await import("@edgeone/pages-blob");
    blobStore = getStore("secret-box");
  }
  return blobStore;
}

export const EdgeOneBlobStore: Store = {
  async get<T>(key: string) {
    return (await (await getBlobStore()).get(key, {
      type: "json",
      consistency: "strong" as const,
    })) as T | null;
  },
  async put(key: string, value: unknown) {
    await (await getBlobStore()).setJSON(key, value);
  },
  async delete(key: string) {
    await (await getBlobStore()).delete(key);
  },
  async listKeys(prefix: string) {
    const { blobs } = await (await getBlobStore()).list({
      prefix,
      consistency: "strong" as const,
    });
    return blobs.map((b: any) => b.key);
  },
};
