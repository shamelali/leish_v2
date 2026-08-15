"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/Button";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "1";
  const error = searchParams.get("error") === "1";

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      {verified ? (
        <>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
            >
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="mt-6 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
            Email verified 🎉
          </h1>
          <p className="mt-3 text-stone-600 dark:text-stone-400">
            Your account is now fully activated. You can book artists and manage your appointments.
          </p>
          <div className="mt-8">
            <Button href="/dashboard">Go to Dashboard</Button>
          </div>
        </>
      ) : error ? (
        <>
          <p className="font-display text-6xl font-semibold text-rose-200 dark:text-rose-900/40">
            !
          </p>
          <h1 className="mt-4 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
            Verification link invalid
          </h1>
          <p className="mt-3 text-stone-600 dark:text-stone-400">
            This link is invalid or has expired. Log in and request a new verification email.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button href="/login">Log in</Button>
            <Button href="/dashboard" variant="outline">
              Dashboard
            </Button>
          </div>
        </>
      ) : (
        <>
          <h1 className="font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
            Check your email
          </h1>
          <p className="mt-3 text-stone-600 dark:text-stone-400">
            We&apos;ve sent you a verification link. Open it in your browser to activate your
            account.
          </p>
          <div className="mt-8">
            <Button href="/dashboard" variant="outline">
              Back to Dashboard
            </Button>
          </div>
        </>
      )}
      <p className="mt-10 text-sm text-stone-400 dark:text-stone-500">
        <Link
          href="/"
          className="text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400"
        >
          Back to home
        </Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-24 text-center text-stone-500">Loading…</div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
