"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/Button";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const inputCls =
    "h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-sm text-ink placeholder:text-ink-subtle transition-colors duration-[var(--dur-fast)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body: { error?: string } = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Could not reset your password. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-8 w-8 text-success">
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold text-ink">Password updated</h1>
        <p className="mt-3 text-ink-muted">You can now log in with your new password.</p>
        <div className="mt-8">
          <Button href="/login">Go to Log in</Button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-lg font-semibold text-ink">Invalid reset link</p>
        <p className="mt-2 text-sm text-ink-muted">
          This link is missing its token. Please request a new one.
        </p>
        <div className="mt-8">
          <Button href="/forgot-password">Request a new link</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        Choose a new password
      </h1>
      <p className="mt-2 text-sm text-ink-muted">Must be at least 8 characters.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="rp-password" className="mb-1.5 block text-sm font-medium text-ink">
            New password
          </label>
          <input
            id="rp-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="rp-confirm" className="mb-1.5 block text-sm font-medium text-ink">
            Confirm new password
          </label>
          <input
            id="rp-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            required
            className={inputCls}
          />
        </div>
        {error && (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Updating…" : "Update Password"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link href="/login" className="font-medium text-link hover:underline">
          Back to Log in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-24 text-center text-ink-muted">Loading…</div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
