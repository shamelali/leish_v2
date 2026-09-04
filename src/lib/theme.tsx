"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark";

const COOKIE_NAME = "leish-theme";

function readThemeFromStorage(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const match = document.cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    if (match) return match[1] === "light" ? "light" : "dark";
    // Fallback to localStorage for backward compatibility
    const saved = window.localStorage.getItem(COOKIE_NAME);
    if (saved) return saved === "light" ? "light" : "dark";
  } catch {
    // ignore
  }
  return "dark";
}

function applyTheme(theme: Theme) {
  if (typeof window !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}

function setCookie(theme: Theme) {
  if (typeof window !== "undefined") {
    document.cookie = `${COOKIE_NAME}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  listeners.forEach((listener) => listener());
}

function setThemeInStorage(theme: Theme) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(COOKIE_NAME, theme);
    } catch {
      // ignore
    }
    setCookie(theme);
    applyTheme(theme);
  }
  emit();
}

function getServerSnapshot(initialTheme: Theme): Theme {
  return initialTheme;
}

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialTheme = "dark",
}: {
  children: ReactNode;
  initialTheme?: Theme;
}) {
  const theme = useSyncExternalStore(subscribe, readThemeFromStorage, () =>
    getServerSnapshot(initialTheme),
  );

  const setTheme = useCallback((next: Theme) => {
    setThemeInStorage(next);
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
