// Runtime-only env validation — called at server startup, NOT at build time.
// This file is NOT imported at build time, so SESSION_SECRET can be missing
// during `next build` and still succeed.

/**
 * Validate runtime environment variables.
 * Called from the server entry point (e.g., in a middleware or app init).
 * Do NOT import this from next.config.ts — it would crash the build.
 */
export function initRuntimeEnv(): void {
  // Runtime-only: SESSION_SECRET must exist in production
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET is required in production. Set it in Vercel env vars."
    );
  }
}
