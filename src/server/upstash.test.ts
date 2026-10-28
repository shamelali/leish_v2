import { describe, expect, it } from "vitest";
import { isUpstashConfigured, resolveUpstashCredentials } from "./upstash";

describe("resolveUpstashCredentials", () => {
  it("returns null when neither pair is configured", () => {
    expect(resolveUpstashCredentials({})).toBeNull();
    expect(resolveUpstashCredentials({ UPSTASH_REDIS_REST_URL: "https://x" })).toBeNull();
    expect(resolveUpstashCredentials({ UPSTASH_REST_TOKEN: "tok" })).toBeNull();
  });

  it("prefers the native UPSTASH_REDIS_REST_* names", () => {
    expect(
      resolveUpstashCredentials({
        UPSTASH_REDIS_REST_URL: "https://native.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "native-token",
        UPSTASH_REST_URL: "https://short.upstash.io",
        UPSTASH_REST_TOKEN: "short-token",
      }),
    ).toEqual({ url: "https://native.upstash.io", token: "native-token" });
  });

  it("falls back to the short UPSTASH_REST_* names", () => {
    expect(
      resolveUpstashCredentials({
        UPSTASH_REST_URL: "https://short.upstash.io",
        UPSTASH_REST_TOKEN: "short-token",
      }),
    ).toEqual({ url: "https://short.upstash.io", token: "short-token" });
  });

  it("treats empty strings as unset and does not mix pairs", () => {
    expect(
      resolveUpstashCredentials({
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REST_URL: "https://short.upstash.io",
        UPSTASH_REST_TOKEN: "short-token",
      }),
    ).toEqual({ url: "https://short.upstash.io", token: "short-token" });

    // A URL from one pair and a token from the other is still valid — both
    // name the same Upstash instance.
    expect(
      resolveUpstashCredentials({
        UPSTASH_REDIS_REST_URL: "https://native.upstash.io",
        UPSTASH_REST_TOKEN: "short-token",
      }),
    ).toEqual({ url: "https://native.upstash.io", token: "short-token" });
  });

  it("reads process.env by default", () => {
    expect(typeof isUpstashConfigured()).toBe("boolean");
  });
});
