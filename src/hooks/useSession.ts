"use client";

import { useAuth } from "@/lib/auth";

/**
 * Get the current session token from the auth cookie
 * This reads the httpOnly cookie via the browser's cookie API
 */
import type { User } from "@/lib/types";

export function useSession(): { session: { token: string; user: User } | null; loading: boolean } {
  const { user, loading } = useAuth();

  // Extract token from cookie
  const getToken = (): string | null => {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(/(?:^|;\s*)leish_session=([^;]+)/);
    return match ? match[1] : null;
  };

  const token = getToken();

  return {
    session: user && token ? { token, user } : null,
    loading,
  };
}
