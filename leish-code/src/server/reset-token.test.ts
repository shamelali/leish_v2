// @vitest-environment node

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import { invalidateResetTokens, storeResetToken, validateResetToken } from "./reset-token";

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

describe("reset tokens", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM password_resets").run();
  });

  it("stores and validates a token", async () => {
    const userId = await createTestUser();
    const token = await storeResetToken(userId);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(await validateResetToken(token)).toEqual({ userId });
  });

  it("is single-use", async () => {
    const userId = await createTestUser();
    const token = await storeResetToken(userId);
    expect(await validateResetToken(token)).not.toBeNull();
    expect(await validateResetToken(token)).toBeNull();
  });

  it("rejects an unknown token", async () => {
    const userId = await createTestUser();
    await storeResetToken(userId);
    expect(await validateResetToken("f".repeat(64))).toBeNull();
  });

  it("invalidates all tokens for a user", async () => {
    const userId = await createTestUser();
    const token = await storeResetToken(userId);
    await invalidateResetTokens(userId);
    expect(await validateResetToken(token)).toBeNull();
  });
});
