import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// `next/server` pulls in the whole server runtime; the proxy only needs
// `new NextResponse()` and `NextResponse.next()` to capture forwarded request
// headers and expose a mutable response header bag, so a small stand-in keeps
// this test fast.
vi.mock("next/server", () => {
  class MockNextResponse {
    readonly headers: Headers;
    readonly status: number;
    readonly forwardedRequestHeaders: Headers | undefined;

    constructor(
      _body?: BodyInit | null,
      init?: {
        status?: number;
        headers?: HeadersInit;
        request?: { headers?: Headers };
      },
    ) {
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers);
      this.forwardedRequestHeaders = init?.request?.headers;
    }

    static next(options?: { request?: { headers?: Headers } }) {
      return new MockNextResponse(null, { request: options?.request });
    }
  }

  return { NextResponse: MockNextResponse };
});

import { CONTENT_SECURITY_POLICY_HEADER, CSP_NONCE_HEADER } from "@/lib/csp";

import { config, proxy } from "./proxy";

interface MockResponse {
  status: number;
  headers: Headers;
  forwardedRequestHeaders: Headers | undefined;
}

function runProxy(
  url = "https://leish.my/artists/aisha-azman",
  init?: { method?: string; headers?: Record<string, string> },
): MockResponse {
  const request = {
    headers: new Headers(init?.headers),
    url,
    method: init?.method ?? "GET",
  } as unknown as NextRequest;

  return proxy(request) as unknown as MockResponse;
}

describe("proxy", () => {
  it("sets a Content-Security-Policy response header", () => {
    const response = runProxy();
    const csp = response.headers.get(CONTENT_SECURITY_POLICY_HEADER);

    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
  });

  it("forwards the nonce to the render via the request headers", () => {
    const response = runProxy();

    expect(response.forwardedRequestHeaders).toBeInstanceOf(Headers);
    expect(response.forwardedRequestHeaders?.get(CSP_NONCE_HEADER)).toBeTruthy();
  });

  it("uses the same nonce in the CSP header and the forwarded request header", () => {
    const response = runProxy();
    const csp = response.headers.get(CONTENT_SECURITY_POLICY_HEADER) ?? "";
    const nonce = response.forwardedRequestHeaders?.get(CSP_NONCE_HEADER) ?? "";

    expect(nonce).not.toBe("");
    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  it("also forwards the policy on the request so Next.js can nonce its own scripts", () => {
    const response = runProxy();

    expect(response.forwardedRequestHeaders?.get(CONTENT_SECURITY_POLICY_HEADER)).toBe(
      response.headers.get(CONTENT_SECURITY_POLICY_HEADER),
    );
  });

  it("mints a fresh nonce per request", () => {
    const first = runProxy().forwardedRequestHeaders?.get(CSP_NONCE_HEADER);
    const second = runProxy().forwardedRequestHeaders?.get(CSP_NONCE_HEADER);

    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it("attaches CORS headers on /api/* for leish.my and www.leish.my", () => {
    const apex = runProxy("https://www.leish.my/api/artists", {
      headers: { origin: "https://leish.my" },
    });
    expect(apex.headers.get("Access-Control-Allow-Origin")).toBe("https://leish.my");
    expect(apex.headers.get("Vary")).toBe("Origin");
    expect(apex.headers.get(CONTENT_SECURITY_POLICY_HEADER)).toBeNull();

    const www = runProxy("https://leish.my/api/artists", {
      headers: { origin: "https://www.leish.my" },
    });
    expect(www.headers.get("Access-Control-Allow-Origin")).toBe("https://www.leish.my");
  });

  it("handles OPTIONS preflight on /api/* for allowed and disallowed origins", () => {
    const allowed = runProxy("https://leish.my/api/bookings", {
      method: "OPTIONS",
      headers: { origin: "https://www.leish.my" },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://www.leish.my");

    const rejected = runProxy("https://leish.my/api/bookings", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(rejected.headers.get("Vary")).toBe("Origin");
  });

  it("omits CORS headers on /api/* when Origin is disallowed or absent", () => {
    const evil = runProxy("https://leish.my/api/artists", {
      headers: { origin: "https://evil.example" },
    });
    expect(evil.headers.get("Access-Control-Allow-Origin")).toBeNull();

    const sameOrigin = runProxy("https://leish.my/api/artists");
    expect(sameOrigin.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("proxy matcher", () => {
  // Next.js compiles `config.matcher` entries to anchored regexes.
  const pattern = new RegExp(`^${config.matcher[0]}$`);

  it("matches document routes that need a nonce", () => {
    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/artists/aisha-azman")).toBe(true);
    expect(pattern.test("/dashboard")).toBe(true);
    expect(pattern.test("/onboarding")).toBe(true);
  });

  it("excludes API routes, Next.js internals and static files from document matcher", () => {
    expect(pattern.test("/api/bookings")).toBe(false);
    expect(pattern.test("/_next/static/chunks/main.js")).toBe(false);
    expect(pattern.test("/_next/image?url=%2Fhero.jpg")).toBe(false);
    expect(pattern.test("/images/hero.jpg")).toBe(false);
    expect(pattern.test("/favicon.ico")).toBe(false);
    expect(pattern.test("/robots.txt")).toBe(false);
    expect(pattern.test("/sitemap.xml")).toBe(false);
    expect(pattern.test("/icon.svg")).toBe(false);
  });

  it("includes /api/:path* for CORS handling", () => {
    expect(config.matcher).toContain("/api/:path*");
  });
});
