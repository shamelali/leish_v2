import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { logger } from "@/server/logger";

/**
 * Object storage — S3-compatible (Cloudflare R2).
 *
 * Replaces the former Vercel Blob backend. Any S3-compatible endpoint works;
 * in production this points at an R2 bucket.
 *
 * Required env:
 *   R2_ENDPOINT            e.g. https://<account-id>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY_ID       R2 API token (Object Read & Write)
 *   R2_SECRET_ACCESS_KEY   R2 API token secret
 *   R2_BUCKET              bucket name
 *   R2_PUBLIC_BASE_URL     public base URL, e.g. https://pub-<hash>.r2.dev
 *                          or a custom domain (https://cdn.leish.my).
 *                          Objects are served publicly under this base.
 */

export interface BlobConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

let client: S3Client | null = null;

function getConfig(): BlobConfig {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new Error(
      "R2 storage misconfigured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL.",
    );
  }
  return { endpoint, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function getClient(): { s3: S3Client; bucket: string; publicBaseUrl: string } {
  if (!client) {
    const cfg = getConfig();
    client = new S3Client({
      region: "auto",
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      forcePathStyle: false,
    });
    return { s3: client, bucket: cfg.bucket, publicBaseUrl: cfg.publicBaseUrl };
  }
  const cfg = getConfig();
  return { s3: client, bucket: cfg.bucket, publicBaseUrl: cfg.publicBaseUrl };
}

export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array | ReadableStream,
  contentType: string,
): Promise<void> {
  const { s3, bucket } = getClient();
  const buffer = Buffer.isBuffer(body)
    ? body
    : Buffer.from(
        body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer()),
      );
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }),
  );
  logger.debug({ key }, "storage upload completed");
}

export async function deleteObject(key: string): Promise<void> {
  const { s3, bucket } = getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  logger.debug({ key }, "storage delete completed");
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    const { s3, bucket } = getClient();
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function listObjects(prefix: string): Promise<string[]> {
  const { s3, bucket } = getClient();
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of result.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

export async function getBlobUrl(key: string): Promise<string> {
  const { publicBaseUrl } = getClient();
  if (!(await objectExists(key))) throw new Error(`Blob not found: ${key}`);
  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
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
