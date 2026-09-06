import { NextResponse, type NextRequest } from "next/server";

/**
 * Generates a cryptographically random base64 nonce (22 chars)
 * and sets it as both the x-nonce header and CSP directive.
 * Must run before Next.js renders the page.
 */
export function middleware(request: NextRequest) {
  // 1. Generate a cryptographically random base64 nonce (22 chars)
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const nonce = btoa(String.fromCharCode(...array)).replace(/=+$/, "");

  // 2. Set the x-nonce header so layout.tsx can read it, and inject CSP
  const response = NextResponse.next({
    request,
    // $FlowIgnore: headers mutated for nonce injection
  });

  // Manually set the headers on the response since Next.js doesn't
  // always propagate them through the middleware request cascade
  response.headers.set("x-nonce", nonce);
  response.headers.set(
    "Content-Security-Policy",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
  );

  // 3. Add cache-control to prevent nonce reuse within same session
  response.headers.set("Cache-Control", "no-store, max-age=0");

  return response;
}

/**
 * Opt-out: exclude paths from nonce protection.
 * Add paths here that don't need CSP nonce (e.g., static assets, APIs).
 */
export const config = {
  matcher: ["/((?!_next|api|static).*)"],
};
