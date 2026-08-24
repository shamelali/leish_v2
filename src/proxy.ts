import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy (Next.js 16 "proxy" convention,
 * formerly "middleware") with a one-time nonce.
 *
 * - The nonce is forwarded to the root layout via the `x-nonce` request
 *   header, which applies it to inline <script> tags (e.g. the theme
   bootstrap script) so script-src can omit 'unsafe-inline'.
 * - Next.js picks the nonce out of the CSP request header and applies it to
 *   its own hydration/bootstrap scripts automatically.
 * - API routes and static assets are excluded from the matcher: they don't
 *   render HTML, and excluding them keeps the nonce unique per document.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' lets nonce-trusted scripts load Next.js chunks; dev
    // needs 'unsafe-eval' for React Refresh/HMR. Turnstile serves its
    // challenge script from challenges.cloudflare.com.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind utilities plus the app's pervasive inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.supabase.co",
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co${isDev ? " ws:" : ""}`,
    // The Turnstile widget renders inside a cross-origin iframe.
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except APIs, static assets, and metadata files.
    "/((?!api/|_next/static|_next/image|images/|icon.svg|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
