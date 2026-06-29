import "server-only";
import { LocalFileStore } from "./local";
import { EdgeOneKVStore, hasKVBinding } from "./edgeone";
import type { Store } from "./types";

/**
 * Selects the active store:
 *   STORAGE_DRIVER=edgeone  + an EdgeOne KV binding present  -> EdgeOne KV
 *   otherwise                                              -> local files
 *
 * The local store is the default so the app runs anywhere with zero setup.
 */
function resolveStore(): Store {
  const driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();
  if (driver === "edgeone" && hasKVBinding()) {
    return EdgeOneKVStore;
  }
  // EdgeOne was requested but the binding isn't wired yet — fall back to the
  // local store so the app still boots instead of crashing.
  return LocalFileStore;
}

export const store: Store = resolveStore();
export type { Store } from "./types";
export { setKVBinding } from "./edgeone";
