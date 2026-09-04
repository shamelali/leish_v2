// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import { createSessionToken } from "./session";

/**
 * Object storage is stubbed so these tests exercise the validation and
 * authorization logic in upload.ts without touching Vercel Blob / S3.
 */
const uploadObject = vi.fn(async () => undefined);
const deleteObject = vi.fn(async () => undefined);
const objectExists = vi.fn(async () => true);

vi.mock("@/lib/storage", () => ({
  uploadObject: (...args: unknown[]) => uploadObject(...(args as [])),
  deleteObject: (...args: unknown[]) => deleteObject(...(args as [])),
  objectExists: (...args: unknown[]) => objectExists(...(args as [])),
  generateKey: (prefix: string, filename: string) => `${prefix}/${filename}`,
  STORAGE_PREFIXES: {
    artistPortfolio: "artists/portfolio",
    studioPortfolio: "studios/portfolio",
  },
}));

const {
  uploadFileDirect,
  deleteFile,
  uploadArtistPortfolio,
  uploadStudioPortfolio,
  sanitizeFilename,
  MAX_FILE_SIZE,
} = await import("./upload");

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Bytes that satisfy the magic-byte check for each accepted image type. */
const MAGIC: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

function validImage(type: string, padTo = 32): Buffer {
  const sig = MAGIC[type]!;
  return Buffer.concat([Buffer.from(sig), Buffer.alloc(Math.max(0, padTo - sig.length))]);
}

/** A minimal File stand-in — upload.ts only reads name/type/arrayBuffer. */
function fakeFile(name: string, type: string, body: Buffer): File {
  return {
    name,
    type,
    size: body.length,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
  } as unknown as File;
}

async function createTestUser(role = "artist"): Promise<string> {
  const userId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      userId,
      `${userId}@test.local`,
      "Test User",
      role,
      hashPassword("password123"),
      new Date().toISOString(),
    );
  return userId;
}

async function authedRequest(userId: string, body: unknown): Promise<Request> {
  const token = await createSessionToken({
    sub: userId,
    email: `${userId}@test.local`,
    name: "Test User",
    role: "artist",
  });
  return new Request("http://localhost/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `leish_session=${token}` },
    body: JSON.stringify(body),
  });
}

function anonRequest(body: unknown): Request {
  return new Request("http://localhost/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  uploadObject.mockClear();
  deleteObject.mockClear();
  objectExists.mockClear().mockResolvedValue(true);
  await getDb().prepare("DELETE FROM artist_profiles").run();
  await getDb().prepare("DELETE FROM users").run();
});

// ── sanitizeFilename ─────────────────────────────────────────────────────────

describe("sanitizeFilename", () => {
  it("strips path separators so a name cannot escape its prefix", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilename("a\\b.jpg")).toBe("a_b.jpg");
  });

  it("removes NUL bytes", () => {
    expect(sanitizeFilename("shell\0.jpg")).toBe("shell.jpg");
  });

  it("collapses repeated dots that could form a traversal segment", () => {
    expect(sanitizeFilename("photo..jpg")).toBe("photo.jpg");
  });

  it("replaces shell and Windows-reserved characters", () => {
    expect(sanitizeFilename('a<b>c"d|e?f*g.jpg')).toBe("a_b_c_d_e_f_g.jpg");
  });

  it("truncates to 100 characters", () => {
    expect(sanitizeFilename("x".repeat(250))).toHaveLength(100);
  });
});

// ── uploadFileDirect ─────────────────────────────────────────────────────────

