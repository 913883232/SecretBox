import "server-only";
import { getStore } from "@edgeone/pages-blob";
import type { Store } from "./types";

/**
 * Production store backed by Tencent EdgeOne Pages Blob.
 *
 * Unlike the KV adapter, Blob is auto-provisioned by store name inside Pages
 * Functions — no manual namespace/binding step in the EdgeOne console.
 * Strong consistency is used for reads so register/login see fresh data.
 */
const blobStore = getStore("secret-box");

export const EdgeOneBlobStore: Store = {
  async get<T>(key: string) {
    return (await blobStore.get(key, {
      type: "json",
      consistency: "strong",
    })) as T | null;
  },
  async put(key: string, value: unknown) {
    await blobStore.setJSON(key, value);
  },
  async delete(key: string) {
    await blobStore.delete(key);
  },
  async listKeys(prefix: string) {
    const { blobs } = await blobStore.list({
      prefix,
      consistency: "strong",
    });
    return blobs.map((b) => b.key);
  },
};
