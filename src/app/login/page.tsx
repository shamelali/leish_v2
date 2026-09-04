"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/Button";
import { TurnstileWidget } from "@/components/TurnstileWidget";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      router.push(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        Welcome Back
      </h1>
      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
        Sign in to manage your appointments, favorites, and profile.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs font-medium">
        {[
          { role: "Client", icon: "👤" },
          { role: "Pro MUA", icon: "🎨" },
          { role: "Studio", icon: "💄" },
        ].map((r) => (
          <span
            key={r.role}
            className="rounded-full bg-stone-100 px-2 py-2 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
          >
            {r.icon} {r.role}
          </span>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-sm font-medium text-stone-800 dark:text-stone-200"
          >
            Email Address
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor="login-password"
            className="mb-1.5 block text-sm font-medium text-stone-800 dark:text-stone-200"
          >
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className={inputCls}
          />
        </div>
        {error && (
          <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </p>
        )}
        <TurnstileWidget onVerify={() => {}} />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Logging in…" : "Log In"}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-stone-200 dark:border-stone-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-3 text-stone-400 dark:bg-stone-950 dark:text-stone-500">
            or continue with
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <a
          href="/api/auth/oauth/google"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-stone-300 bg-white text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        </a>
        <a
          href="/api/auth/oauth/facebook"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-stone-300 bg-white text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#1877F2">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        </a>
        <a
          href="/api/auth/oauth/instagram"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-stone-300 bg-white text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="url(#ig-gradient)">
            <defs>
              <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FFDC80" />
                <stop offset="25%" stopColor="#F77737" />
                <stop offset="50%" stopColor="#E1306C" />
                <stop offset="75%" stopColor="#C13584" />
                <stop offset="100%" stopColor="#833AB4" />
              </linearGradient>
            </defs>
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
          </svg>
        </a>
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link
          href="/forgot-password"
          className="text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400"
        >
          Forgot Password?
        </Link>
        <span className="text-stone-500 dark:text-stone-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400"
          >
            Sign Up Free
          </Link>
        </span>
      </div>
      <p className="mt-8 text-center text-xs text-stone-400 dark:text-stone-500">
        Accounts are stored securely in the demo database.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-24 text-center text-stone-500">Loading…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
