// @vitest-environment node

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isTurnstileConfigured, verifyTurnstileToken, clientIp } from "./turnstile";

const origSecret = process.env.TURNSTILE_SECRET_KEY;

beforeEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  if (origSecret !== undefined) process.env.TURNSTILE_SECRET_KEY = origSecret;
  else delete process.env.TURNSTILE_SECRET_KEY;
  vi.unstubAllGlobals();
});

describe("isTurnstileConfigured", () => {
  it("returns false when secret is not set", () => {
    expect(isTurnstileConfigured()).toBe(false);
  });

  it("returns true when secret is set", () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    expect(isTurnstileConfigured()).toBe(true);
  });
});

describe("verifyTurnstileToken", () => {
  it("returns true when not configured (dev mode)", async () => {
    const result = await verifyTurnstileToken("any-token", "1.2.3.4");
    expect(result).toBe(true);
  });

  it("returns false when token is missing and configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const result = await verifyTurnstileToken("", "1.2.3.4");
    expect(result).toBe(false);
  });

  it("returns false when token is not a string and configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const result = await verifyTurnstileToken(null, "1.2.3.4");
    expect(result).toBe(false);
  });

  it("returns true when siteverify succeeds", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken("valid-token", "1.2.3.4");
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("response")).toBe("valid-token");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("returns false when siteverify returns success: false", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken("invalid-token", "1.2.3.4");
    expect(result).toBe(false);
  });

  it("returns false and logs error on network failure (fail closed)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken("valid-token", "1.2.3.4");
    expect(result).toBe(false);
  });

  it("includes remoteip when provided", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await verifyTurnstileToken("token", "192.168.1.1");
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("remoteip")).toBe("192.168.1.1");
  });

  it("uses empty remoteip when null", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await verifyTurnstileToken("token", null);
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("remoteip")).toBe("");
  });
});

describe("clientIp", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const request = new Request("http://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(request)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for absent", () => {
    const request = new Request("http://example.com", {
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(clientIp(request)).toBe("10.0.0.1");
  });

  it("returns empty string when neither header present", () => {
    const request = new Request("http://example.com");
    expect(clientIp(request)).toBe("");
  });

  it("trims whitespace from x-forwarded-for", () => {
    const request = new Request("http://example.com", {
      headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" },
    });
    expect(clientIp(request)).toBe("1.2.3.4");
  });
});
