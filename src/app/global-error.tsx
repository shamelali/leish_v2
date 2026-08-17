"use client";

import { redirect } from "next/navigation";
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
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
            <button
              onClick={() => {
                redirect("/");
              }}
              style={{
                borderRadius: 999,
                border: "1px solid #44403c",
                padding: "10px 22px",
                color: "#e7e5e4",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Back home
            </button>
          </div>
          <script
            dangerouslySetInnerHTML={{
              __html: `fetch('/api/errors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:${JSON.stringify(error.message || "Root layout error")},url:location.pathname,stack:${JSON.stringify(error.stack || "")}})}).catch(()=>{})`,
            }}
          />
        </div>
      </body>
    </html>
  );
}
