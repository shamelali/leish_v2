// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  invalidateVerificationTokens,
  storeVerificationToken,
  validateVerificationToken,
} from "./verify-email";

async function createTestUser() {
  const id = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      `${id}@test.local`,
      "Test User",
      "customer",
      hashPassword("password123"),
      new Date().toISOString(),
    );
  return id;
}

describe("email verification tokens", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM email_verifications").run();
  });

  it("stores and validates a token", async () => {
    const userId = await createTestUser();
    const token = await storeVerificationToken(userId);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(await validateVerificationToken(token)).toBe(userId);
  });

  it("rejects an unknown token", async () => {
    await createTestUser();
    expect(await validateVerificationToken("f".repeat(64))).toBeNull();
  });

  it("invalidates all tokens for a user", async () => {
    const userId = await createTestUser();
    const token = await storeVerificationToken(userId);
    await invalidateVerificationTokens(userId);
    expect(await validateVerificationToken(token)).toBeNull();
  });
});
