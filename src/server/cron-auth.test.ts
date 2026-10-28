// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeCron } from "./cron-auth";
import { authorizeCron as opsAuthorizeCron } from "@/lib/ops/cron-auth";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://leish.my/api/cron", { headers });
}

describe("authorizeCron", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows access with a valid Bearer token", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest({ authorization: "Bearer my-secret" });
    expect(authorizeCron(req)).toBeNull();
  });

  it("allows access with a valid x-cron-secret header", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest({ "x-cron-secret": "my-secret" });
    expect(authorizeCron(req)).toBeNull();
  });

  it("allows scheduler cron with correct Bearer", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest({ authorization: "Bearer my-secret" });
    expect(authorizeCron(req)).toBeNull();
  });

  it("rejects when secret is set but no auth provided", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const res = authorizeCron(makeRequest());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects when Bearer token is wrong or non-Bearer scheme", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    expect(authorizeCron(makeRequest({ authorization: "Bearer wrong-secret" }))?.status).toBe(401);
    expect(authorizeCron(makeRequest({ authorization: "my-secret" }))?.status).toBe(401);
  });

  it("rejects when x-cron-secret is wrong", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest({ "x-cron-secret": "wrong" });
    const res = authorizeCron(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects unknown headers without correct Bearer", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest({ "x-scheduler": "1" });
    const res = authorizeCron(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("fails closed when CRON_SECRET is unset outside development", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const res = authorizeCron(makeRequest());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });

  it("allows unauthenticated calls when CRON_SECRET is unset in local development", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(authorizeCron(makeRequest())).toBeNull();
    expect(opsAuthorizeCron).toBe(authorizeCron);
  });
});
