import { verifySessionToken } from "./session";
import { getDb, type UserRow } from "./db";
import { jsonError, readJson } from "./http";
import { logger } from "./logger";
import { z } from "zod";
import {
  uploadObject,
  deleteObject,
  generateKey,
  STORAGE_PREFIXES,
  objectExists,
} from "@/lib/storage";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES_PER_UPLOAD = 20;

const MAGIC_BYTES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
  "image/avif": [0x00, 0x00, 0x00],
};

export { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE, MAX_FILES_PER_UPLOAD, MAGIC_BYTES };

export function sanitizeFilename(name: string): string {
  return name
    .replace(/\0/g, "")
    .replace(/[/\\]/g, "_")
    .replace(/[<>"|?*]/g, "_")
    .replace(/\.{2,}/g, ".")
    .substring(0, 100);
}

function validateMagicBytes(buffer: Buffer, expectedType: string): boolean {
  const sig = MAGIC_BYTES[expectedType];
  if (!sig) return false;
  return sig.every((byte: number, i: number) => buffer[i] === byte);
}

async function requireAuth(
  request: Request,
): Promise<{ user: UserRow; payload: { sub: string } } | { error: Response }> {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return { error: jsonError("Not authenticated", 401) };

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) return { error: jsonError("Not authenticated", 401) };
  return { user, payload };
}

const serverUploadSchema = z.object({
  key: z.string().min(1),
  contentType: z.enum(ALLOWED_IMAGE_TYPES as [string, ...string[]]),
  base64Data: z.string().min(1),
});

export async function uploadFileDirect(request: Request) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;

  const parsed = serverUploadSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { key, contentType, base64Data } = parsed.data;

  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > MAX_FILE_SIZE) {
      return jsonError("File too large (max 10 MB)", 400);
    }

    // Validate magic bytes match claimed content type.
    if (!validateMagicBytes(buffer, contentType)) {
      logger.warn(
        { userId: auth.user.id, key, contentType },
        "upload rejected: magic bytes mismatch",
      );
      return jsonError("File content does not match declared type", 400);
    }

    await uploadObject(key, buffer, contentType);
    logger.info({ userId: auth.user.id, key, size: buffer.length }, "Direct upload completed");
    return Response.json({ key });
  } catch (err) {
    logger.error({ err, userId: auth.user.id, key }, "Direct upload failed");
    return jsonError("Upload failed", 500);
  }
}

export async function deleteFile(request: Request) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ key: string }>(request);
  if (!body.ok) return body.error;

  const { key } = body.data;
  if (!key) return jsonError("Key required", 400);

  try {
    const exists = await objectExists(key);
    if (!exists) return jsonError("File not found", 404);

    await deleteObject(key);
    logger.info({ userId: auth.user.id, key }, "File deleted");
    return Response.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId: auth.user.id, key }, "Delete failed");
    return jsonError("Delete failed", 500);
  }
}

export async function uploadArtistPortfolio(artistId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  const remaining = files.slice(0, MAX_FILES_PER_UPLOAD);
  for (const file of remaining) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_FILE_SIZE) continue;
    if (!validateMagicBytes(buffer, file.type)) continue;
    const safeName = sanitizeFilename(file.name);
    const key = generateKey(STORAGE_PREFIXES.artistPortfolio, `${artistId}-${safeName}`);
    await uploadObject(key, buffer, file.type);
    urls.push(key);
  }
  return urls;
}

export async function uploadStudioPortfolio(studioId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  const remaining = files.slice(0, MAX_FILES_PER_UPLOAD);
  for (const file of remaining) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_FILE_SIZE) continue;
    if (!validateMagicBytes(buffer, file.type)) continue;
    const safeName = sanitizeFilename(file.name);
    const key = generateKey(STORAGE_PREFIXES.studioPortfolio, `${studioId}-${safeName}`);
    await uploadObject(key, buffer, file.type);
    urls.push(key);
  }
  return urls;
}
