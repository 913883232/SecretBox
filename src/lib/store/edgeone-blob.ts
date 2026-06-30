import "server-only";
import { getStore } from "@edgeone/pages-blob";
import type { Store } from "./types";

let blobStore: ReturnType<typeof getStore> | null = null;

function getBlobStore() {
  if (!blobStore) {
    blobStore = getStore({ name: "secret-box", consistency: "strong" } as any);
  }
  return blobStore;
}

export const EdgeOneBlobStore: Store = {
  async get<T>(key: string) {
    return (await getBlobStore().get(key, {
      type: "json",
      consistency: "strong",
    })) as T | null;
  },
  async put(key: string, value: unknown) {
    await getBlobStore().setJSON(key, value);
  },
  async delete(key: string) {
    await getBlobStore().delete(key);
  },
  async listKeys(prefix: string) {
    const { blobs } = await getBlobStore().list({
      prefix,
      consistency: "strong",
    });
    return blobs.map((b) => b.key);
  },
};