describe("uploadFileDirect", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await uploadFileDirect(
      anonRequest({ key: "k.jpg", contentType: "image/jpeg", base64Data: "AAAA" }),
    );
    expect(res.status).toBe(401);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("rejects a session whose user no longer exists with 401", async () => {
    const req = await authedRequest(randomUUID(), {
      key: "k.jpg",
      contentType: "image/jpeg",
      base64Data: validImage("image/jpeg").toString("base64"),
    });
    const res = await uploadFileDirect(req);
    expect(res.status).toBe(401);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("rejects a disallowed content type with 400", async () => {
    const userId = await createTestUser();
    const req = await authedRequest(userId, {
      key: "evil.svg",
      contentType: "image/svg+xml",
      base64Data: Buffer.from("<svg/>").toString("base64"),
    });
    const res = await uploadFileDirect(req);
    expect(res.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("rejects a missing key with 400", async () => {
    const userId = await createTestUser();
    const req = await authedRequest(userId, {
      key: "",
      contentType: "image/jpeg",
      base64Data: validImage("image/jpeg").toString("base64"),
    });
    expect((await uploadFileDirect(req)).status).toBe(400);
  });

  it("rejects a payload whose bytes contradict the declared type", async () => {
    const userId = await createTestUser();
    // PNG magic bytes declared as JPEG — the classic polyglot upload.
    const req = await authedRequest(userId, {
      key: "spoof.jpg",
      contentType: "image/jpeg",
      base64Data: validImage("image/png").toString("base64"),
    });
    const res = await uploadFileDirect(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "File content does not match declared type",
    });
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("rejects a file over the 10 MB limit before touching storage", async () => {
    const userId = await createTestUser();
    const tooBig = Buffer.concat([
      Buffer.from(MAGIC["image/jpeg"]!),
      Buffer.alloc(MAX_FILE_SIZE + 1),
    ]);
    const req = await authedRequest(userId, {
      key: "big.jpg",
      contentType: "image/jpeg",
      base64Data: tooBig.toString("base64"),
    });
    const res = await uploadFileDirect(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "File too large (max 10 MB)" });
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("stores a valid image and returns its key", async () => {
    const userId = await createTestUser();
    const bytes = validImage("image/png");
    const req = await authedRequest(userId, {
      key: "artists/portfolio/ok.png",
      contentType: "image/png",
      base64Data: bytes.toString("base64"),
    });

    const res = await uploadFileDirect(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ key: "artists/portfolio/ok.png" });

    expect(uploadObject).toHaveBeenCalledTimes(1);
    const [key, buffer, contentType] = uploadObject.mock.calls[0] as unknown as [
      string,
      Buffer,
      string,
    ];
    expect(key).toBe("artists/portfolio/ok.png");
    expect(contentType).toBe("image/png");
    expect(Buffer.from(buffer).subarray(0, 4)).toEqual(Buffer.from(MAGIC["image/png"]!));
  });

  it("returns 500 when the storage backend throws", async () => {
    const userId = await createTestUser();
    uploadObject.mockRejectedValueOnce(new Error("blob unreachable"));
    const req = await authedRequest(userId, {
      key: "ok.png",
      contentType: "image/png",
      base64Data: validImage("image/png").toString("base64"),
    });
    const res = await uploadFileDirect(req);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Upload failed" });
  });
});

// ── deleteFile ───────────────────────────────────────────────────────────────

describe("deleteFile", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await deleteFile(anonRequest({ key: "k.jpg" }));
    expect(res.status).toBe(401);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("rejects a missing key with 400", async () => {
    const userId = await createTestUser();
    const res = await deleteFile(await authedRequest(userId, { key: "" }));
    expect(res.status).toBe(400);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("returns 404 when the object is absent", async () => {
    const userId = await createTestUser();
    objectExists.mockResolvedValueOnce(false);
    const res = await deleteFile(await authedRequest(userId, { key: "gone.jpg" }));
    expect(res.status).toBe(404);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("deletes an existing object", async () => {
    const userId = await createTestUser();
    const res = await deleteFile(await authedRequest(userId, { key: "there.jpg" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deleteObject).toHaveBeenCalledWith("there.jpg");
  });

  it("returns 500 when the storage backend throws", async () => {
    const userId = await createTestUser();
    deleteObject.mockRejectedValueOnce(new Error("blob unreachable"));
    const res = await deleteFile(await authedRequest(userId, { key: "there.jpg" }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Delete failed" });
  });
});

// ── Portfolio batch uploads ──────────────────────────────────────────────────

describe.each([
  ["uploadArtistPortfolio", uploadArtistPortfolio, "artists/portfolio"],
  ["uploadStudioPortfolio", uploadStudioPortfolio, "studios/portfolio"],
] as const)("%s", (_name, upload, prefix) => {
  it("returns an empty list for no files", async () => {
    await expect(upload("id-1", [])).resolves.toEqual([]);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("uploads valid images and returns prefixed, sanitized keys", async () => {
    const files = [
      fakeFile("first.jpg", "image/jpeg", validImage("image/jpeg")),
      fakeFile("second.png", "image/png", validImage("image/png")),
    ];
    const keys = await upload("id-1", files);
    expect(keys).toEqual([`${prefix}/id-1-first.jpg`, `${prefix}/id-1-second.png`]);
    expect(uploadObject).toHaveBeenCalledTimes(2);
  });

  it("sanitizes a traversal attempt in the filename", async () => {
    const keys = await upload("id-1", [
      fakeFile("../../etc/passwd.jpg", "image/jpeg", validImage("image/jpeg")),
    ]);
    // Separators become "_" first, then the ".." runs collapse to a single ".".
    expect(keys[0]).toBe(`${prefix}/id-1-._._etc_passwd.jpg`);
    expect(keys[0]).not.toContain("..");
  });

  it("skips files with a disallowed MIME type", async () => {
    const keys = await upload("id-1", [
      fakeFile("note.txt", "text/plain", Buffer.from("hello")),
      fakeFile("ok.jpg", "image/jpeg", validImage("image/jpeg")),
    ]);
    expect(keys).toEqual([`${prefix}/id-1-ok.jpg`]);
  });

  it("skips files whose magic bytes do not match their MIME type", async () => {
    const keys = await upload("id-1", [
      fakeFile("spoof.jpg", "image/jpeg", validImage("image/png")),
      fakeFile("ok.jpg", "image/jpeg", validImage("image/jpeg")),
    ]);
    expect(keys).toEqual([`${prefix}/id-1-ok.jpg`]);
    expect(uploadObject).toHaveBeenCalledTimes(1);
  });

  it("skips files over the size limit", async () => {
    const tooBig = Buffer.concat([
      Buffer.from(MAGIC["image/jpeg"]!),
      Buffer.alloc(MAX_FILE_SIZE + 1),
    ]);
    const keys = await upload("id-1", [fakeFile("big.jpg", "image/jpeg", tooBig)]);
    expect(keys).toEqual([]);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("caps the batch at 20 files", async () => {
    const files = Array.from({ length: 30 }, (_, i) =>
      fakeFile(`f-${i}.jpg`, "image/jpeg", validImage("image/jpeg")),
    );
    const keys = await upload("id-1", files);
    expect(keys).toHaveLength(20);
    expect(uploadObject).toHaveBeenCalledTimes(20);
  });
});
