import { put, del, list, head } from "@vercel/blob";
import { logger } from "@/server/logger";

export interface BlobConfig {
  token: string;
}

function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN missing. Create a Blob store via Vercel dashboard or `vercel blob create-store`.",
    );
  }
  return token;
}

export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array | ReadableStream,
  contentType: string,
): Promise<void> {
  const token = getBlobToken();
  const buffer = Buffer.isBuffer(body)
    ? body
    : Buffer.from(
        body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer()),
      );
  await put(key, buffer, {
    access: "public",
    contentType,
    token,
    addRandomSuffix: false,
  });
  logger.debug({ key }, "Blob upload completed");
}

export async function deleteObject(key: string): Promise<void> {
  const token = getBlobToken();
  await del(key, { token });
  logger.debug({ key }, "Blob delete completed");
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    const token = getBlobToken();
    await head(key, { token });
    return true;
  } catch {
    return false;
  }
}

export async function listObjects(prefix: string): Promise<string[]> {
  const token = getBlobToken();
  const result = await list({ prefix, token });
  return result.blobs.map((b) => b.pathname);
}

export async function getBlobUrl(key: string): Promise<string> {
  const token = getBlobToken();
  const result = await list({ prefix: key, limit: 1, token });
  const blob = result.blobs.find((b) => b.pathname === key);
  if (!blob) throw new Error(`Blob not found: ${key}`);
  return blob.url;
}

export function generateKey(prefix: string, filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const safeName = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 50);
  return `${prefix}/${timestamp}-${random}-${safeName}.${ext}`;
}

export const STORAGE_PREFIXES = {
  artistPortfolio: "artists/portfolio",
  studioPortfolio: "studios/portfolio",
  artistAvatar: "artists/avatars",
  studioAvatar: "studios/avatars",
  invoice: "invoices",
  bookingImage: "bookings/images",
} as const;
