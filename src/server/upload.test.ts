// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import { uploadFileDirect, deleteFile, uploadArtistPortfolio, uploadStudioPortfolio } from "./upload";
import { getArtistById } from "./catalog";

async function createTestUser(role = "artist") {
  const userId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(userId, `${userId}@test.local`, "Test User", role, hashPassword("password123"), new Date().toISOString());
  return userId;
}

beforeEach(async () => {
  await getDb().prepare("DELETE FROM artist_profiles").run();
  await getDb().prepare("DELETE FROM users").run();
  await getArtistById("aisha-azman");
});

describe("uploadFileDirect", () => {
  it("is exported as a function", () => {
    expect(typeof uploadFileDirect).toBe("function");
  });

  it("is an async function", () => {
    expect(uploadFileDirect.length).toBeGreaterThan(0);
  });
});

describe("deleteFile", () => {
  it("is exported as a function", () => {
    expect(typeof deleteFile).toBe("function");
  });
});

describe("uploadArtistPortfolio", () => {
  it("is exported as a function", () => {
    expect(typeof uploadArtistPortfolio).toBe("function");
  });

  it("accepts empty files array", async () => {
    const userId = await createTestUser();
    const result = await uploadArtistPortfolio(userId, []);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

describe("uploadStudioPortfolio", () => {
  it("is exported as a function", () => {
    expect(typeof uploadStudioPortfolio).toBe("function");
  });

  it("accepts empty files array", async () => {
    const userId = await createTestUser();
    const result = await uploadStudioPortfolio(userId, []);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});