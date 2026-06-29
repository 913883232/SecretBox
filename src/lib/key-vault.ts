"use client";

import { exportKeyB64, importKeyB64 } from "./crypto-client";

/**
 * Holds the decrypted master key in memory for the current tab/session.
 * It is optionally mirrored to sessionStorage so a page reload doesn't
 * force a re-unlock. sessionStorage is scoped to the tab and cleared when
 * the tab closes. The server never receives this key.
 */

const STORAGE_KEY = "mn_master_key_v1";
let cached: CryptoKey | null = null;

export function getMasterKey(): CryptoKey | null {
  return cached;
}

export function isUnlocked(): boolean {
  return cached !== null;
}

export async function setMasterKey(key: CryptoKey | null): Promise<void> {
  cached = key;
  if (key) {
    sessionStorage.setItem(STORAGE_KEY, await exportKeyB64(key));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

/** Try to restore the key from sessionStorage. Returns true if unlocked. */
export async function loadMasterKey(): Promise<boolean> {
  if (cached) return true;
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (!stored) return false;
  try {
    cached = await importKeyB64(stored);
    return true;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

export function lockVault(): void {
  cached = null;
  sessionStorage.removeItem(STORAGE_KEY);
}
