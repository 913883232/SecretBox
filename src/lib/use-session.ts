"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { UserPublic } from "./types";

/**
 * Client-side session hook. Used by SPA pages to gate access without any
 * server-side rendering dependency.
 */
export function useSession() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get<{ user: UserPublic | null }>("/api/auth/me")
      .then((d) => {
        if (active) setUser(d.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { user, loading, setUser };
}
