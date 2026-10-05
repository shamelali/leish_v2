import { NextResponse, type NextRequest } from "next/server";

import {
  CONTENT_SECURITY_POLICY_HEADER,
  CSP_NONCE_HEADER,
  buildContentSecurityPolicy,
  generateNonce,
} from "@/lib/csp";
import { corsHeaders, isAllowedOrigin } from "@/lib/ops/cors";
// NOTE: cron-scheduler import removed with the disabled hook above.

/**
 * Request proxy (Next.js 16 "proxy" convention, formerly "middleware"):
 *
 * 1. `/api/*`: Applies the dynamic CORS allowlist (`https://leish.my`,
 *    `https://www.leish.my`, plus `CORS_ALLOWED_ORIGINS` / `ALLOWED_ORIGINS`
 *    and optional `CORS_VERCEL_PREVIEW_PREFIX`; see `src/lib/ops/cors.ts`).
 *    Same-origin requests carry no cross-origin Origin and pass through
 *    untouched; no CSP nonce is minted for JSON endpoints.
 *
 * 2. Document routes: Mints a per-request Content-Security-Policy with a
 *    one-time nonce:
 *    - The nonce is forwarded to the root layout via the `x-nonce` request
 *      header, which applies it to inline <script> tags (e.g. the theme
 *      bootstrap script) so script-src can omit 'unsafe-inline'.
 *    - Next.js picks the nonce out of the CSP request header and applies it to
 *      its own hydration/bootstrap scripts automatically.
 */
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl?.pathname ?? new URL(request.url).pathname;

  // Traffic-driven crons are DISABLED for now: vinext's after() appears to
  // hold the response open until background work finishes, so the first
  // request per isolate hung behind full cron ticks (edge 524s). The
  // scheduler module stays for a future explicit trigger; see
  // src/server/cron-scheduler.ts.
  // try {
  //   kickCronScheduler(new URL(request.url).origin);
  // } catch {
  //   // A malformed request URL must never break the proxy.
  // }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const allowed = isAllowedOrigin(origin);

    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: allowed ? 204 : 403,
        headers: allowed && origin ? corsHeaders(origin) : { Vary: "Origin" },
      });
    }

    const response = NextResponse.next();
    if (allowed && origin) {
      for (const [k, v] of Object.entries(corsHeaders(origin))) {
        response.headers.set(k, v);
      }
    }
    return response;
  }

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
    // API routes (CORS allowlist).
    "/api/:path*",
  ],
};
