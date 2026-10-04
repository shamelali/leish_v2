import { describe, expect, it } from "vitest";

import {
  CONTENT_SECURITY_POLICY_HEADER,
  CSP_NONCE_HEADER,
  buildContentSecurityPolicy,
  generateNonce,
} from "./csp";

/** Split a policy string into `{ directiveName: "rest of directive" }`. */
function parseDirectives(csp: string): Record<string, string> {
  return Object.fromEntries(
    csp.split(";").map((directive) => {
      const [name, ...values] = directive.trim().split(/\s+/);
      return [name, values.join(" ")];
    }),
  );
}

describe("header constants", () => {
  it("uses the header names the proxy and the layout agree on", () => {
    expect(CSP_NONCE_HEADER).toBe("x-nonce");
    expect(CONTENT_SECURITY_POLICY_HEADER).toBe("Content-Security-Policy");
  });
});

describe("generateNonce", () => {
  it("returns a 22-character unpadded base64 string", () => {
    const nonce = generateNonce();
    // 16 bytes of entropy -> 22 base64 chars once the "=" padding is stripped.
    expect(nonce).toHaveLength(22);
    expect(nonce).not.toContain("=");
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+$/);
  });

  it("never repeats across requests", () => {
    const nonces = new Set(Array.from({ length: 500 }, () => generateNonce()));
    expect(nonces.size).toBe(500);
  });
});

describe("buildContentSecurityPolicy", () => {
  const nonce = "TESTNONCE0123456789ab";

  it("emits the fallback and hardening directives", () => {
    const policy = buildContentSecurityPolicy({ nonce });
    const directives = parseDirectives(policy);

    expect(directives["default-src"]).toBe("'self'");
    expect(directives["frame-ancestors"]).toBe("'none'");
    expect(directives["object-src"]).toBe("'none'");
    expect(directives["base-uri"]).toBe("'self'");
    expect(directives["form-action"]).toBe("'self'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("admits scripts by nonce and strict-dynamic, never by unsafe-inline", () => {
    const directives = parseDirectives(buildContentSecurityPolicy({ nonce }));

    expect(directives["script-src"]).toContain(`'nonce-${nonce}'`);
    expect(directives["script-src"]).toContain("'strict-dynamic'");
    // The whole point of the nonce: no blanket inline execution.
    expect(directives["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("places the nonce in script-src exactly once", () => {
    const policy = buildContentSecurityPolicy({ nonce });
    const occurrences = policy.split(`'nonce-${nonce}'`).length - 1;
    expect(occurrences).toBe(1);
  });

  it("allows the Turnstile origin for scripts, frames and connections", () => {
    const directives = parseDirectives(buildContentSecurityPolicy({ nonce }));

    expect(directives["script-src"]).toContain("https://challenges.cloudflare.com");
    expect(directives["frame-src"]).toBe("https://challenges.cloudflare.com");
    expect(directives["connect-src"]).toContain("https://challenges.cloudflare.com");
  });

  it("omits dev-only relaxations in production", () => {
    const policy = buildContentSecurityPolicy({ nonce, isDev: false });

    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("ws:");
  });

  it("adds unsafe-eval and ws: only in development", () => {
    const policy = buildContentSecurityPolicy({ nonce, isDev: true });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("ws:");
  });

  it("is deterministic for a given nonce and environment", () => {
    expect(buildContentSecurityPolicy({ nonce, isDev: false })).toBe(
      buildContentSecurityPolicy({ nonce, isDev: false }),
    );
  });
});
