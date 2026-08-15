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
            width={917}
            height={267}
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
                <a
                  href="/leish-v2.bundle"
                  download="leish-v2.bundle"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/40 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10"
                >
                  ⬇ Bundle
                </a>
                <Link href="/login" className={ghostBtn}>
                  Log in
                </Link>
                <Link href="/register" className={solidBtn}>
                  Sign up free
                </Link>
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
