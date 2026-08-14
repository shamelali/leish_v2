"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Role, User } from "./types";

const STORAGE_KEY = "leish-demo-user";

/**
 * Minimal external store backed by localStorage so auth survives page reloads
 * without triggering setState-in-effect or hydration mismatches.
 */
let cachedUser: User | null = null;
let cacheReady = false;
const listeners = new Set<() => void>();

function readUser(): User | null {
  if (typeof window === "undefined") return null;
  if (!cacheReady) {
    cacheReady = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      cachedUser = raw ? (JSON.parse(raw) as User) : null;
    } catch {
      cachedUser = null;
    }
  }
  return cachedUser;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => {
    cacheReady = false;
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function persist(user: User | null) {
  cachedUser = user;
  cacheReady = true;
  try {
    if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage may be unavailable; in-memory session still works
  }
  emit();
}

interface AuthContextValue {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(subscribe, readUser, () => null);

  const login = useCallback((next: User) => persist(next), []);
  const logout = useCallback(() => persist(null), []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const ROLE_LABELS: Record<Role, string> = {
  customer: "Client",
  artist: "Artist",
  studio: "Studio",
};
