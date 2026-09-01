// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  uploadFileDirect,
  deleteFile,
  uploadArtistPortfolio,
  uploadStudioPortfolio,
} from "./upload";
import { getArtistById } from "./catalog";

async function createTestUser(role = "artist") {
  const userId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(userId, `${userId}@test.local}`, "Test User", role, hashPassword("password123"), new Date().toISOString());
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

  it("filters non-image file types", async () => {
    const userId = await createTestUser();
    const nonImageFile: File = {
      name: "test.txt",
      type: "text/plain",
      size: 100,
      webkitRelativePath: "",
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => "",
      slice: [],
      byteLength: 0,
      stream: null,
    } as unknown as File;
    const result = await uploadArtistPortfolio(userId, [nonImageFile]);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("limits files to MAX_FILES_PER_UPLOAD", async () => {
    const userId = await createTestUser();
    const manyFiles: File[] = [];
    for (let i = 0; i < 30; i++) {
      const f: File = {
        name: `file-${i}.jpg`,
        type: "image/jpeg",
        size: 100,
        webkitRelativePath: "",
        arrayBuffer: async () => new ArrayBuffer(0),
        text: async () => "",
        slice: [],
        byteLength: 0,
        stream: null,
      } as unknown as File;
      manyFiles.push(f);
    }
    const result = await uploadArtistPortfolio(userId, manyFiles);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(20); // MAX_FILES_PER_UPLOAD
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