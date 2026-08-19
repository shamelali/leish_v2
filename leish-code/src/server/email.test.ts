// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import { activeEmailProvider, sendEmail } from "./email";

describe("email service (dev provider)", () => {
  it("defaults to the dev provider", async () => {
    expect(activeEmailProvider()).toBe("dev");
  });

  it("stores messages in the outbox", async () => {
    await sendEmail({ to: "a@b.com", subject: "Hi", text: "Hello!" });
    const row = (await getDb()
      .prepare("SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT 1")
      .get()) as { to_email: string; subject: string; text: string };
    expect(row.to_email).toBe("a@b.com");
    expect(row.subject).toBe("Hi");
    expect(row.text).toBe("Hello!");
  });
});
