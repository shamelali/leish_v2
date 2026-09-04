// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import {
  getActiveEmailProvider,
  isEmailConfigured,
  isBillplzConfigured,
  isTurnstileConfigured,
  isSentryConfigured,
  areWebhooksConfigured,
  rateLimitMode,
  chatMode,
} from "./integrations";

describe("integrations", () => {
  const origEnv = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN,
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    BILLPLZ_API_KEY: process.env.BILLPLZ_API_KEY,
    BILLPLZ_COLLECTION_ID: process.env.BILLPLZ_COLLECTION_ID,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  };

  function clearAll() {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.POSTMARK_SERVER_TOKEN;
    delete process.env.BREVO_API_KEY;
    delete process.env.BILLPLZ_API_KEY;
    delete process.env.BILLPLZ_COLLECTION_ID;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.SENTRY_DSN;
    delete process.env.WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  }

  afterEach(() => {
    clearAll();
    Object.entries(origEnv).forEach(([key, value]) => {
      if (value !== undefined) process.env[key] = value;
      else delete process.env[key];
    });
  });

  describe("getActiveEmailProvider", () => {
    it("defaults to dev when nothing is configured", () => {
      clearAll();
      expect(getActiveEmailProvider()).toBe("dev");
    });

    it("returns explicit EMAIL_PROVIDER when set to valid value", () => {
      clearAll();
      process.env.EMAIL_PROVIDER = "resend";
      expect(getActiveEmailProvider()).toBe("resend");

      process.env.EMAIL_PROVIDER = "postmark";
      expect(getActiveEmailProvider()).toBe("postmark");

      process.env.EMAIL_PROVIDER = "brevo";
      expect(getActiveEmailProvider()).toBe("brevo");

      process.env.EMAIL_PROVIDER = "dev";
      expect(getActiveEmailProvider()).toBe("dev");
    });

    it("ignores invalid EMAIL_PROVIDER and auto-detects", () => {
      clearAll();
      process.env.EMAIL_PROVIDER = "ses";
      process.env.RESEND_API_KEY = "test-key";
      expect(getActiveEmailProvider()).toBe("resend");
    });

    it("auto-detects resend from RESEND_API_KEY", () => {
      clearAll();
      process.env.RESEND_API_KEY = "test-key";
      expect(getActiveEmailProvider()).toBe("resend");
    });

    it("auto-detects postmark from POSTMARK_SERVER_TOKEN", () => {
      clearAll();
      process.env.POSTMARK_SERVER_TOKEN = "test-token";
      expect(getActiveEmailProvider()).toBe("postmark");
    });

    it("auto-detects brevo from BREVO_API_KEY", () => {
      clearAll();
      process.env.BREVO_API_KEY = "test-key";
      expect(getActiveEmailProvider()).toBe("brevo");
    });

    it("prioritizes RESEND_API_KEY over POSTMARK_SERVER_TOKEN", () => {
      clearAll();
      process.env.RESEND_API_KEY = "test-key";
      process.env.POSTMARK_SERVER_TOKEN = "test-token";
      expect(getActiveEmailProvider()).toBe("resend");
    });

    it("prioritizes POSTMARK_SERVER_TOKEN over BREVO_API_KEY", () => {
      clearAll();
      process.env.POSTMARK_SERVER_TOKEN = "test-token";
      process.env.BREVO_API_KEY = "test-key";
      expect(getActiveEmailProvider()).toBe("postmark");
    });
  });

  describe("isEmailConfigured", () => {
    it("returns false when provider is dev", () => {
      clearAll();
      expect(isEmailConfigured()).toBe(false);
    });

    it("returns true when provider is resend", () => {
      clearAll();
      process.env.RESEND_API_KEY = "test-key";
      expect(isEmailConfigured()).toBe(true);
    });

    it("returns true when provider is postmark", () => {
      clearAll();
      process.env.POSTMARK_SERVER_TOKEN = "test-token";
      expect(isEmailConfigured()).toBe(true);
    });

    it("returns true when provider is brevo", () => {
      clearAll();
      process.env.BREVO_API_KEY = "test-key";
      expect(isEmailConfigured()).toBe(true);
    });

    it("returns true when EMAIL_PROVIDER is explicitly set to non-dev", () => {
      clearAll();
      process.env.EMAIL_PROVIDER = "resend";
      expect(isEmailConfigured()).toBe(true);
    });
  });

  describe("isBillplzConfigured", () => {
    it("returns false when either key is missing", () => {
      clearAll();
      expect(isBillplzConfigured()).toBe(false);

      process.env.BILLPLZ_API_KEY = "key";
      expect(isBillplzConfigured()).toBe(false);

      clearAll();
      process.env.BILLPLZ_COLLECTION_ID = "collection";
      expect(isBillplzConfigured()).toBe(false);
    });

    it("returns true when both keys are present", () => {
      clearAll();
      process.env.BILLPLZ_API_KEY = "key";
      process.env.BILLPLZ_COLLECTION_ID = "collection";
      expect(isBillplzConfigured()).toBe(true);
    });
  });

  describe("isTurnstileConfigured", () => {
    it("returns false when site key is missing", () => {
      clearAll();
      expect(isTurnstileConfigured()).toBe(false);
    });

    it("returns true when site key is present", () => {
      clearAll();
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
      expect(isTurnstileConfigured()).toBe(true);
    });
  });

  describe("isSentryConfigured", () => {
    it("returns false when DSN is missing", () => {
      clearAll();
      expect(isSentryConfigured()).toBe(false);
    });

    it("returns true when DSN is present", () => {
      clearAll();
      process.env.SENTRY_DSN = "https://key@host/1";
      expect(isSentryConfigured()).toBe(true);
    });
  });

  describe("areWebhooksConfigured", () => {
    it("returns false when no webhook secrets are set", () => {
      clearAll();
      expect(areWebhooksConfigured()).toBe(false);
    });

    it("returns true when WEBHOOK_SECRET is set", () => {
      clearAll();
      process.env.WEBHOOK_SECRET = "secret";
      expect(areWebhooksConfigured()).toBe(true);
    });

    it("returns true when STRIPE_WEBHOOK_SECRET is set", () => {
      clearAll();
      process.env.STRIPE_WEBHOOK_SECRET = "stripe-secret";
      expect(areWebhooksConfigured()).toBe(true);
    });
  });

  describe("rateLimitMode and chatMode", () => {
    it("are always memory", () => {
      expect(rateLimitMode).toBe("memory");
      expect(chatMode).toBe("memory");
    });
  });
});
