import { randomUUID } from "node:crypto";
import { getDb, bind } from "./db";
import { ensureCatalogSeeded } from "./catalog-seed";
import { filterArtists, type ArtistFilters } from "@/lib/artists";
import type { Artist, Review, Service, Studio } from "@/lib/types";

/**
 * DB-backed catalog repository — the single source of truth for artists,
 * studios and reviews at runtime. src/lib/data.ts is seed data only.
 *
 * All read helpers lazily seed the catalog on first call (see
 * catalog-seed.ts) so dev/test environments work with zero setup.
 */

// ── Row shapes ───────────────────────────────────────────────────────────────

export interface ArtistRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  bio: string;
  image: string;
  rating: number;
  review_count: number;
  state: string;
  area: string;
  price_from: number;
  verified: number;
  years_experience: number;
  specialties: string;
  services: string;
  bridal: string;
  non_bridal: string;
  availability: string;
  portfolio: string;
  referral_code: string;
  referred_by: string | null;
  referral_earnings: number;
  created_at: string;
  updated_at: string;
}

export interface StudioRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  image: string;
  rating: number;
  review_count: number;
  state: string;
  area: string;
  address: string;
  services: string;
  price_from: number;
  hours: string;
  phone: string;
  referral_code: string;
  referred_by: string | null;
  referral_earnings: number;
  created_at: string;
  updated_at: string;
}

