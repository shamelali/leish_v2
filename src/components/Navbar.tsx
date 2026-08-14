"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";
import { Button } from "./Button";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/artists", label: "Artists" },
  { href: "/studios", label: "Studios" },
  { href: "/onboarding", label: "Join as Artist" },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-white/85 backdrop-blur dark:border-stone-800/70 dark:bg-stone-950/85">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {theme === "dark" ? (
              /* Sun — switch to light */
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <circle cx="12" cy="12" r="4" />
                <path strokeLinecap="round" d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              /* Moon — switch to dark */
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z" />
              </svg>
            )}
          </button>

          {user ? (
            <>
              <span className="hidden text-sm text-stone-500 lg:inline dark:text-stone-400">
                {ROLE_LABELS[user.role]} · {user.name}
              </span>
              <Button href="/dashboard" variant="ghost" size="sm">
                Dashboard
              </Button>
              <Button variant="outline" size="sm" onClick={logout}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button href="/login" variant="ghost" size="sm">
                Log in
              </Button>
              <Button href="/register" size="sm">
                Sign up free
              </Button>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100 md:hidden dark:text-stone-300 dark:hover:bg-stone-800"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            {open ? (
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-stone-200 bg-white px-4 py-4 md:hidden dark:border-stone-800 dark:bg-stone-950">
          <div className="flex flex-col gap-1">
            <button
              onClick={() => {
                toggle();
              }}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <circle cx="12" cy="12" r="4" />
                  <path strokeLinecap="round" d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z" />
                </svg>
              )}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-xl px-4 py-3 text-sm font-medium",
                  pathname === link.href
                    ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
                    : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800",
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
              {user ? (
                <>
                  <Button href="/dashboard" variant="outline" size="sm" className="flex-1">
                    Dashboard
                  </Button>
                  <Button variant="primary" size="sm" className="flex-1" onClick={logout}>
                    Log out
                  </Button>
                </>
              ) : (
                <>
                  <Button href="/login" variant="outline" size="sm" className="flex-1">
                    Log in
                  </Button>
                  <Button href="/register" size="sm" className="flex-1">
                    Sign up
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
