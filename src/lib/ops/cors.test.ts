import { describe, expect, it } from "vitest";
import { allowedOrigins, corsHeaders, isAllowedOrigin } from "./cors";

const env = (e: Record<string, string> = {}) =>
  ({ NODE_ENV: "production", ...e }) as NodeJS.ProcessEnv;

describe("isAllowedOrigin", () => {
  it("allows both the apex and www domains", () => {
    expect(isAllowedOrigin("https://leish.my", env())).toBe(true);
    expect(isAllowedOrigin("https://www.leish.my", env())).toBe(true);
  });

  it("rejects unknown, http, and look-alike origins", () => {
    expect(isAllowedOrigin(null, env())).toBe(false);
    expect(isAllowedOrigin("https://evil.com", env())).toBe(false);
    expect(isAllowedOrigin("http://leish.my", env())).toBe(false);
    expect(isAllowedOrigin("https://leish.my.evil.com", env())).toBe(false);
  });

  it("supports extra origins from CORS_ALLOWED_ORIGINS and ALLOWED_ORIGINS", () => {
    const e1 = env({ CORS_ALLOWED_ORIGINS: "https://artist.leish.my/, https://studio.leish.my" });
    expect(isAllowedOrigin("https://artist.leish.my", e1)).toBe(true);
    expect(isAllowedOrigin("https://studio.leish.my", e1)).toBe(true);

    const e2 = env({ ALLOWED_ORIGINS: "https://partner.leish.my/" });
    expect(isAllowedOrigin("https://partner.leish.my", e2)).toBe(true);
  });

  it("rejects unknown, http, look-alike, and worker-preview origins", () => {
    expect(isAllowedOrigin("https://leish-my.shamelali.workers.dev", env())).toBe(false);
  });

  it("allows localhost only in development", () => {
    expect(isAllowedOrigin("http://localhost:3000", env())).toBe(false);
    expect(isAllowedOrigin("http://localhost:3000", env({ NODE_ENV: "development" }))).toBe(true);
    expect(allowedOrigins(env({ NODE_ENV: "development" }))).toContain("http://localhost:3000");
  });
});

describe("corsHeaders", () => {
  it("echoes the origin and varies on it", () => {
    const h = corsHeaders("https://leish.my");
    expect(h["Access-Control-Allow-Origin"]).toBe("https://leish.my");
    expect(h.Vary).toBe("Origin");
  });
});
