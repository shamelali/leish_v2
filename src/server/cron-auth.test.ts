// @vitest-environment node

import { describe, expect, it, afterEach } from "vitest";
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
