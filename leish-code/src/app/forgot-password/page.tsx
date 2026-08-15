"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setDevUrl(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setMessage(
        body?.message ?? "If an account exists for that email, a reset link is on its way.",
      );
      if (body?.devResetUrl) setDevUrl(body.devResetUrl);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        Reset your password
      </h1>
      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
        Enter your email and we&apos;ll send you a link to create a new password.
      </p>

      {message ? (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800/60 dark:bg-emerald-500/10">
          <p className="text-lg font-semibold text-emerald-800 dark:text-emerald-400">
            Check your inbox 📬
          </p>
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300/90">{message}</p>
          {devUrl && (
            <div className="mt-4 rounded-xl bg-white/70 p-3 text-left dark:bg-stone-900/60">
              <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
                Development reset link (no email provider configured):
              </p>
              <a
                href={devUrl}
                className="mt-1 block break-all text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500"
              >
                {devUrl}
              </a>
            </div>
          )}
          <div className="mt-6">
            <Button href="/login" variant="outline">
              Back to Log in
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="fp-email"
              className="mb-1.5 block text-sm font-medium text-stone-800 dark:text-stone-200"
            >
              Email Address
            </label>
            <input
              id="fp-email"
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
          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Sending…" : "Send Reset Link"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
