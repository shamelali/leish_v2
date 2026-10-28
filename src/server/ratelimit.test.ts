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
  /**
   * Mock the Upstash `/pipeline` endpoint. `handler` receives each command in
   * order and returns its result, so tests can model the sorted-set state.
   */
  function mockUpstashPipeline(handler: (command: string, args: (string | number)[]) => unknown) {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.upstash.io/pipeline");
      const commands = JSON.parse(String(init?.body)) as Array<[string, ...(string | number)[]]>;
      const body = commands.map(([command, ...args]) => ({ result: handler(command, args) }));
      return new Response(JSON.stringify(body), { status: 200 });
    });
    return createUpstashStore({
      url: "https://example.upstash.io/",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  }

  it("returns null without configuration", () => {
    vi.stubEnv("UPSTASH_REST_URL", "");
    vi.stubEnv("UPSTASH_REST_TOKEN", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(createUpstashStore()).toBeNull();
    vi.unstubAllEnvs();
  });

  it("accepts either Upstash env-var naming", () => {
    vi.stubEnv("UPSTASH_REST_URL", "");
    vi.stubEnv("UPSTASH_REST_TOKEN", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://native.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "native-token");
    expect(createUpstashStore()).not.toBeNull();
    vi.unstubAllEnvs();

    vi.stubEnv("UPSTASH_REST_URL", "https://short.upstash.io");
    vi.stubEnv("UPSTASH_REST_TOKEN", "short-token");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(createUpstashStore()).not.toBeNull();
    vi.unstubAllEnvs();
  });

  it("allows within the limit and counts entries", async () => {
    let zcard = 0;
    const store = mockUpstashPipeline((command) => {
      if (command === "ZADD") {
        zcard += 1;
        return 1;
      }
      if (command === "ZCARD") return zcard;
      return 0;
    });
    const result = await store!.checkAndIncrement("auth:1.2.3.4", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks once the limit is exceeded", async () => {
    // Simulate: 2 entries already in the sorted set, this request adds a 3rd → over limit.
    let zcard = 0;
    const store = mockUpstashPipeline((command) => {
      if (command === "ZADD") {
        zcard += 1;
        return 1;
      }
      if (command === "ZCARD") return zcard;
      if (command === "ZREM") {
        zcard -= 1;
        return 1;
      }
      if (command === "ZRANGE") return ["1000:abc", "1000"];
      return 0;
    });
    // First two calls set zcard to 2.
    await store!.checkAndIncrement("k", 2, 60_000);
    await store!.checkAndIncrement("k", 2, 60_000);
    const blocked = await store!.checkAndIncrement("k", 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  it("returns zero remaining and retry-after when blocked", async () => {
    const store = mockUpstashPipeline((command) => {
      if (command === "ZCARD") return 1; // over a limit of 0
      if (command === "ZRANGE") return ["1000:abc", "1000"];
      return 0;
    });
    const blocked = await store!.checkAndIncrement("k", 0, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("uses a single pipeline round trip on the allowed path", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify([{ result: 0 }, { result: 1 }, { result: 1 }, { result: 1 }]),
        { status: 200 },
      );
    });
    const store = createUpstashStore({
      url: "https://example.upstash.io",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })!;

    const result = await store.checkAndIncrement("k", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.method)).toBe("POST");
    expect(JSON.parse(String(init.body))).toHaveLength(4);
  });

  it("throws on HTTP errors and malformed pipeline responses", async () => {
    const failing = createUpstashStore({
      url: "https://example.upstash.io",
      token: "t",
      fetchImpl: vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch,
    })!;
    await expect(failing.checkAndIncrement("k", 1, 1000)).rejects.toThrow("Upstash error 500");

    const malformed = createUpstashStore({
      url: "https://example.upstash.io",
      token: "t",
      fetchImpl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    })!;
    await expect(malformed.checkAndIncrement("k", 1, 1000)).rejects.toThrow("malformed");
  });
});

describe("default rate limiter (env-driven store selection)", () => {
  function stubAllUpstashEnv(url: string, token: string) {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", url);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", token);
    vi.stubEnv("UPSTASH_REST_URL", "");
    vi.stubEnv("UPSTASH_REST_TOKEN", "");
  }

  it("uses the Upstash store when credentials are configured", async () => {
    stubAllUpstashEnv("https://example.upstash.io", "token");
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify([{ result: 0 }, { result: 1 }, { result: 1 }, { result: 1 }]),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchImpl);

    vi.resetModules();
    const { rateLimit } = await import("./ratelimit");
    const result = await rateLimit("default:upstash", 5, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back to memory when Upstash errors, then stops probing during the cooldown", async () => {
    stubAllUpstashEnv("https://example.upstash.io", "token");
    const fetchImpl = vi.fn(async () => new Response("upstash down", { status: 503 }));
    vi.stubGlobal("fetch", fetchImpl);

    vi.resetModules();
    const { rateLimit } = await import("./ratelimit");

    const first = await rateLimit("default:fallback", 2, 60_000);
    expect(first.allowed).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const second = await rateLimit("default:fallback", 2, 60_000);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    // Circuit breaker: no further Upstash calls during the cooldown.
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("stays on memory when Upstash is not configured", async () => {
    stubAllUpstashEnv("", "");
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    vi.resetModules();
    const { rateLimit } = await import("./ratelimit");
    expect((await rateLimit("default:memory", 5, 60_000)).allowed).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
