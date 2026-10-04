"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/Button";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { getTurnstileToken } from "@/lib/turnstile-token";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-sm text-ink placeholder:text-ink-subtle transition-colors duration-[var(--dur-fast)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

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
        body: JSON.stringify({ email, turnstileToken: getTurnstileToken() }),
      });
      const body: { error?: string; message?: string; devResetUrl?: string } = await res.json();
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
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        Reset your password
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Enter your email and we&apos;ll send you a link to create a new password.
      </p>

      {message ? (
        <div className="mt-8 rounded-2xl border border-success/30 bg-success-soft p-6 text-center">
          <p className="flex items-center justify-center gap-2 text-lg font-semibold text-success">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
              />
            </svg>
            Check your inbox
          </p>
          <p className="mt-2 text-sm text-ink-muted">{message}</p>
          {devUrl && (
            <div className="mt-4 rounded-xl bg-surface p-3 text-left">
              <p className="text-xs font-medium text-ink-muted">
                Development reset link (no email provider configured):
              </p>
              <a
                href={devUrl}
                className="mt-1 block break-all text-sm font-medium text-link hover:underline"
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
            <label htmlFor="fp-email" className="mb-1.5 block text-sm font-medium text-ink">
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
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <TurnstileWidget onVerify={() => {}} />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Sending…" : "Send Reset Link"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-ink-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-link hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
