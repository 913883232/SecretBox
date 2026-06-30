import "server-only";
import { LocalFileStore } from "./local";
import { EdgeOneKVStore, hasKVBinding } from "./edgeone";
import { EdgeOneBlobStore } from "./edgeone-blob";
import type { Store } from "./types";

/**
 * Selects the active store:
 *   STORAGE_DRIVER=edgeone-blob + inside EdgeOne Pages Function  -> EdgeOne Blob
 *   STORAGE_DRIVER=edgeone      + an EdgeOne KV binding present  -> EdgeOne KV
 *   STORAGE_DRIVER=edgeone      + no KV binding                  -> EdgeOne Blob
 *   otherwise                                                    -> local files
 *
 * The local store is the default so the app runs anywhere with zero setup.
 * When the EdgeOne driver is requested without a KV binding, Blob is used
 * automatically so the project works on EdgeOne Pages without manual KV setup.
 */
function resolveStore(): Store {
  const driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();

  if (driver === "edgeone-blob") {
    return EdgeOneBlobStore;
  }

  if (driver === "edgeone") {
    return hasKVBinding() ? EdgeOneKVStore : EdgeOneBlobStore;
  }

  return LocalFileStore;
}

export const store: Store = resolveStore();
export type { Store } from "./types";
export { setKVBinding } from "./edgeone";
