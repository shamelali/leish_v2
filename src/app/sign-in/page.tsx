"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/Button";
import { createClient } from "@/lib/supabase/client";

const inputCls =
  "h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";

const configurationMessage =
  "Admin sign-in is not configured for this preview. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.";

function safeRedirect(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/admin";
}

function AdminSignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));
  const hasSupabaseConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    searchParams.get("error") === "missing_config" || !hasSupabaseConfig
      ? configurationMessage
      : "",
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!hasSupabaseConfig) {
      setError(configurationMessage);
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <p className="text-sm font-medium text-rose-600 dark:text-rose-400">Leish! Admin</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        Admin sign in
      </h1>
      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
        Use your Supabase admin account to manage providers, bookings, and payment events.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="admin-email"
            className="mb-1.5 block text-sm font-medium text-stone-800 dark:text-stone-200"
          >
            Email address
          </label>
          <input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@example.com"
            required
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor="admin-password"
            className="mb-1.5 block text-sm font-medium text-stone-800 dark:text-stone-200"
          >
            Password
          </label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
        <Button type="submit" className="w-full" disabled={submitting || !hasSupabaseConfig}>
          {submitting ? "Signing in…" : "Sign in to admin"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Need a customer, artist, or studio account?{" "}
        <Link
          href="/login"
          className="font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
        >
          Use the regular login
        </Link>
      </p>
    </div>
  );
}

export default function AdminSignInPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-24 text-center text-stone-500">Loading…</div>
      }
    >
      <AdminSignInForm />
    </Suspense>
  );
}
