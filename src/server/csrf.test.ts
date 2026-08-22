// @vitest-environment node

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { validateCsrf } from "./csrf";

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
