// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { activeEmailProvider, sendEmail } from "./email";

describe("activeEmailProvider", () => {
  const origEnv = process.env.EMAIL_PROVIDER;

  afterEach(() => {
    if (origEnv === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = origEnv;
  });

  it("returns dev when EMAIL_PROVIDER is not set", () => {
    delete process.env.EMAIL_PROVIDER;
    expect(activeEmailProvider()).toBe("dev");
  });

  it("returns dev for unrecognized values", () => {
    process.env.EMAIL_PROVIDER = "unknown";
    expect(activeEmailProvider()).toBe("dev");
  });

  it("returns resend when set", () => {
    process.env.EMAIL_PROVIDER = "resend";
    expect(activeEmailProvider()).toBe("resend");
  });

  it("returns postmark when set", () => {
    process.env.EMAIL_PROVIDER = "postmark";
    expect(activeEmailProvider()).toBe("postmark");
  });
});

describe("sendEmail fallback paths", () => {
  const origProvider = process.env.EMAIL_PROVIDER;
  const origResendKey = process.env.RESEND_API_KEY;
  const origPostmarkToken = process.env.POSTMARK_SERVER_TOKEN;

  afterEach(() => {
    if (origProvider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = origProvider;
    if (origResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = origResendKey;
    if (origPostmarkToken === undefined) delete process.env.POSTMARK_SERVER_TOKEN;
    else process.env.POSTMARK_SERVER_TOKEN = origPostmarkToken;
  });

  it("falls back to dev when resend is configured but RESEND_API_KEY is missing", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    delete process.env.RESEND_API_KEY;
    await sendEmail({ to: "test@x.com", subject: "Hi", text: "Hello" });
    // Should not throw — falls back to dev outbox
  });

  it("falls back to dev when postmark is configured but POSTMARK_SERVER_TOKEN is missing", async () => {
    process.env.EMAIL_PROVIDER = "postmark";
    delete process.env.POSTMARK_SERVER_TOKEN;
    await sendEmail({ to: "test@x.com", subject: "Hi", text: "Hello" });
    // Should not throw — falls back to dev outbox
  });

  it("uses dev provider by default", async () => {
    delete process.env.EMAIL_PROVIDER;
    await sendEmail({ to: "default@x.com", subject: "Test", text: "Body" });
    // Should succeed with dev outbox
  });
});
