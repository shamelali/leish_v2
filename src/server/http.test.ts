// @vitest-environment node

import { describe, expect, it } from "vitest";
import { enforceSameOrigin } from "./http";

function makeRequest(origin: string | null, extraHeaders: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...extraHeaders,
    },
  });
}

describe("enforceSameOrigin (CSRF)", () => {
  it("allows same-origin requests", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(enforceSameOrigin(makeRequest("http://localhost:3000"))).toBeNull();
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prev;
  });

  it("allows the public preview origin from forwarded proxy headers", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(
      enforceSameOrigin(
        makeRequest("https://3000-preview123.e2b.app", {
          "X-Forwarded-Host": "3000-preview123.e2b.app",
          "X-Forwarded-Proto": "https",
        }),
      ),
    ).toBeNull();
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prev;
  });

  it("allows Arena preview origins outside production", () => {
    expect(enforceSameOrigin(makeRequest("https://3000-preview123.e2b.app"))).toBeNull();
  });

  it("rejects a cross-origin request", () => {
    const result = enforceSameOrigin(makeRequest("https://evil.example.com"));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  it("allows requests without an Origin header (server-to-server / webhooks)", () => {
    expect(enforceSameOrigin(makeRequest(null))).toBeNull();
  });

  it("allows origins listed in ALLOWED_ORIGINS", () => {
    const prev = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = "https://app.example.com,https://m.example.com";
    expect(enforceSameOrigin(makeRequest("https://app.example.com"))).toBeNull();
    expect(enforceSameOrigin(makeRequest("https://m.example.com"))).toBeNull();
    expect(enforceSameOrigin(makeRequest("https://evil.example.com"))).not.toBeNull();
    if (prev === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = prev;
  });
});
