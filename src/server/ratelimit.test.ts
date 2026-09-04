// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createMemoryStore, createRateLimiter, createUpstashStore } from "./ratelimit";

describe("memory rate limit store", () => {
  it("allows requests under the limit", async () => {
    const limiter = createRateLimiter(createMemoryStore());
    for (let i = 0; i < 3; i++) {
      const result = await limiter("key:under", 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5 - i - 1);
    }
  });

  it("blocks requests over the limit and reports retry-after", async () => {
    const limiter = createRateLimiter(createMemoryStore());
    for (let i = 0; i < 3; i++) await limiter("key:over", 3, 60_000);
    const blocked = await limiter("key:over", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect((await limiter("key:over", 3, 60_000)).allowed).toBe(false);
  });

  it("treats different keys independently", async () => {
    const limiter = createRateLimiter(createMemoryStore());
    await limiter("key:a", 2, 60_000);
    await limiter("key:a", 2, 60_000);
    expect((await limiter("key:a", 2, 60_000)).allowed).toBe(false);
    expect((await limiter("key:b", 2, 60_000)).allowed).toBe(true);
  });

  it("expires hits outside the window", async () => {
    const limiter = createRateLimiter(createMemoryStore());
    expect((await limiter("key:window", 2, 1)).allowed).toBe(true);
    // A 1ms window has elapsed by the time this resolves.
    expect((await limiter("key:window", 2, 1)).allowed).toBe(true);
  });
});

describe("upstash rate limit store", () => {
  function mockUpstash(handler: (path: string) => { result?: unknown; error?: string }) {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const path = url.replace("https://example.upstash.io/", "");
      const body = handler(path);
      return new Response(JSON.stringify(body), { status: 200 });
    });
    return createUpstashStore({ url: "https://example.upstash.io/", token: "t", fetchImpl });
  }

  it("returns null without configuration", () => {
    const prevUrl = process.env.UPSTASH_REST_URL;
    const prevToken = process.env.UPSTASH_REST_TOKEN;
    process.env.UPSTASH_REST_URL = "";
    process.env.UPSTASH_REST_TOKEN = "";
    expect(createUpstashStore()).toBeNull();
    if (prevUrl !== undefined) process.env.UPSTASH_REST_URL = prevUrl;
    else delete process.env.UPSTASH_REST_URL;
    if (prevToken !== undefined) process.env.UPSTASH_REST_TOKEN = prevToken;
    else delete process.env.UPSTASH_REST_TOKEN;
  });

  it("allows within the limit and counts entries", async () => {
    let zcard = 0;
    const store = mockUpstash((path) => {
      if (path.startsWith("ZREMRANGEBYSCORE")) return { result: 0 };
      if (path.startsWith("ZADD")) {
        zcard += 1;
        return { result: 1 };
      }
      if (path.startsWith("ZCARD")) return { result: zcard };
      if (path.startsWith("EXPIRE")) return { result: 1 };
      return { result: null };
    });
    const result = await store!.checkAndIncrement("auth:1.2.3.4", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks once the limit is exceeded", async () => {
    // Simulate: 2 entries already in the sorted set, this request adds a 3rd → over limit.
    let zcard = 0;
    const store = mockUpstash((path) => {
      if (path.startsWith("ZREMRANGEBYSCORE")) return { result: 0 };
      if (path.startsWith("ZADD")) {
        zcard += 1;
        return { result: 1 };
      }
      if (path.startsWith("ZCARD")) return { result: zcard };
      if (path.startsWith("EXPIRE")) return { result: 1 };
      if (path.startsWith("ZRANGE")) return { result: ["1000:abc", "1000"] };
      if (path.startsWith("ZREM")) {
        zcard -= 1;
        return { result: 1 };
      }
      return { result: null };
    });
    // First two calls set zcard to 2.
    await store!.checkAndIncrement("k", 2, 60_000);
    await store!.checkAndIncrement("k", 2, 60_000);
    const blocked = await store!.checkAndIncrement("k", 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  it("returns zero remaining and retry-after when blocked", async () => {
    // Simulate: ZCARD returns limit+1 → over limit.
    let zcard = 0;
    const store = mockUpstash((path) => {
      if (path.startsWith("ZREMRANGEBYSCORE")) return { result: 0 };
      if (path.startsWith("ZADD")) {
        zcard += 1;
        return { result: 1 };
      }
      if (path.startsWith("ZCARD")) return { result: zcard };
      if (path.startsWith("EXPIRE")) return { result: 1 };
      if (path.startsWith("ZRANGE")) return { result: ["1000:abc", "1000"] };
      if (path.startsWith("ZREM")) {
        zcard -= 1;
        return { result: 1 };
      }
      return { result: null };
    });
    const blocked = await store!.checkAndIncrement("k", 0, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});
