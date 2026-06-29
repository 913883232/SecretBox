import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "./types";

/**
 * Default store used for local development and the test sandbox.
 *
 * Persists every key/value as JSON in a single file on disk. No external
 * database, no network — `npm run dev` "just works" out of the box and data
 * survives restarts. Suitable for a personal single-user-ish workload; for
 * EdgeOne production the EdgeOneKVStore takes over.
 */

const DATA_DIR = join(process.cwd(), ".local-data");
const DATA_FILE = join(DATA_DIR, "store.json");

type Bucket = Record<string, unknown>;

let cache: Bucket | null = null;

function load(): Bucket {
  if (cache) return cache;
  try {
    if (existsSync(DATA_FILE)) {
      cache = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Bucket;
    } else {
      cache = {};
    }
  } catch {
    cache = {};
  }
  return cache!;
}

function persist() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
}

export const LocalFileStore: Store = {
  async get<T>(key: string) {
    const bucket = load();
    return (bucket[key] ?? null) as T | null;
  },
  async put(key: string, value: unknown) {
    const bucket = load();
    bucket[key] = value;
    persist();
  },
  async delete(key: string) {
    const bucket = load();
    if (key in bucket) {
      delete bucket[key];
      persist();
    }
  },
  async listKeys(prefix: string) {
    const bucket = load();
    return Object.keys(bucket).filter((k) => k.startsWith(prefix));
  },
};
