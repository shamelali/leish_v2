// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { generateCsrfToken, validateCsrf } from "./csrf";

// `generateCsrfToken` writes through next/headers, which is only available
// inside a request scope — stub the cookie jar so the setter is observable.
const cookieSet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));

function makeCsrfRequest(headerToken?: string, cookieValue?: string): NextRequest {
  const cookieParts: string[] = [];
  if (cookieValue) cookieParts.push(`leish_csrf=${cookieValue}`);
  const cookieHeader = cookieParts.join("; ");

  const url = new URL("http://localhost:3000/test");
  const headers = new Headers();
  if (headerToken) headers.set("x-csrf-token", headerToken);
  if (cookieHeader) headers.set("cookie", cookieHeader);

  return new NextRequest(url, { method: "GET", headers });
}

describe("validateCsrf", () => {
  it("returns true for matching token and cookie", async () => {
    const token = "abc123def456";
    const req = makeCsrfRequest(token, token);
    expect(await validateCsrf(req)).toBe(true);
  });

  it("returns false when header is missing", async () => {
    const req = makeCsrfRequest(undefined, "abc123");
    expect(await validateCsrf(req)).toBe(false);
  });

  it("returns false when cookie is missing", async () => {
    const req = makeCsrfRequest("abc123", undefined);
    expect(await validateCsrf(req)).toBe(false);
  });

  it("returns false when both are missing", async () => {
    const req = makeCsrfRequest();
    expect(await validateCsrf(req)).toBe(false);
  });

  it("returns false for mismatched tokens", async () => {
    const req = makeCsrfRequest("token-a", "token-b");
    expect(await validateCsrf(req)).toBe(false);
  });

  it("returns false for different-length tokens (timingSafeEqual guard)", async () => {
    const req = makeCsrfRequest("short", "a-much-longer-token");
    expect(await validateCsrf(req)).toBe(false);
  });
});

describe("generateCsrfToken", () => {
  beforeEach(() => {
    cookieSet.mockReset();
  });

  it("returns a 32-byte token as 64 hex characters", async () => {
    const token = await generateCsrfToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("writes the token to the leish_csrf cookie with hardened attributes", async () => {
    const token = await generateCsrfToken();

    expect(cookieSet).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieSet.mock.calls[0];
    expect(name).toBe("leish_csrf");
    expect(value).toBe(token);
    // Readable by the client so it can echo the value into the x-csrf-token
    // header — this is the double-submit pattern, not a session cookie.
    expect(options).toMatchObject({
      httpOnly: false,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 86400,
    });
  });

  it("issues a fresh token on each call", async () => {
    const a = await generateCsrfToken();
    const b = await generateCsrfToken();
    expect(a).not.toBe(b);
  });

  it("produces a token that validateCsrf accepts on the round trip", async () => {
    const token = await generateCsrfToken();
    expect(await validateCsrf(makeCsrfRequest(token, token))).toBe(true);
  });
});
