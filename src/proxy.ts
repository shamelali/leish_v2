import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/server/session";

/**
 * Route protection + nonce-based CSP.
 *
 * - Pages under /dashboard and /onboarding redirect unauthenticated users
 *   to /login with a return path.
 * - API routes under /api/bookings return 401 instead of redirecting.
 * - In production, every HTML response gets a per-request CSP nonce:
 *   the nonce is placed in the `x-nonce` request header (Next.js applies it
 *   to its own inline scripts) and interpolated into the CSP header, which
 *   drops `'unsafe-inline'` from script-src. The theme script in the root
 *   layout reads the nonce via headers().
 */

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'", // inline styles used by Tailwind/React
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("leish_session")?.value;
  const payload = token ? await verifySessionToken(token) : null;
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const needsAuth =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/onboarding");

  if (needsAuth && !payload) {
    if (isApi) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // CSP nonce: production only (dev needs relaxed script rules for HMR).
  // Uses Web Crypto (Edge runtime — node:crypto is unavailable here).
  if (process.env.NODE_ENV === "production") {
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", buildCsp(nonce));
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // Protection targets + all page routes (for the CSP nonce). Static assets
  // and image optimization are exempt.
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/api/bookings/:path*",
    "/((?!_next/static|_next/image|images/|favicon\\.ico|icon\\.svg|robots\\.txt|sitemap\\.xml).*)",
  ],
};
