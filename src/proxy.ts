import { NextResponse, type NextRequest } from "next/server";

import {
  CONTENT_SECURITY_POLICY_HEADER,
  CSP_NONCE_HEADER,
  buildContentSecurityPolicy,
  generateNonce,
} from "@/lib/csp";

/**
 * Per-request Content-Security-Policy (Next.js 16 "proxy" convention,
 * formerly "middleware") with a one-time nonce.
 *
 * This file must live at `src/proxy.ts` (or `proxy.ts` at the project root).
 * Next.js resolves the proxy with the pattern `(?:src/)?proxy`, so a proxy
 * placed anywhere else — `src/app/proxy.ts`, for example — is never loaded and
 * silently ships no CSP at all.
 *
 * - The nonce is forwarded to the root layout via the `x-nonce` request
 *   header, which applies it to inline <script> tags (e.g. the theme
 *   bootstrap script) so script-src can omit 'unsafe-inline'.
 * - Next.js picks the nonce out of the CSP request header and applies it to
 *   its own hydration/bootstrap scripts automatically.
 * - API routes and static assets are excluded from the matcher: they don't
 *   render HTML, and excluding them keeps the nonce unique per document.
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV !== "production",
  });

  // Forward the nonce on the *request* so the RSC render — and therefore the
  // root layout — can read it with `headers()`.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_NONCE_HEADER, nonce);
  requestHeaders.set(CONTENT_SECURITY_POLICY_HEADER, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // ...and on the *response*, which is what the browser actually enforces.
  response.headers.set(CONTENT_SECURITY_POLICY_HEADER, csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except APIs, static assets, and metadata files.
    "/((?!api/|_next/static|_next/image|images/|icon.svg|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
