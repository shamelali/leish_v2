"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "leish-theme";

/**
 * Minimal external store for the theme, backed by localStorage.
 * Dark is the default so the app opens in dark mode; the inline script in
 * the layout applies the class before first paint to avoid a flash.
 */
let cachedTheme: Theme = "dark";
let cacheReady = false;
const listeners = new Set<() => void>();

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  if (!cacheReady) {
    cacheReady = true;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      cachedTheme = saved === "light" ? "light" : "dark";
    } catch {
      cachedTheme = "dark";
    }
  }
  return cachedTheme;
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setTheme(theme: Theme) {
  cachedTheme = theme;
  cacheReady = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage may be unavailable; in-memory theme still works
  }
  apply(theme);
  emit();
}

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme]);
  const change = useCallback((next: Theme) => setTheme(next), []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme: change }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