interface ReviewRow {
  id: string;
  entity_type: "artist" | "studio";
  entity_id: string;
  booking_id: string | null;
  user_id: string | null;
  author_name: string;
  rating: number;
  event: string | null;
  text: string;
  created_at: string;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function parseJsonArray(value: string | undefined | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseServices(value: string | undefined | null): Service[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rowToArtist(row: ArtistRow): Artist {
  return {
    id: row.id,
    slug: row.slug || row.id,
    name: row.name,
    tagline: row.tagline,
    bio: row.bio,
    image: row.image,
    rating: Number(row.rating),
    reviewCount: Number(row.review_count),
    state: row.state,
    area: row.area,
    priceFrom: Number(row.price_from),
    specialties: parseJsonArray(row.specialties),
    services: parseServices(row.services),
    bridal: parseJsonArray(row.bridal) as Artist["bridal"],
    nonBridal: parseJsonArray(row.non_bridal) as Artist["nonBridal"],
    availability: parseJsonArray(row.availability),
    portfolio: parseJsonArray(row.portfolio),
    verified: Boolean(row.verified),
    yearsExperience: Number(row.years_experience),
    reviews: [],
    referralCode: row.referral_code || undefined,
    referredBy: row.referred_by || undefined,
    referralEarnings: row.referral_earnings || undefined,
  };
}

export function rowToStudio(row: StudioRow): Studio {
  return {
    id: row.id,
    slug: row.slug || row.id,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    image: row.image,
    rating: Number(row.rating),
    reviewCount: Number(row.review_count),
    state: row.state,
    area: row.area,
    address: row.address,
    services: parseJsonArray(row.services),
    priceFrom: Number(row.price_from),
    hours: row.hours,
    phone: row.phone,
    referralCode: row.referral_code || undefined,
    referredBy: row.referred_by || undefined,
    referralEarnings: row.referral_earnings || undefined,
  };
}

/** Map a review row to the public Review shape (no entity bookkeeping). */
function rowToPublicReview(row: ReviewRow): Review {
  return {
    id: row.id,
    author: row.author_name,
    rating: Number(row.rating),
    date: row.created_at,
    event: row.event ?? "",
    text: row.text,
  };
}

// ── Artists ──────────────────────────────────────────────────────────────────

const ARTIST_SELECT = `SELECT * FROM artists`;

/**
 * Full catalog listing with OOM guard. Unpaginated calls are capped at 500
 * rows; callers with large catalogs should pass { limit, offset } for
 * cursor-based pagination. Keeps existing call sites working while preventing
 * unbounded `SELECT *` scans flagged in the performance audit.
 */
export async function listAllArtists(opts?: { limit?: number; offset?: number }): Promise<Artist[]> {
  await ensureCatalogSeeded();
  if (opts) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    const offset = Math.max(opts.offset ?? 0, 0);
    const rows = (await getDb()
      .prepare(`${ARTIST_SELECT} ORDER BY rating DESC LIMIT ? OFFSET ?`)
      .all(limit, offset)) as unknown as ArtistRow[];
    return rows.map(rowToArtist);
  }
  // Legacy unpaginated path — hard-capped at 500 to prevent OOM/timeout as
  // the catalog scales. Prefer the paginated form for API routes.
  const rows = (await getDb()
    .prepare(`${ARTIST_SELECT} ORDER BY rating DESC LIMIT 500`)
    .all()) as unknown as ArtistRow[];
  return rows.map(rowToArtist);
}

/**
 * Filtered artist listing. SQL pre-filters the cheap indexed predicates
 * (state / area / budget); the pure `filterArtists` helper handles free-text
 * query and event-tag matching over the reduced set.
 */
export async function listArtists(filters?: Partial<ArtistFilters>): Promise<Artist[]> {
  await ensureCatalogSeeded();
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.state) {
    where.push("state = ?");
    params.push(filters.state);
  }
  if (filters?.area) {
    where.push("area = ?");
    params.push(filters.area);
  }
  if (filters?.budget && filters.budget > 0) {
    where.push("price_from <= ?");
    params.push(filters.budget);
  }

  const sql = `${ARTIST_SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY rating DESC`;
  let artists = (
    (await getDb()
      .prepare(sql)
      .all(...params)) as unknown as ArtistRow[]
  ).map(rowToArtist);

  if (
    filters &&
    (filters.query || filters.bridal !== "any" || filters.nonBridal !== "any" || filters.date)
  ) {
    artists = filterArtists(artists, {
      query: filters.query ?? "",
      state: "",
      area: "",
      date: filters.date ?? "",
      customDate: filters.customDate ?? "",
      bridal: filters.bridal ?? "any",
      nonBridal: filters.nonBridal ?? "any",
      budget: 0,
    });
  }
  return artists;
}

export async function getArtistById(id: string): Promise<Artist | null> {
  await ensureCatalogSeeded();
  const row = (await getDb().prepare(`${ARTIST_SELECT} WHERE id = ?`).get(id)) as unknown as
    ArtistRow | undefined;
  return row ? rowToArtist(row) : null;
}

export async function getArtistBySlug(slug: string): Promise<Artist | null> {
  await ensureCatalogSeeded();
  const row = (await getDb().prepare(`${ARTIST_SELECT} WHERE slug = ?`).get(slug)) as unknown as
    ArtistRow | undefined;
  return row ? rowToArtist(row) : null;
}

/** Resolve a public catalog artist by slug first, then by primary key. */
export async function resolveArtist(idOrSlug: string): Promise<Artist | null> {
  return (await getArtistBySlug(idOrSlug)) ?? (await getArtistById(idOrSlug));
}

// ── Studios ──────────────────────────────────────────────────────────────────

const STUDIO_SELECT = `SELECT * FROM studios`;

/**
 * Full studio listing — same OOM guard as listAllArtists. Pass { limit,
 * offset } for paginated access; unpaginated callers are capped at 500.
 */
export async function listAllStudios(opts?: { limit?: number; offset?: number }): Promise<Studio[]> {
  await ensureCatalogSeeded();
  if (opts) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    const offset = Math.max(opts.offset ?? 0, 0);
    const rows = (await getDb()
      .prepare(`${STUDIO_SELECT} ORDER BY rating DESC LIMIT ? OFFSET ?`)
      .all(limit, offset)) as unknown as StudioRow[];
    return rows.map(rowToStudio);
  }
  const rows = (await getDb()
    .prepare(`${STUDIO_SELECT} ORDER BY rating DESC LIMIT 500`)
    .all()) as unknown as StudioRow[];
  return rows.map(rowToStudio);
}

