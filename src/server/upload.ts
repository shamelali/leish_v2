"use server";

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

async function requireAuth(request: Request): Promise<{ user: UserRow; payload: { sub: string } } | { error: Response }> {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return { error: jsonError("Not authenticated", 401) };

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as UserRow | undefined;
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
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) continue;
    const key = generateKey(STORAGE_PREFIXES.artistPortfolio, `${artistId}-${file.name}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadObject(key, buffer, file.type);
    urls.push(key);
  }
  return urls;
}

export async function uploadStudioPortfolio(studioId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) continue;
    const key = generateKey(STORAGE_PREFIXES.studioPortfolio, `${studioId}-${file.name}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadObject(key, buffer, file.type);
    urls.push(key);
  }
  return urls;
}
