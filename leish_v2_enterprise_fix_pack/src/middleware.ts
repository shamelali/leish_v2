import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
const protectedPaths = ["/dashboard","/onboarding","/api/bookings","/api/artist-profiles"];
const adminPaths = ["/admin"];
export async function middleware(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isProtected = protectedPaths.some(p => req.nextUrl.pathname.startsWith(p));
  const isAdmin = adminPaths.some(p => req.nextUrl.pathname.startsWith(p));
  if (isProtected || isAdmin) {
    const token = req.cookies.get("leish_session")?.value;
    if (!token) return NextResponse.redirect(new URL("/login", req.url));
    try { await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET!)); } catch { return NextResponse.redirect(new URL("/login?expired=1", req.url)); }
  }
  const res = NextResponse.next();
  res.headers.set("x-nonce", nonce);
  res.headers.set("Content-Security-Policy", `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`);
  res.headers.set("X-Frame-Options","DENY");
  res.headers.set("X-Content-Type-Options","nosniff");
  res.headers.set("Referrer-Policy","strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV==="production") res.headers.set("Strict-Transport-Security","max-age=63072000; includeSubDomains; preload");
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"] };
