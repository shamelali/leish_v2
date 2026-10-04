/**
 * Content-Security-Policy construction for the Next.js 16 request proxy.
 *
 * The policy lives here, rather than inline in `src/proxy.ts`, for three
 * reasons:
 *
 * 1. It is pure — build a string from a nonce — so it can be unit-tested
 *    without standing up a Next.js request.
 * 2. The proxy, the root layout and the tests all read the header names from
 *    one place, so they cannot drift apart.
 * 3. `src/proxy.ts` runs on the Edge runtime before render; keeping it thin
 *    keeps the hot path obvious.
 */

/**
 * Request header the proxy uses to hand the per-request nonce to the RSC
 * render. `src/app/layout.tsx` reads it via `headers()` and applies it to the
 * inline theme bootstrap script.
 */
export const CSP_NONCE_HEADER = "x-nonce";

/** The header the browser actually enforces. */
export const CONTENT_SECURITY_POLICY_HEADER = "Content-Security-Policy";

/**
 * Cloudflare Turnstile serves its challenge script from this origin and
 * renders the widget inside a cross-origin iframe.
 */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/** Supabase Storage hosts uploaded portfolio and avatar images. */
const SUPABASE_ORIGIN = "https://*.supabase.co";

export interface CspOptions {
  /** Per-request nonce; base64, no `=` padding. */
  nonce: string;
  /**
   * Development builds additionally need `unsafe-eval` for React Refresh and
   * `ws:` for the HMR socket. Production must never send either.
   */
  isDev?: boolean;
}

/**
 * 128 bits of CSPRNG entropy, base64-encoded with the `=` padding stripped:
 * 16 bytes -> 22 characters. Uses only the Web Crypto global, so the same code
 * runs unchanged on the Edge runtime and on Node.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=+$/, "");
}

/**
 * Build the policy string.
 *
 * Directives run from the most general (`default-src`) to the most specific so
 * a reader can follow the fallback chain. Two properties matter and are
 * asserted by the tests:
 *
 * - `script-src` never contains `'unsafe-inline'`; scripts are admitted by
 *   nonce or by `'strict-dynamic'` delegation from a nonce-trusted script.
 * - The nonce appears exactly once, and only in `script-src`.
 */
export function buildContentSecurityPolicy({ nonce, isDev = false }: CspOptions): string {
  return [
    "default-src 'self'",
    // `'strict-dynamic'` lets a nonce-trusted script load Next.js chunks
    // without enumerating every host they might come from. The Turnstile
    // origin is listed for CSP2 browsers, which ignore 'strict-dynamic'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${TURNSTILE_ORIGIN}${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind's utility output plus the app's pervasive inline `style` attrs.
    "style-src 'self' 'unsafe-inline'",
    // `blob:`/`data:` cover canvas previews and inline placeholders. Uploads
    // are rendered through next/image (same-origin `/_next/image`), so no
    // Vercel Blob host is needed here.
    `img-src 'self' blob: data: ${SUPABASE_ORIGIN}`,
    "font-src 'self' data:",
    `connect-src 'self' ${SUPABASE_ORIGIN} ${TURNSTILE_ORIGIN}${isDev ? " ws:" : ""}`,
    // The Turnstile widget renders inside a cross-origin iframe.
    `frame-src ${TURNSTILE_ORIGIN}`,
    // Clickjacking defence that also covers the legacy `X-Frame-Options`.
    "frame-ancestors 'none'",
    // Stop a injected form from posting credentials off-origin.
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
