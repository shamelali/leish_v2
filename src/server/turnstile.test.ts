// @vitest-environment node

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isTurnstileConfigured,
  isValidSecretKeyFormat,
  verifyTurnstileToken,
  clientIp,
  __resetTurnstileAlerts,
} from "./turnstile";

interface ReportContext {
  route?: string;
  metadata?: { reason?: string; codes?: string[]; secretLength?: number };
}

const reportError = vi.fn<(err: unknown, context: ReportContext) => Promise<void>>(async () => {});
vi.mock("./errors", () => ({
  reportError: (err: unknown, context: ReportContext) => reportError(err, context),
}));

/** Context of the Nth reportError call. */
function ctxOf(n = 0): ReportContext | undefined {
  return reportError.mock.calls[n]?.[1];
}

/** A syntactically valid Cloudflare-issued secret (the documented test key). */
const VALID_SECRET = "1x0000000000000000000000000000000AA";

const origSecret = process.env.TURNSTILE_SECRET_KEY;

beforeEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  vi.stubGlobal("fetch", vi.fn());
  reportError.mockClear();
  __resetTurnstileAlerts();
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

  it("returns true when a well-formed secret is set", () => {
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
    expect(isTurnstileConfigured()).toBe(true);
  });

  it("returns false for a malformed secret, so callers treat it as unconfigured", () => {
    // A self-generated value: non-empty and plausible, but never Cloudflare's.
    process.env.TURNSTILE_SECRET_KEY = "aGVsbG8gd29ybGQgdGhpcyBpcyBiYXNlNjQ=";
    expect(isTurnstileConfigured()).toBe(false);
  });
});

describe("isValidSecretKeyFormat", () => {
  it("accepts Cloudflare-issued and documented testing keys", () => {
    expect(isValidSecretKeyFormat("0x4AAAAAAABt1yLuHash1YnUdWH0nGHtCbc")).toBe(true);
    expect(isValidSecretKeyFormat("1x0000000000000000000000000000000AA")).toBe(true);
    expect(isValidSecretKeyFormat("2x0000000000000000000000000000000AA")).toBe(true);
  });

  it("rejects values that did not come from Turnstile", () => {
    // `openssl rand -base64 32` output — the exact mistake this guards against.
    expect(isValidSecretKeyFormat("Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg==")).toBe(false);
    expect(isValidSecretKeyFormat("test-secret")).toBe(false);
    expect(isValidSecretKeyFormat("")).toBe(false);
    expect(isValidSecretKeyFormat("0xshort")).toBe(false);
  });
});

describe("misconfigured secret degrades open and alerts", () => {
  const BAD_SECRET = "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg==";

  it("allows the request instead of locking every user out", async () => {
    process.env.TURNSTILE_SECRET_KEY = BAD_SECRET;
    // Failing closed here would reject 100% of logins and registrations.
    await expect(verifyTurnstileToken("any-token", "1.2.3.4")).resolves.toBe(true);
  });

  it("never calls siteverify with a key Cloudflare cannot accept", async () => {
    process.env.TURNSTILE_SECRET_KEY = BAD_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await verifyTurnstileToken("any-token", "1.2.3.4");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("raises an alert naming the misconfiguration", async () => {
    process.env.TURNSTILE_SECRET_KEY = BAD_SECRET;
    await verifyTurnstileToken("any-token", "1.2.3.4");

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(ctxOf()?.metadata?.reason).toBe("malformed_secret");
  });

  it("does not leak the secret value into the alert", async () => {
    process.env.TURNSTILE_SECRET_KEY = BAD_SECRET;
    await verifyTurnstileToken("any-token", "1.2.3.4");

    expect(JSON.stringify(reportError.mock.calls[0])).not.toContain(BAD_SECRET);
  });

  it("alerts once per process, not once per login attempt", async () => {
    process.env.TURNSTILE_SECRET_KEY = BAD_SECRET;
    await verifyTurnstileToken("t1", "1.2.3.4");
    await verifyTurnstileToken("t2", "1.2.3.4");
    await verifyTurnstileToken("t3", "1.2.3.4");

    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe("siteverify rejects our secret", () => {
  function mockCodes(codes: string[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, "error-codes": codes }),
      }),
    );
  }

  it("degrades open and alerts on invalid-input-secret", async () => {
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
    mockCodes(["invalid-input-secret"]);

    // Well-formed but wrong for this site: still unusable, still must not
    // take down auth.
    await expect(verifyTurnstileToken("token", "1.2.3.4")).resolves.toBe(true);
    expect(ctxOf()?.metadata?.reason).toBe("invalid_input_secret");
  });

  it("still fails closed for user-caused rejections", async () => {
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
    mockCodes(["invalid-input-response"]);

    // The user's token is bad — that IS a real failure. Reject, and do not
    // alert: this is routine, not an incident.
    await expect(verifyTurnstileToken("token", "1.2.3.4")).resolves.toBe(false);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("fails closed on a replayed token", async () => {
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
    mockCodes(["timeout-or-duplicate"]);
    await expect(verifyTurnstileToken("token", "1.2.3.4")).resolves.toBe(false);
  });
});

describe("verifyTurnstileToken", () => {
  it("returns true when not configured (dev mode)", async () => {
    const result = await verifyTurnstileToken("any-token", "1.2.3.4");
    expect(result).toBe(true);
  });

  it("returns false when token is missing and configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
    const result = await verifyTurnstileToken("", "1.2.3.4");
    expect(result).toBe(false);
  });

  it("returns false when token is not a string and configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
    const result = await verifyTurnstileToken(null, "1.2.3.4");
    expect(result).toBe(false);
  });

  it("returns true when siteverify succeeds", async () => {
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
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
    expect(body.get("secret")).toBe(VALID_SECRET);
    expect(body.get("response")).toBe("valid-token");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("returns false when siteverify returns success: false", async () => {
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken("invalid-token", "1.2.3.4");
    expect(result).toBe(false);
  });

  it("returns false and logs error on network failure (fail closed)", async () => {
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken("valid-token", "1.2.3.4");
    expect(result).toBe(false);
  });

  it("includes remoteip when provided", async () => {
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
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
    process.env.TURNSTILE_SECRET_KEY = VALID_SECRET;
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
