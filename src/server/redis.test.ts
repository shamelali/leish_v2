// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockKeys = vi.fn();

vi.mock("@upstash/redis", () => {
  return {
    Redis: class MockRedis {
      get = mockGet;
      set = mockSet;
      del = mockDel;
      keys = mockKeys;
    },
  };
});

describe("server/redis cache helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGet.mockReset();
    mockSet.mockReset();
    mockDel.mockReset();
    mockKeys.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no-ops when Upstash env vars are not configured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { cacheGet, cacheSet, cacheDel, cacheDelPrefix, isRedisConfigured } =
      await import("./redis");

    expect(isRedisConfigured()).toBe(false);
    expect(await cacheGet("k")).toBeUndefined();
    await cacheSet("k", { a: 1 }, 60);
    await cacheDel("k");
    await cacheDelPrefix("cat:");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("reads, writes, and deletes keys when configured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    const { cacheGet, cacheSet, cacheDel, cacheDelPrefix, isRedisConfigured } =
      await import("./redis");

    expect(isRedisConfigured()).toBe(true);

    mockGet.mockResolvedValueOnce(JSON.stringify({ hello: "world" }));
    expect(await cacheGet<{ hello: string }>("k1")).toEqual({ hello: "world" });

    mockGet.mockResolvedValueOnce(null);
    expect(await cacheGet("k-miss")).toBeUndefined();

    mockGet.mockRejectedValueOnce(new Error("boom"));
    expect(await cacheGet("k-err")).toBeUndefined();

    await cacheSet("k1", { hello: "world" }, 120);
    expect(mockSet).toHaveBeenCalledWith("k1", JSON.stringify({ hello: "world" }), { ex: 120 });

    await cacheDel();
    expect(mockDel).not.toHaveBeenCalled();

    await cacheDel("k1", "k2");
    expect(mockDel).toHaveBeenCalledWith("k1", "k2");

    mockKeys.mockResolvedValueOnce(["cat:a:1", "cat:a:2"]);
    await cacheDelPrefix("cat:a:");
    expect(mockDel).toHaveBeenCalledWith("cat:a:1", "cat:a:2");

    mockKeys.mockResolvedValueOnce([]);
    await cacheDelPrefix("cat:empty:");
  });
});
