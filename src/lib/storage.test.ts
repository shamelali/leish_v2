import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const R2_VARS = {
  R2_ENDPOINT: "https://test.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "test-key",
  R2_SECRET_ACCESS_KEY: "test-secret",
  R2_BUCKET: "test-bucket",
  R2_PUBLIC_BASE_URL: "https://pub-test.r2.dev",
} as const;

const origEnv: Record<string, string | undefined> = {};

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = mockSend;
  }
  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class HeadObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class ListObjectsV2Command {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
  };
});

import {
  uploadObject,
  deleteObject,
  objectExists,
  listObjects,
  getBlobUrl,
  generateKey,
  STORAGE_PREFIXES,
} from "./storage";

beforeEach(() => {
  for (const [k, v] of Object.entries(R2_VARS)) {
    origEnv[k] = process.env[k];
    process.env[k] = v;
  }
  vi.clearAllMocks();
});

afterEach(() => {
  for (const k of Object.keys(R2_VARS)) {
    if (origEnv[k] !== undefined) process.env[k] = origEnv[k];
    else delete process.env[k];
  }
  vi.clearAllMocks();
});

describe("uploadObject", () => {
  it("uploads Buffer with correct bucket/key/content-type", async () => {
    mockSend.mockResolvedValue({});
    const buffer = Buffer.from("test content");

    await uploadObject("test/key.txt", buffer, "text/plain");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input).toMatchObject({
      Bucket: "test-bucket",
      Key: "test/key.txt",
      ContentType: "text/plain",
    });
    expect(Buffer.isBuffer(cmd.input.Body)).toBe(true);
  });

  it("uploads Uint8Array", async () => {
    mockSend.mockResolvedValue({});
    const uint8 = new Uint8Array([1, 2, 3, 4]);

    await uploadObject("test/key.bin", uint8, "application/octet-stream");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(Buffer.from(cmd.input.Body as Uint8Array).equals(Buffer.from(uint8))).toBe(true);
  });

  it("uploads ReadableStream by converting to buffer", async () => {
    mockSend.mockResolvedValue({});
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("stream data"));
        controller.close();
      },
    });

    await uploadObject("test/key.txt", stream, "text/plain");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    expect((cmd.input.Body as Buffer).toString()).toBe("stream data");
  });

  it("throws when R2 env is missing", async () => {
    delete process.env.R2_BUCKET;
    await expect(uploadObject("k", Buffer.from("x"), "text/plain")).rejects.toThrow(
      "R2 storage misconfigured",
    );
  });
});

describe("deleteObject", () => {
  it("deletes object by key", async () => {
    mockSend.mockResolvedValue({});

    await deleteObject("test/key.txt");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input).toMatchObject({ Bucket: "test-bucket", Key: "test/key.txt" });
  });
});

describe("objectExists", () => {
  it("returns true when head succeeds", async () => {
    mockSend.mockResolvedValue({});

    const exists = await objectExists("test/key.txt");

    expect(exists).toBe(true);
  });

  it("returns false when head throws", async () => {
    mockSend.mockRejectedValue(new Error("not found"));

    const exists = await objectExists("test/key.txt");

    expect(exists).toBe(false);
  });
});

describe("listObjects", () => {
  it("returns array of keys and follows pagination", async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "prefix/file1.txt" }],
        IsTruncated: true,
        NextContinuationToken: "tok",
      })
      .mockResolvedValueOnce({ Contents: [{ Key: "prefix/file2.txt" }], IsTruncated: false });

    const objects = await listObjects("prefix/");

    expect(objects).toEqual(["prefix/file1.txt", "prefix/file2.txt"]);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});

describe("getBlobUrl", () => {
  it("returns public URL when object exists", async () => {
    mockSend.mockResolvedValue({});

    const url = await getBlobUrl("test/key.txt");

    expect(url).toBe("https://pub-test.r2.dev/test/key.txt");
  });

  it("throws when object missing", async () => {
    mockSend.mockRejectedValue(new Error("not found"));

    await expect(getBlobUrl("test/key.txt")).rejects.toThrow("Blob not found: test/key.txt");
  });
});

describe("generateKey", () => {
  it("generates key with prefix, timestamp, random, and sanitized filename", () => {
    const key = generateKey("test/prefix", "my file.txt");

    expect(key).toMatch(/^test\/prefix\/\d+-[a-z0-9]+-my-file\.txt$/);
  });

  it("handles filename without extension", () => {
    const key = generateKey("test/prefix", "filename");

    // When no extension, the ext is empty string, so it becomes filename.filename
    expect(key).toMatch(/^test\/prefix\/\d+-[a-z0-9]+-filename\.filename$/);
  });

  it("sanitizes special characters", () => {
    const key = generateKey("test/prefix", "file@#$%name!.txt");

    // Each special char becomes hyphen (via safeName regex in generateKey)
    expect(key).toMatch(/^test\/prefix\/\d+-[a-z0-9]+-file----name-\.txt$/);
  });

  it("truncates long filenames", () => {
    const longName = "a".repeat(60) + ".txt";
    const key = generateKey("test/prefix", longName);

    const filenamePart = key.split("/").pop()!;
    expect(filenamePart.length).toBeLessThanOrEqual(100);
  });

  it("lowercases extension", () => {
    const key = generateKey("test/prefix", "FILE.TXT");

    expect(key.endsWith(".txt")).toBe(true);
  });
});

describe("STORAGE_PREFIXES", () => {
  it("has expected prefixes", () => {
    expect(STORAGE_PREFIXES.artistPortfolio).toBe("artists/portfolio");
    expect(STORAGE_PREFIXES.studioPortfolio).toBe("studios/portfolio");
    expect(STORAGE_PREFIXES.artistAvatar).toBe("artists/avatars");
    expect(STORAGE_PREFIXES.studioAvatar).toBe("studios/avatars");
    expect(STORAGE_PREFIXES.invoice).toBe("invoices");
    expect(STORAGE_PREFIXES.bookingImage).toBe("bookings/images");
  });
});
