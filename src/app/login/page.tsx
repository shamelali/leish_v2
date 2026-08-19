"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/Button";

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
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Logging in…" : "Log In"}
        </Button>
      </form>

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
      <p className="mt-3 text-center text-xs text-stone-400 dark:text-stone-500">
        Platform administrator?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
        >
          Admin sign in
        </Link>
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
