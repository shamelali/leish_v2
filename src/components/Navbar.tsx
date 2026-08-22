"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/artists", label: "Artists" },
  { href: "/studios", label: "Studios" },
  { href: "/onboarding", label: "Join as Artist" },
];

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="4" />
      <path
        strokeLinecap="round"
        d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
      />
    </svg>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  const linkCls = (active: boolean) =>
    cn(
      "rounded-full px-4 py-2 text-sm font-medium transition-colors",
      active ? "bg-white/20 text-white" : "text-rose-50/90 hover:bg-white/10 hover:text-white",
    );

  const ghostBtn =
    "inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-white transition-colors hover:bg-white/15";

  const solidBtn =
    "inline-flex h-9 items-center justify-center rounded-full bg-white px-4 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50";

  const outlineBtn =
    "inline-flex h-9 items-center justify-center rounded-full border border-white/40 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10";

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/20 backdrop-blur"
      style={{
        background: "linear-gradient(90deg, var(--leish-header-from), var(--leish-header-to))",
      }}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Leish! — home" className="flex items-center">
          <Image
            src="/images/logo.png"
            alt="Leish!"
            width={1430}
            height={690}
            priority
            className="h-9 w-auto sm:h-10"
          />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkCls(pathname === link.href)}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {!loading &&
            (user ? (
              <>
                <span className="hidden text-sm text-rose-50/90 lg:inline">
                  {ROLE_LABELS[user.role]} · {user.name}
                </span>
                <Link href="/dashboard" className={ghostBtn}>
                  Dashboard
                </Link>
                <button onClick={logout} className={outlineBtn}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={ghostBtn}>
                  Log in
                </Link>
                <Link href="/register" className={solidBtn}>
                  Sign up free
                </Link>
                <div className="mt-2 flex gap-2">
                  {process.env.NEON_GOOGLE_CLIENT_ID ? (
                    <a
                      href="/api/auth/login/google"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-700"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 mr-2">
                        <path d="M22.16 15.84a1 1 0 0 1-1.42 0l-7.17 7.17a1 1 0 0 1-1.42-1.42L12 16.16l-5.04-5.03a1 1 0 0 1 0-1.82l5.78-5.77a1 1 0 0 1 1.42 1.42l8.37 8.36a1 1 0 0 1-1.42z" />
                        <path d="M9.5 3.59a5.97 5.97 0 0 1 0 8.57 5.97 5.97 0 0 1-8.57 0 5.97 5.97 0 0 1 0-8.57 5.97 5.97 0 0 1 8.57z" />
                      </svg>
                      Google
                    </a>
                  ) : null}
                  {process.env.NEON_GITHUB_CLIENT_ID ? (
                    <a
                      href="/api/auth/login/github"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-700"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 mr-2">
                        <path d="M18 2h-3a5 5 0 0 0-5 5v3h5v-3a5 5 0 0 0-5-5zm-3 4h3v-3h-3v3zm2-2h2v2h-2v-2zm6.96-4.92a2.02 2.02 0 0 1-2.83 0l-1.42 1.42a1.99 1.99 0 1 1-2.83-2.83l1.42-1.42a1.99 1.99 0 1 1 2.83 2.83l-1.42-1.42a1.99 1.99 0 0 1 2.83 2.83l-1.42 1.42a2.02 2.02 0 0 1 0 2.83zm-7.51 1.6a2.02 2.02 0 0 0 0 2.83l1.42 1.42a1.99 1.99 0 1 0 2.83-2.83l-1.42-1.42a1.99 1.99 0 0 0-2.83 0zm7.44 6.37a2.02 2.02 0 0 0-2.83 0l-1.42 1.42a1.99 1.99 0 1 0 2.83 2.83l1.42-1.42a1.99 1.99 0 0 0 0-2.83l-1.42 1.42zM i 9.5 3.59a5.97 5.97 0 0 1 0 8.57 5.97 5.97 0 0 1-8.57 0 5.97 5.97 0 0 1 0-8.57 5.97 5.97 0 0 1 8.57z" />
                      </svg>
                      GitHub
                    </a>
                  ) : null}
                </div>
              </>
            ))}
        </div>

        {/* Mobile toggle */}
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/15 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-5 w-5"
          >
            {open ? (
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div
          className="border-t border-white/20 px-4 py-4 md:hidden"
          style={{
            background: "linear-gradient(90deg, var(--leish-header-from), var(--leish-header-to))",
          }}
        >
          <div className="flex flex-col gap-1">
            <button
              onClick={toggle}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white hover:bg-white/10"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
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
                    ? "bg-white/20 text-white"
                    : "text-rose-50/90 hover:bg-white/10 hover:text-white",
                )}
              >
                {link.label}
              </Link>
            ))}
            {!loading && (
              <div className="mt-3 flex gap-3 border-t border-white/20 pt-4">
                {user ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={() => setOpen(false)}
                      className={cn(ghostBtn, "flex-1")}
                    >
                      Dashboard
                    </Link>
                    <button onClick={logout} className={cn(outlineBtn, "flex-1")}>
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className={cn(ghostBtn, "flex-1")}
                    >
                      Log in
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setOpen(false)}
                      className={cn(solidBtn, "flex-1")}
                    >
                      Sign up
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
