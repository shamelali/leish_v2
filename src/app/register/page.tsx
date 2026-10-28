"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Button } from "@/components/Button";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: { id: Role; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    id: "customer",
    label: "Client",
    hint: "Book artists & studios",
    icon: (
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
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    ),
  },
  {
    id: "artist",
    label: "Artist",
    hint: "Pro MUA — get booked",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
        className="h-5 w-5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 3.5l5 5L8 21H3v-5L15.5 3.5z" />
      </svg>
    ),
  },
  {
    id: "studio",
    label: "Studio",
    hint: "Salon or studio",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
        className="h-5 w-5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 3h8l3 6-7 12L5 9l3-6z" />
      </svg>
    ),
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [role, setRole] = useState<Role>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register({ name: name.trim(), email, password, role, consent });
      router.push(role === "artist" ? "/onboarding?new=1" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-sm text-ink placeholder:text-ink-subtle transition-colors duration-[var(--dur-fast)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        Create your account
      </h1>
      <p className="mt-2 text-sm text-ink-muted">Choose your path — switch roles any time.</p>

      <div className="mt-6 grid grid-cols-3 gap-2">
        {ROLE_OPTIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={role === r.id}
            onClick={() => setRole(r.id)}
            className={cn(
              "rounded-2xl border p-3 text-center transition-all duration-[var(--dur-fast)]",
              role === r.id
                ? "border-primary bg-primary-soft ring-2 ring-ring/30"
                : "border-line-strong bg-surface hover:border-primary hover:bg-primary-soft/50",
            )}
          >
            <span
              className={cn(
                "mx-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                role === r.id ? "bg-primary text-primary-fg" : "bg-surface-sunken text-ink-muted",
              )}
            >
              {r.icon}
            </span>
            <p className="mt-2 text-sm font-semibold text-ink">{r.label}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">{r.hint}</p>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="reg-name" className="mb-1.5 block text-sm font-medium text-ink">
            Full name
          </label>
          <input
            id="reg-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aina Rahman"
            required
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="reg-email" className="mb-1.5 block text-sm font-medium text-ink">
            Email Address
          </label>
          <input
            id="reg-email"
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
          <label htmlFor="reg-password" className="mb-1.5 block text-sm font-medium text-ink">
            Password
          </label>
          <input
            id="reg-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min. 8 characters)"
            minLength={8}
            required
            className={inputCls}
          />
        </div>
        <div className="flex items-start gap-3">
          <input
            id="reg-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line-strong accent-[color:var(--primary)]"
          />
          <label htmlFor="reg-consent" className="text-sm text-ink-muted">
            I consent to the collection and processing of my personal data in accordance with the{" "}
            <Link href="/privacy" className="font-medium text-link hover:underline">
              Privacy Policy
            </Link>
            .
          </label>
        </div>
        {error && (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <TurnstileWidget onVerify={() => {}} />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Sign Up Free"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-link hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
