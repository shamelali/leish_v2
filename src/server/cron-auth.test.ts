// @vitest-environment node

import { describe, expect, it, afterEach, vi } from "vitest";
import { authorizeCron } from "./cron-auth";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/cron", { headers });
}

describe("authorizeCron", () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalEnv;
    }
  });

  it("allows access when CRON_SECRET is unset (local dev)", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCron(makeRequest())).toBeNull();
  });

  it("allows access with a valid Bearer token", () => {
    process.env.CRON_SECRET = "my-secret";
    const req = makeRequest({ authorization: "Bearer my-secret" });
    expect(authorizeCron(req)).toBeNull();
  });

  it("allows access with a valid x-cron-secret header", () => {
    process.env.CRON_SECRET = "my-secret";
    const req = makeRequest({ "x-cron-secret": "my-secret" });
    expect(authorizeCron(req)).toBeNull();
  });

  it("allows Vercel cron with correct Bearer", () => {
    process.env.CRON_SECRET = "my-secret";
    const req = makeRequest({ authorization: "Bearer my-secret", "x-vercel-cron": "1" });
    expect(authorizeCron(req)).toBeNull();
  });

  it("rejects when secret is set but no auth provided", () => {
    process.env.CRON_SECRET = "my-secret";
    const res = authorizeCron(makeRequest());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects when Bearer token is wrong", () => {
    process.env.CRON_SECRET = "my-secret";
    const req = makeRequest({ authorization: "Bearer wrong-secret" });
    const res = authorizeCron(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects when x-cron-secret is wrong", () => {
    process.env.CRON_SECRET = "my-secret";
    const req = makeRequest({ "x-cron-secret": "wrong" });
    const res = authorizeCron(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects Vercel cron header without correct Bearer", () => {
    process.env.CRON_SECRET = "my-secret";
    const req = makeRequest({ "x-vercel-cron": "1" });
    const res = authorizeCron(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });
});

describe("authorizeCron — production fails closed", () => {
  // `NODE_ENV` is typed read-only, so state is stubbed rather than assigned.
  // `vi.unstubAllEnvs()` restores every key, including the secrets.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses with 503 rather than exposing the endpoint when no secret is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("INTERNAL_API_SECRET", "");

    // These endpoints send email and drive payouts; "unconfigured" must never
    // mean "publicly triggerable".
    const res = authorizeCron(makeRequest());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
  });

  it("accepts either CRON_SECRET or INTERNAL_API_SECRET", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("INTERNAL_API_SECRET", "internal-secret");

    expect(authorizeCron(makeRequest({ authorization: "Bearer cron-secret" }))).toBeNull();
    expect(authorizeCron(makeRequest({ authorization: "Bearer internal-secret" }))).toBeNull();
    expect(authorizeCron(makeRequest({ authorization: "Bearer nope" }))!.status).toBe(401);
  });
});
