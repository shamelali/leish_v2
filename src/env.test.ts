// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateEnv } from "./env";

/**
 * `validateEnv()` is the only thing standing between a misconfigured deploy
 * and a server that boots happily while collecting no money, writing to an
 * ephemeral SQLite file, or exposing its cron endpoints. These tests pin the
 * production contract so it cannot be relaxed by accident.
 */

const KEYS = [
  "NEXT_PHASE",
  "SKIP_ENV_VALIDATION",
  "VERCEL_ENV",
  "SESSION_SECRET",
  "DATABASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "CRON_SECRET",
  "BILLPLZ_API_KEY",
  "BILLPLZ_COLLECTION_ID",
  "PAYMENTS_ALLOW_DEV",
  "EMAIL_PROVIDER",
  "EMAIL_ALLOW_DEV",
  "RESEND_API_KEY",
  "POSTMARK_SERVER_TOKEN",
  "BREVO_API_KEY",
] as const;

let snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  snapshot = {};
  for (const key of KEYS) snapshot[key] = process.env[key];
  vi.spyOn(console, "warn").mockImplementation(() => {});

  // A complete production environment; individual tests remove one piece.
  // `NODE_ENV` is typed read-only, so it is stubbed rather than assigned.
  vi.stubEnv("NODE_ENV", "production");
  delete process.env.NEXT_PHASE;
  delete process.env.SKIP_ENV_VALIDATION;
  delete process.env.VERCEL_ENV;
  process.env.SESSION_SECRET = "s".repeat(44);
  process.env.DATABASE_URL = "postgres://localhost:5432/leish_test";
  process.env.NEXT_PUBLIC_SITE_URL = "https://leish.my";
  process.env.CRON_SECRET = "cron-secret";
  process.env.BILLPLZ_API_KEY = "billplz-key";
  process.env.BILLPLZ_COLLECTION_ID = "billplz-collection";
  delete process.env.PAYMENTS_ALLOW_DEV;
  // Baseline: email delivery is configured through a provider credential.
  delete process.env.EMAIL_PROVIDER;
  process.env.RESEND_API_KEY = "resend-key";
  delete process.env.POSTMARK_SERVER_TOKEN;
  delete process.env.BREVO_API_KEY;
  delete process.env.EMAIL_ALLOW_DEV;
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe("validateEnv — production contract", () => {
  it("accepts a complete production configuration", () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it("fails when DATABASE_URL is missing", () => {
    // Without it the app silently falls back to an ephemeral SQLite file.
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });

  it("fails when NEXT_PUBLIC_SITE_URL is missing", () => {
    // Payment callbacks and verification links are built from it.
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("fails when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;
    expect(() => validateEnv()).toThrow(/CRON_SECRET/);
  });

  it("lists every missing required variable in one error", () => {
    delete process.env.SESSION_SECRET;
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).toThrow(/SESSION_SECRET.*DATABASE_URL/);
  });
});

describe("validateEnv — payment configuration", () => {
  it("fails when only one Billplz value is set", () => {
    // Half-configured Billplz silently falls back to the dev provider, which
    // records payments without ever collecting money.
    delete process.env.BILLPLZ_COLLECTION_ID;
    expect(() => validateEnv()).toThrow(/must be set together/);
  });

  it("fails when Billplz is absent and dev payments were not allowed", () => {
    delete process.env.BILLPLZ_API_KEY;
    delete process.env.BILLPLZ_COLLECTION_ID;
    expect(() => validateEnv()).toThrow(/PAYMENTS_ALLOW_DEV/);
  });

  it("allows an explicit opt-out of bill collection", () => {
    delete process.env.BILLPLZ_API_KEY;
    delete process.env.BILLPLZ_COLLECTION_ID;
    process.env.PAYMENTS_ALLOW_DEV = "1";
    expect(() => validateEnv()).not.toThrow();
  });
});

describe("validateEnv — email configuration", () => {
  it("fails when no email provider or credential is configured", () => {
    // Silent dev outbox in production = customers never receive links.
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    expect(() => validateEnv()).toThrow(/EMAIL_ALLOW_DEV/);
  });

  it("fails when EMAIL_PROVIDER=dev was chosen explicitly", () => {
    process.env.EMAIL_PROVIDER = "dev";
    expect(() => validateEnv()).toThrow(/EMAIL_ALLOW_DEV/);
  });

  it("allows an explicit opt-out of email delivery", () => {
    process.env.EMAIL_PROVIDER = "dev";
    process.env.EMAIL_ALLOW_DEV = "1";
    expect(() => validateEnv()).not.toThrow();
  });

  it("accepts a provider selected by its API key", () => {
    process.env.EMAIL_PROVIDER = "brevo";
    process.env.BREVO_API_KEY = "brevo-key";
    expect(() => validateEnv()).not.toThrow();
  });
});

describe("validateEnv — when the strict contract does not apply", () => {
  it("skips validation for Vercel preview deployments", () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).not.toThrow();
  });

  it("skips validation during the build phase", () => {
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).not.toThrow();
  });

  it("skips validation when SKIP_ENV_VALIDATION is set", () => {
    process.env.SKIP_ENV_VALIDATION = "1";
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).not.toThrow();
  });

  it("skips validation outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).not.toThrow();
  });
});

describe("validateEnv — recommended variables warn without blocking", () => {
  it("warns about missing observability and email configuration", () => {
    expect(() => validateEnv()).not.toThrow();
    const warned = vi
      .mocked(console.warn)
      .mock.calls.map((call) => String(call[0]))
      .join("\n");
    expect(warned).toContain("SENTRY_DSN");
    expect(warned).toContain("EMAIL_FROM");
  });
});
