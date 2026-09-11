import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// `next/server` pulls in the whole server runtime; the proxy only needs
// `NextResponse.next()` to capture forwarded request headers and expose a
// mutable response header bag, so a small stand-in keeps this test fast.
vi.mock("next/server", () => {
  class MockNextResponse {
    readonly headers = new Headers();
    readonly forwardedRequestHeaders: Headers | undefined;

    private constructor(options?: { request?: { headers?: Headers } }) {
      this.forwardedRequestHeaders = options?.request?.headers;
    }

    static next(options?: { request?: { headers?: Headers } }) {
      return new MockNextResponse(options);
    }
  }

  return { NextResponse: MockNextResponse };
});

import { CONTENT_SECURITY_POLICY_HEADER, CSP_NONCE_HEADER } from "@/lib/csp";

import { config, proxy } from "./proxy";

interface MockResponse {
  headers: Headers;
  forwardedRequestHeaders: Headers | undefined;
}

function runProxy(url = "https://leish.my/artists/aisha-azman"): MockResponse {
  const request = {
    headers: new Headers(),
    url,
    method: "GET",
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

  it("excludes API routes, Next.js internals and static files", () => {
    expect(pattern.test("/api/bookings")).toBe(false);
    expect(pattern.test("/_next/static/chunks/main.js")).toBe(false);
    expect(pattern.test("/_next/image?url=%2Fhero.jpg")).toBe(false);
    expect(pattern.test("/images/hero.jpg")).toBe(false);
    expect(pattern.test("/favicon.ico")).toBe(false);
    expect(pattern.test("/robots.txt")).toBe(false);
    expect(pattern.test("/sitemap.xml")).toBe(false);
    expect(pattern.test("/icon.svg")).toBe(false);
  });
});
