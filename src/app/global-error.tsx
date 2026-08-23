"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Root-level error boundary (Next.js renders this when the app/root layout
 * itself throws — the route-level error.tsx can't catch layout errors).
 * Sanitized: never exposes the error message to end users; reports via the
 * client error ingestion endpoint. Self-contained by design — the root
 * layout (Navbar/Footer/CSP nonce) is not rendered here, so a compact
 * branded header stands in.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report via effect instead of an inline script: this boundary renders
  // without the root layout's CSP nonce, so inline scripts would be blocked.
  useEffect(() => {
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message || "Root layout error",
        url: window.location.pathname,
        stack: error.stack || "",
      }),
    }).catch(() => {});
  }, [error]);
  return (
    <html lang="en">
      <body>
        {/* Minimal branded chrome — the root layout (Navbar/Footer) is not
            rendered here by design, so provide a compact stand-in header. */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 64,
            padding: "0 24px",
            borderBottom: "1px solid #292524",
          }}
        >
          <Link
            href="/"
            style={{
              color: "#fb7185",
              fontWeight: 700,
              fontSize: 20,
              textDecoration: "none",
              letterSpacing: "-0.02em",
            }}
          >
            Leish!
          </Link>
          <Link href="/" style={{ color: "#a8a29e", fontSize: 14, textDecoration: "none" }}>
            Back to site
          </Link>
        </header>
        <div
          style={{
            minHeight: "calc(100vh - 64px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
            background: "#0c0a09",
            color: "#f5f5f4",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 56, margin: 0, color: "#fb7185" }}>500</p>
          <h1 style={{ margin: "12px 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#a8a29e", maxWidth: 420, lineHeight: 1.6 }}>
            An unexpected error occurred. Please try again — if it keeps happening, we&apos;d love
            to hear from you.
          </p>
          {error.digest && (
            <p style={{ color: "#78716c", fontSize: 12 }}>Reference: {error.digest}</p>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              onClick={reset}
              style={{
                borderRadius: 999,
                border: 0,
                padding: "10px 22px",
                background: "#e11d48",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                borderRadius: 999,
                border: "1px solid #44403c",
                padding: "10px 22px",
                color: "#e7e5e4",
                fontSize: 14,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Back home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