export async function getStudioById(id: string): Promise<Studio | null> {
  await ensureCatalogSeeded();
  const row = (await getDb().prepare(`${STUDIO_SELECT} WHERE id = ?`).get(id)) as unknown as
    StudioRow | undefined;
  return row ? rowToStudio(row) : null;
}

export async function getStudioBySlug(slug: string): Promise<Studio | null> {
  await ensureCatalogSeeded();
  const row = (await getDb().prepare(`${STUDIO_SELECT} WHERE slug = ?`).get(slug)) as unknown as
    StudioRow | undefined;
  return row ? rowToStudio(row) : null;
}

/** Resolve a public catalog studio by slug first, then by primary key. */
export async function resolveStudio(idOrSlug: string): Promise<Studio | null> {
  return (await getStudioBySlug(idOrSlug)) ?? (await getStudioById(idOrSlug));
}

// ── Updates (admin + artist self-service) ────────────────────────────────────

const ARTIST_UPDATE_FIELDS: Record<string, string> = {
  name: "name",
  tagline: "tagline",
  bio: "bio",
  image: "image",
  state: "state",
  area: "area",
  priceFrom: "price_from",
  verified: "verified",
  yearsExperience: "years_experience",
  specialties: "specialties",
  services: "services",
  bridal: "bridal",
  nonBridal: "non_bridal",
  availability: "availability",
  portfolio: "portfolio",
  referralEarnings: "referral_earnings",
};

const STUDIO_UPDATE_FIELDS: Record<string, string> = {
  name: "name",
  tagline: "tagline",
  description: "description",
  image: "image",
  state: "state",
  area: "area",
  address: "address",
  services: "services",
  priceFrom: "price_from",
  hours: "hours",
  phone: "phone",
  referralEarnings: "referral_earnings",
};

/** Fields stored as JSON arrays in their columns. */
const JSON_FIELDS = new Set([
  "specialties",
  "services",
  "bridal",
  "non_bridal",
  "availability",
  "portfolio",
]);

function serializeUpdateValue(column: string, value: unknown): string | number | null {
  if (JSON_FIELDS.has(column)) return JSON.stringify(value ?? []);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return null;
  return String(value);
}

async function applyUpdate(
  table: "artists" | "studios",
  fieldMap: Record<string, string>,
  id: string,
  updates: Record<string, unknown>,
): Promise<boolean> {
  const sets: string[] = [];
  const params: Record<string, string | number | null> = { id, now: new Date().toISOString() };

  for (const [field, value] of Object.entries(updates)) {
    const column = fieldMap[field];
    if (!column) continue;
    sets.push(`${column} = @${column}`);
    params[column] = serializeUpdateValue(column, value);
  }
  if (sets.length === 0) return false;

  const result = await getDb()
    .prepare(`UPDATE ${table} SET ${sets.join(", ")}, updated_at = @now WHERE id = @id`)
    .run(bind(params));
  return result.changes > 0;
}

/**
 * Create a brand-new catalog artist (admin onboarding of external MUAs).
 * Slug is derived from the name and de-duplicated. Returns the full profile.
 */
