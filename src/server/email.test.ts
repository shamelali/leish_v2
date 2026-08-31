// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { activeEmailProvider, isEmailEnabled, retryFailedEmails, sendEmail } from "./email";

const OUTBOX =
  "INSERT INTO email_outbox (id, to_email, subject, text, html, created_at) VALUES (?, ?, ?, ?, ?, ?)";

async function seedUserWithPrefs(prefs?: Partial<Record<string, number>>): Promise<string> {
  const userId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, 'customer', 'x', ?)",
    )
    .run(userId, `${userId}@test.local`, "Email User", new Date().toISOString());
  if (prefs) {
    await getDb()
      .prepare(
        `INSERT INTO email_preferences (user_id, booking_created, quotation_sent, invoice_sent, quotation_expiry, balance_reminder, status_changed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        prefs.booking_created ?? 1,
        prefs.quotation_sent ?? 1,
        prefs.invoice_sent ?? 1,
        prefs.quotation_expiry ?? 1,
        prefs.balance_reminder ?? 1,
        prefs.status_changed ?? 1,
        new Date().toISOString(),
      );
  }
  return userId;
}

describe("email service", () => {
  const origProvider = process.env.EMAIL_PROVIDER;

  beforeEach(async () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.POSTMARK_SERVER_TOKEN;
    delete process.env.BREVO_API_KEY;
    delete process.env.EMAIL_FROM;
    await getDb().prepare("DELETE FROM email_outbox").run();
    await getDb().prepare("DELETE FROM email_retries").run();
    await getDb().prepare("DELETE FROM email_preferences").run();
    await getDb().prepare("DELETE FROM users").run();
  });

  afterEach(() => {
    if (origProvider !== undefined) process.env.EMAIL_PROVIDER = origProvider;
    else delete process.env.EMAIL_PROVIDER;
  });

  describe("activeEmailProvider", () => {
    it("defaults to dev", () => {
      expect(activeEmailProvider()).toBe("dev");
    });
    it("honours resend/postmark/brevo when configured", () => {
      process.env.EMAIL_PROVIDER = "resend";
      expect(activeEmailProvider()).toBe("resend");
      process.env.EMAIL_PROVIDER = "postmark";
      expect(activeEmailProvider()).toBe("postmark");
      process.env.EMAIL_PROVIDER = "brevo";
      expect(activeEmailProvider()).toBe("brevo");
    });
    it("falls back to dev for unknown providers", () => {
      process.env.EMAIL_PROVIDER = "ses";
      expect(activeEmailProvider()).toBe("dev");
    });
    it("auto-detects resend/postmark/brevo from credentials when EMAIL_PROVIDER is unset", () => {
      process.env.RESEND_API_KEY = "test-key";
      expect(activeEmailProvider()).toBe("resend");
      delete process.env.RESEND_API_KEY;
      process.env.POSTMARK_SERVER_TOKEN = "test-token";
      expect(activeEmailProvider()).toBe("postmark");
      delete process.env.POSTMARK_SERVER_TOKEN;
      process.env.BREVO_API_KEY = "test-key";
      expect(activeEmailProvider()).toBe("brevo");
    });
  });

  describe("dev provider", () => {
    it("queues messages into the outbox", async () => {
      await sendEmail({ to: "a@b.c", subject: "Hi", text: "body", html: "<p>body</p>" });
      const row = (await getDb()
        .prepare("SELECT to_email, subject, text, html FROM email_outbox")
        .get()) as Record<string, string>;
      expect(row.to_email).toBe("a@b.c");
      expect(row.subject).toBe("Hi");
      expect(row.html).toBe("<p>body</p>");
    });
  });

  describe("provider fallback", () => {
    it.each(["resend", "postmark", "brevo"] as const)(
      "%s without a key falls back to the dev outbox",
      async (provider) => {
        process.env.EMAIL_PROVIDER = provider;
        await sendEmail({ to: "a@b.c", subject: "Fallback", text: "x" });
        const row = (await getDb().prepare("SELECT subject FROM email_outbox").get()) as
          { subject: string } | undefined;
        expect(row?.subject).toBe("Fallback");
      },
    );

    it("sends via resend and does not touch the outbox", async () => {
      process.env.EMAIL_PROVIDER = "resend";
      process.env.RESEND_API_KEY = "test-key";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;
      try {
        await sendEmail({ to: "a@b.c", subject: "Resend!", text: "x" });
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "https://api.resend.com/emails",
          expect.objectContaining({ method: "POST" }),
        );
        expect(await getDb().prepare("SELECT COUNT(*) AS c FROM email_outbox").get()).toMatchObject(
          {
            c: 0,
          },
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("sends via postmark and does not touch the outbox", async () => {
      process.env.EMAIL_PROVIDER = "postmark";
      process.env.POSTMARK_SERVER_TOKEN = "test-token";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;
      try {
        await sendEmail({ to: "a@b.c", subject: "Postmark!", text: "x" });
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "https://api.postmarkapp.com/email",
          expect.objectContaining({ method: "POST" }),
        );
        expect(await getDb().prepare("SELECT COUNT(*) AS c FROM email_outbox").get()).toMatchObject(
          {
            c: 0,
          },
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("sends via brevo and does not touch the outbox", async () => {
      process.env.EMAIL_PROVIDER = "brevo";
      process.env.BREVO_API_KEY = "test-key";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;
      try {
        await sendEmail({ to: "a@b.c", subject: "Brevo!", text: "x" });
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "https://api.brevo.com/v3/smtp/email",
          expect.objectContaining({ method: "POST" }),
        );
        expect(await getDb().prepare("SELECT COUNT(*) AS c FROM email_outbox").get()).toMatchObject(
          {
            c: 0,
          },
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("queues a resend failure for retry and rethrows", async () => {
      process.env.EMAIL_PROVIDER = "resend";
      process.env.RESEND_API_KEY = "test-key";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("boom"),
      }) as typeof fetch;
      try {
        await expect(sendEmail({ to: "a@b.c", subject: "Fail", text: "x" })).rejects.toThrow(
          "Failed to send email",
        );
        const row = (await getDb()
          .prepare("SELECT to_email, attempts, max_attempts FROM email_retries")
          .get()) as Record<string, number>;
        expect(row.to_email).toBe("a@b.c");
        expect(row.max_attempts).toBe(3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("queues a postmark failure for retry and rethrows", async () => {
      process.env.EMAIL_PROVIDER = "postmark";
      process.env.POSTMARK_SERVER_TOKEN = "test-token";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("boom"),
      }) as typeof fetch;
      try {
        await expect(sendEmail({ to: "a@b.c", subject: "Fail", text: "x" })).rejects.toThrow(
          "Failed to send email",
        );
        const row = (await getDb()
          .prepare("SELECT to_email, attempts, max_attempts FROM email_retries")
          .get()) as Record<string, number>;
        expect(row.to_email).toBe("a@b.c");
        expect(row.max_attempts).toBe(3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("queues a brevo failure for retry and rethrows", async () => {
      process.env.EMAIL_PROVIDER = "brevo";
      process.env.BREVO_API_KEY = "test-key";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("boom"),
      }) as typeof fetch;
      try {
        await expect(sendEmail({ to: "a@b.c", subject: "Fail", text: "x" })).rejects.toThrow(
          "Failed to send email",
        );
        const row = (await getDb()
          .prepare("SELECT to_email, attempts, max_attempts FROM email_retries")
          .get()) as Record<string, number>;
        expect(row.to_email).toBe("a@b.c");
        expect(row.max_attempts).toBe(3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("isEmailEnabled", () => {
    it("returns true by default when no preference record exists", async () => {
      const userId = randomUUID();
      expect(await isEmailEnabled(userId, "booking_created")).toBe(true);
    });

    it("respects disabled preferences", async () => {
      const userId = await seedUserWithPrefs({ status_changed: 0, balance_reminder: 1 });
      expect(await isEmailEnabled(userId, "status_changed")).toBe(false);
      expect(await isEmailEnabled(userId, "balance_reminder")).toBe(true);
    });
  });

  describe("retryFailedEmails", () => {
    it("retries due failures and clears them on success", async () => {
      // A row that will succeed once EMAIL_PROVIDER falls back to dev.
      await getDb()
        .prepare(OUTBOX)
        .run(randomUUID(), "placeholder", "placeholder", "", null, new Date().toISOString());
      await getDb().prepare("DELETE FROM email_outbox").run();

      const past = new Date(Date.now() - 120_000).toISOString();
      await getDb()
        .prepare(
          `INSERT INTO email_retries (id, to_email, subject, text, html, attempts, max_attempts, next_retry, last_error, created_at)
           VALUES (?, 'r@x.y', 'Retry me', 'txt', NULL, 0, 3, ?, 'earlier error', ?)`,
        )
        .run(randomUUID(), past, new Date().toISOString());

      const result = await retryFailedEmails();
      expect(result.retried).toBe(1);
      const left = (await getDb().prepare("SELECT COUNT(*) AS c FROM email_retries").get()) as {
        c: number;
      };
      expect(left.c).toBe(0);

      const outbox = (await getDb().prepare("SELECT COUNT(*) AS c FROM email_outbox").get()) as {
        c: number;
      };
      expect(outbox.c).toBe(1); // delivered via dev fallback
    });

    it("backs off exponentially when a retry fails again", async () => {
      process.env.EMAIL_PROVIDER = "postmark";
      process.env.POSTMARK_SERVER_TOKEN = "tok";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve("down"),
      }) as typeof fetch;
      try {
        const past = new Date(Date.now() - 60_000).toISOString();
        await getDb()
          .prepare(
            `INSERT INTO email_retries (id, to_email, subject, text, html, attempts, max_attempts, next_retry, last_error, created_at)
             VALUES (?, 'f@x.y', 'Still down', 'txt', NULL, 0, 3, ?, 'err', ?)`,
          )
          .run(randomUUID(), past, new Date().toISOString());

        const result = await retryFailedEmails();
        expect(result.failed).toBe(1);
        const row = (await getDb()
          .prepare("SELECT attempts, next_retry FROM email_retries")
          .get()) as { attempts: number; next_retry: string };
        expect(row.attempts).toBe(1);
        // backoff = 5^1 minutes after attempt #1
        const expectedMin = Date.now() + 5 * 60_000 - 5_000;
        expect(new Date(row.next_retry).getTime()).toBeGreaterThan(expectedMin);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("ignores rows not yet due or already exhausted", async () => {
      const future = new Date(Date.now() + 600_000).toISOString();
      const past = new Date(Date.now() - 60_000).toISOString();
      const now = new Date().toISOString();
      await getDb()
        .prepare(
          `INSERT INTO email_retries (id, to_email, subject, text, html, attempts, max_attempts, next_retry, last_error, created_at)
           VALUES (?, 'n@x.y', 'Not due', 't', NULL, 0, 3, ?, '', ?),
                   ('exhausted-id', 'e@x.y', 'Exhausted', 't', NULL, 3, 3, ?, '', ?)`,
        )
        .run(randomUUID(), future, now, past, now);

      const result = await retryFailedEmails();
      expect(result.retried).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
