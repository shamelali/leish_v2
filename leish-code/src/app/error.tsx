"use client";

import { useEffect } from "react";
import { Button } from "@/components/Button";

/**
 * Route-level error boundary. Enterprise note: we deliberately do NOT show
 * `error.message` to end users — it can leak internals. The error is logged
 * to the console (and would be forwarded to an error tracker such as Sentry).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled route error:", error);
    // Report the error server-side (sanitized, rate-limited) for visibility.
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message || "Unhandled route error",
        url: typeof window !== "undefined" ? window.location.pathname : "",
        stack: error.stack,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-32 text-center">
      <p className="font-display text-7xl font-semibold text-rose-200 dark:text-rose-900/40">500</p>
      <h1 className="mt-4 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
        Something went wrong
      </h1>
      <p className="mt-3 text-stone-500 dark:text-stone-400">
        An unexpected error occurred. Please try again — if it keeps happening, we&apos;d love to
        hear from you.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">Reference: {error.digest}</p>
      )}
      <div className="mt-8 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button href="/" variant="outline">
          Back home
        </Button>
      </div>
    </div>
  );
}