export async function createArtist(input: {
  name: string;
  slug?: string;
  tagline?: string;
  bio?: string;
  state?: string;
  area?: string;
  priceFrom?: number;
  specialties?: string[];
  services?: Service[];
  referralCode?: string;
}): Promise<Artist | null> {
  await ensureCatalogSeeded();
  const db = getDb();

  const base = slugifyName(input.slug || input.name);
  let slug = base;
  for (let i = 2; ; i++) {
    const exists = await db.prepare("SELECT 1 FROM artists WHERE slug = ?").get(slug);
    if (!exists) break;
    slug = `${base}-${i}`;
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  // Generate referral code for this new artist
  const referralCode = await import("./referral").then((m) => m.assignReferralCode("artist", id));

  let referredBy: string | null = null;
  if (input.referralCode) {
    const referrer = await import("./referral").then((m) =>
      m.findReferrerByCode(input.referralCode!),
    );
    if (referrer && referrer.type === "artist") {
      referredBy = referrer.id;
      // Create referral record
      await import("./referral").then((m) =>
        m.createReferral({
          referrerType: "artist",
          referrerId: referrer.id,
          refereeType: "artist",
          refereeId: id,
        }),
      );
    }
  }

  await db
    .prepare(
      `INSERT INTO artists (id, slug, name, tagline, bio, image, state, area, price_from,
                            specialties, services, referral_code, referred_by, referral_earnings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      slug,
      input.name.trim(),
      input.tagline?.trim() ?? "",
      input.bio?.trim() ?? "",
      // Empty src crashes next/image on listing cards — use a catalog placeholder
      // until an admin attaches a real photo.
      "/images/hero.jpg",
      input.state ?? "",
      input.area ?? "",
      Math.max(0, Math.round(input.priceFrom ?? 0)),
      JSON.stringify(input.specialties ?? []),
      JSON.stringify(input.services ?? []),
      referralCode,
      referredBy,
      0,
      now,
      now,
    );

  return getArtistById(id);
}

function slugifyName(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "artist"
  );
}

export async function updateArtist(
  id: string,
  updates: Record<string, unknown>,
): Promise<Artist | null> {
  const ok = await applyUpdate("artists", ARTIST_UPDATE_FIELDS, id, updates);
  return ok ? getArtistById(id) : null;
}

export async function updateStudio(
  id: string,
  updates: Record<string, unknown>,
): Promise<Studio | null> {
  const ok = await applyUpdate("studios", STUDIO_UPDATE_FIELDS, id, updates);
  return ok ? getStudioById(id) : null;
}

/**
 * Create a brand-new catalog studio.
 * Slug is derived from the name and de-duplicated. Returns the full profile.
 */
export async function createStudio(input: {
  name: string;
  slug?: string;
  tagline?: string;
  description?: string;
  state?: string;
  area?: string;
  address?: string;
  services?: string[];
  priceFrom?: number;
  hours?: string;
  phone?: string;
  referralCode?: string;
}): Promise<Studio | null> {
  await ensureCatalogSeeded();
  const db = getDb();

  const base = slugifyName(input.slug || input.name);
  let slug = base;
  for (let i = 2; ; i++) {
    const exists = await db.prepare("SELECT 1 FROM studios WHERE slug = ?").get(slug);
    if (!exists) break;
    slug = `${base}-${i}`;
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  // Generate referral code for this new studio
  const referralCode = await import("./referral").then((m) => m.assignReferralCode("studio", id));

  let referredBy: string | null = null;
  if (input.referralCode) {
    const referrer = await import("./referral").then((m) =>
      m.findReferrerByCode(input.referralCode!),
    );
    if (referrer && referrer.type === "studio") {
      referredBy = referrer.id;
      // Create referral record
      await import("./referral").then((m) =>
        m.createReferral({
          referrerType: "studio",
          referrerId: referrer.id,
          refereeType: "studio",
          refereeId: id,
        }),
      );
    }
  }

  await db
    .prepare(
      `INSERT INTO studios (id, slug, name, tagline, description, image, state, area, address,
                            services, price_from, hours, phone, referral_code, referred_by, referral_earnings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      slug,
      input.name.trim(),
      input.tagline?.trim() ?? "",
      input.description?.trim() ?? "",
      // Empty src crashes next/image on listing cards — use a catalog placeholder
      // until an admin attaches a real photo.
      "/images/hero.jpg",
      input.state ?? "",
      input.area ?? "",
      input.address ?? "",
      JSON.stringify(input.services ?? []),
      Math.max(0, Math.round(input.priceFrom ?? 0)),
      input.hours?.trim() ?? "",
      input.phone?.trim() ?? "",
      referralCode,
      referredBy,
      0,
      now,
      now,
    );

  return getStudioById(id);
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export type EntityType = "artist" | "studio";

export interface NewReviewInput {
  entityType: EntityType;
  entityId: string;
  bookingId?: string | null;
  userId?: string | null;
  authorName: string;
  rating: number;
  event?: string | null;
  text: string;
}

export async function listEntityReviews(
  entityType: EntityType,
  entityId: string,
): Promise<Review[]> {
  await ensureCatalogSeeded();
  const rows = (await getDb()
    .prepare(
      "SELECT * FROM reviews WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC",
    )
    .all(entityType, entityId)) as unknown as ReviewRow[];
  return rows.map(rowToPublicReview);
}

/**
 * Atomically blend a new rating into the entity's aggregate in a single
 * statement to avoid lost-update races. Previously this was read → compute
 * in JS → write, which lost updates under concurrent reviews.
 *
 *   newCount  = review_count + 1
 *   newRating = ((rating * review_count) + :rating) / (review_count + 1)
 *
 * ROUND(*,2) is supported by both Postgres and SQLite and keeps the
 * aggregate to 2dp without a second round-trip.
 */
async function blendAggregate(
  entityType: EntityType,
  entityId: string,
  rating: number,
): Promise<void> {
  const table = entityType === "artist" ? "artists" : "studios";
  const db = getDb();
  await db
    .prepare(
      `UPDATE ${table}
       SET review_count = review_count + 1,
           rating = ROUND(((rating * review_count) + ?) / (review_count + 1), 2),
           updated_at = ?
       WHERE id = ?`,
    )
    .run(rating, new Date().toISOString(), entityId);
}

export async function addEntityReview(input: NewReviewInput): Promise<Review> {
  await ensureCatalogSeeded();
  const db = getDb();
  const id = crypto.randomUUID();

  // Guard against duplicate reviews per booking when one is supplied.
  if (input.bookingId) {
    const existing = (await db
      .prepare("SELECT id FROM reviews WHERE booking_id = ?")
      .get(input.bookingId)) as { id: string } | undefined;
    if (existing) throw new Error("ALREADY_REVIEWED");
  }

  await db
    .prepare(
      `INSERT INTO reviews (id, entity_type, entity_id, booking_id, user_id, author_name, rating, event, text, created_at)
       VALUES (@id, @entity_type, @entity_id, @booking_id, @user_id, @author_name, @rating, @event, @text, @created_at)`,
    )
    .run(
      bind({
        id,
        entity_type: input.entityType,
        entity_id: input.entityId,
        booking_id: input.bookingId ?? null,
        user_id: input.userId ?? null,
        author_name: input.authorName,
        rating: Math.round(input.rating),
        event: input.event ?? null,
        text: input.text,
        created_at: new Date().toISOString(),
      }),
    );

  await blendAggregate(input.entityType, input.entityId, Math.round(input.rating));

  const row = (await db.prepare("SELECT * FROM reviews WHERE id = ?").get(id)) as unknown as
    ReviewRow | undefined;
  if (!row) throw new Error("REVIEW_INSERT_FAILED");
  return rowToPublicReview(row);
}

/**
 * Find the user's most recent COMPLETED booking for an entity that has not
 * been reviewed yet. Returns null when nothing is reviewable.
 */
export async function findReviewableBooking(
  userId: string,
  entityType: EntityType,
  entityId: string,
): Promise<{ id: string } | null> {
  if (entityType !== "artist") return null; // studio bookings are out of scope for now
  const row = (await getDb()
    .prepare(
      `SELECT b.id FROM bookings b
       LEFT JOIN reviews r ON r.booking_id = b.id
       WHERE b.user_id = ? AND b.artist_id = ?
         AND b.status = 'completed' AND r.id IS NULL
       ORDER BY b.date DESC LIMIT 1`,
    )
    .get(userId, entityId)) as { id: string } | undefined;
  return row ?? null;
}
