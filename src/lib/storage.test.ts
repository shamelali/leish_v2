import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const origToken = process.env.BLOB_READ_WRITE_TOKEN;

const { mockPut, mockDel, mockList, mockHead } = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockDel: vi.fn(),
  mockList: vi.fn(),
  mockHead: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: mockPut,
  del: mockDel,
  list: mockList,
  head: mockHead,
}));

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
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  vi.clearAllMocks();
});

afterEach(() => {
  if (origToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = origToken;
  else delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.clearAllMocks();
});

describe("uploadObject", () => {
  it("uploads Buffer with correct options", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.example.com/key" });
    const buffer = Buffer.from("test content");

    await uploadObject("test/key.txt", buffer, "text/plain");

    expect(mockPut).toHaveBeenCalledTimes(1);
    const [key, body, options] = mockPut.mock.calls[0];
    expect(key).toBe("test/key.txt");
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(options).toMatchObject({
      access: "public",
      contentType: "text/plain",
      token: "test-token",
      addRandomSuffix: false,
    });
  });

  it("uploads Uint8Array", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.example.com/key" });
    const uint8 = new Uint8Array([1, 2, 3, 4]);

    await uploadObject("test/key.bin", uint8, "application/octet-stream");

    expect(mockPut).toHaveBeenCalledTimes(1);
    const [, body] = mockPut.mock.calls[0];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(Buffer.from(body).equals(Buffer.from(uint8))).toBe(true);
  });

  it("uploads ReadableStream by converting to buffer", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.example.com/key" });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("stream data"));
        controller.close();
      },
    });

    await uploadObject("test/key.txt", stream, "text/plain");

    expect(mockPut).toHaveBeenCalledTimes(1);
    const [, body] = mockPut.mock.calls[0];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.toString()).toBe("stream data");
  });
});

describe("deleteObject", () => {
  it("deletes object with token", async () => {
    mockDel.mockResolvedValue(undefined);

    await deleteObject("test/key.txt");

    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel.mock.calls[0][0]).toBe("test/key.txt");
    expect(mockDel.mock.calls[0][1]).toEqual({ token: "test-token" });
  });
});

describe("objectExists", () => {
  it("returns true when head succeeds", async () => {
    mockHead.mockResolvedValue({});

    const exists = await objectExists("test/key.txt");

    expect(exists).toBe(true);
    expect(mockHead).toHaveBeenCalledWith("test/key.txt", { token: "test-token" });
  });

  it("returns false when head throws", async () => {
    mockHead.mockRejectedValue(new Error("not found"));

    const exists = await objectExists("test/key.txt");

    expect(exists).toBe(false);
  });
});

describe("listObjects", () => {
  it("returns array of pathnames", async () => {
    mockList.mockResolvedValue({
      blobs: [{ pathname: "prefix/file1.txt" }, { pathname: "prefix/file2.txt" }],
    });

    const objects = await listObjects("prefix/");

    expect(objects).toEqual(["prefix/file1.txt", "prefix/file2.txt"]);
    expect(mockList).toHaveBeenCalledWith({ prefix: "prefix/", token: "test-token" });
  });
});

describe("getBlobUrl", () => {
  it("returns url when blob found", async () => {
    mockList.mockResolvedValue({
      blobs: [{ pathname: "test/key.txt", url: "https://blob.example.com/test/key.txt" }],
    });

    const url = await getBlobUrl("test/key.txt");

    expect(url).toBe("https://blob.example.com/test/key.txt");
    expect(mockList).toHaveBeenCalledWith({
      prefix: "test/key.txt",
      limit: 1,
      token: "test-token",
    });
  });

  it("throws when blob not found", async () => {
    mockList.mockResolvedValue({ blobs: [] });

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
