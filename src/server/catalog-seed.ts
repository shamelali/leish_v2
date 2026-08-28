import { getDb, bind } from "./db.ts";
import { SEED_ARTISTS, SEED_STUDIOS } from "../lib/data.ts";
import type { Artist, Studio } from "@/lib/types";
import { generateReferralCode } from "./referral.ts";

/**
 * Catalog seeding: populates the DB-backed artists/studios tables from the
 * static seed data in src/lib/data.ts (which is now seed-source-only) and
 * folds any legacy `catalog_overrides` rows into real columns.
 *
 * - Idempotent: safe to run repeatedly (upserts + conflict-guarded inserts).
 * - Runs lazily before the first catalog read (see ensureCatalogSeeded)
 *   and explicitly via scripts/seed-catalog.ts / npm run db:migrate flow.
 */

export const CATALOG_SEED_MARKER = "catalog_seeded_at";

type Bindable = Record<string, string | number | bigint | boolean | null>;

function artistToRow(a: Artist, now: string): Record<string, unknown> {
  return {
    id: a.id,
    slug: a.id,
    name: a.name,
    tagline: a.tagline ?? "",
    bio: a.bio ?? "",
    image: a.image ?? "",
    rating: a.rating ?? 0,
    review_count: a.reviewCount ?? 0,
    state: a.state ?? "",
    area: a.area ?? "",
    price_from: a.priceFrom ?? 0,
    verified: a.verified ? 1 : 0,
    years_experience: a.yearsExperience ?? 0,
    specialties: JSON.stringify(a.specialties ?? []),
    services: JSON.stringify(a.services ?? []),
    bridal: JSON.stringify(a.bridal ?? []),
    non_bridal: JSON.stringify(a.nonBridal ?? []),
    availability: JSON.stringify(a.availability ?? []),
    portfolio: JSON.stringify(a.portfolio ?? []),
    referral_code: generateReferralCode(),
    referred_by: null,
    referral_earnings: 0,
    created_at: now,
    updated_at: now,
  };
}

function studioToRow(s: Studio, now: string): Record<string, unknown> {
  return {
    id: s.id,
    slug: s.id,
    name: s.name,
    tagline: s.tagline ?? "",
    description: s.description ?? "",
    image: s.image ?? "",
    rating: s.rating ?? 0,
    review_count: s.reviewCount ?? 0,
    state: s.state ?? "",
    area: s.area ?? "",
    address: s.address ?? "",
    services: JSON.stringify(s.services ?? []),
    price_from: s.priceFrom ?? 0,
    hours: s.hours ?? "",
    phone: s.phone ?? "",
    referral_code: generateReferralCode(),
    referred_by: null,
    referral_earnings: 0,
    created_at: now,
    updated_at: now,
  };
}

async function upsertRow(
  db: ReturnType<typeof getDb>,
  table: "artists" | "studios",
  row: Record<string, unknown>,
) {
  const cols = Object.keys(row);
  const placeholders = cols.map((c) => `@${c}`).join(", ");
  const updates = cols
    .filter((c) => c !== "id" && c !== "created_at")
    .map((c) => `${c} = @${c}`)
    .join(", ");
  await db
    .prepare(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updates}`,
    )
    .run(bind(row as Bindable));
}

// Legacy catalog_overrides field -> column mapping.
const ARTIST_FIELD_MAP: Record<string, string> = {
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
};

const STUDIO_FIELD_MAP: Record<string, string> = {
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
};

interface OverrideRow {
  id: string;
  entity_type: "artist" | "studio";
  entity_id: string;
  field: string;
  value: string;
}

/** Serialize a parsed override value into its column representation. */
function toColumnValue(field: string, parsed: unknown): string | number | null {
  const jsonFields = new Set([
    "specialties",
    "services",
    "bridal",
    "non_bridal",
    "availability",
    "portfolio",
  ]);
  if (typeof parsed === "boolean") return parsed ? 1 : 0;
  if (typeof parsed === "number") return parsed;
  if (jsonFields.has(field)) return JSON.stringify(parsed);
  if (parsed === null || parsed === undefined) return null;
  return String(parsed);
}

/**
 * Fold legacy catalog_overrides rows into real columns, deleting each applied
 * row. Rows for unknown fields/entities are left untouched.
 */
async function foldOverrides(db: ReturnType<typeof getDb>): Promise<number> {
  const rows = (await db
    .prepare("SELECT id, entity_type, entity_id, field, value FROM catalog_overrides")
    .all()) as unknown as OverrideRow[];

  let folded = 0;
  for (const o of rows) {
    const map = o.entity_type === "artist" ? ARTIST_FIELD_MAP : STUDIO_FIELD_MAP;
    const column = map[o.field];
    if (!column) continue;

    let parsed: unknown = o.value;
    try {
      parsed = JSON.parse(o.value);
    } catch {
      // keep raw string
    }
    const value = toColumnValue(column, parsed);
    const table = o.entity_type === "artist" ? "artists" : "studios";
    const result = await db
      .prepare(`UPDATE ${table} SET ${column} = ?, updated_at = ? WHERE id = ?`)
      .run(value as never, new Date().toISOString(), o.entity_id);

    // Only delete the override when it actually landed on an existing entity.
    if (result.changes > 0) {
      await db.prepare("DELETE FROM catalog_overrides WHERE id = ?").run(o.id);
      folded++;
    }
  }
  return folded;
}

/** Insert the static seed reviews that ship with data.ts (legacy, no booking). */
async function seedLegacyReviews(db: ReturnType<typeof getDb>) {
  for (const artist of SEED_ARTISTS) {
    for (const r of artist.reviews ?? []) {
      await db
        .prepare(
          `INSERT INTO reviews (id, entity_type, entity_id, booking_id, user_id, author_name, rating, event, text, created_at)
           VALUES (?, 'artist', ?, NULL, NULL, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .run(
          `${artist.id}-legacy-${r.id}`,
          artist.id,
          r.author,
          Math.round(r.rating),
          r.event,
          r.text,
          r.date,
        );
    }
  }
}

/**
 * Seed the catalog tables. Idempotent — upserts seed entities, re-inserts
 * missing legacy reviews, folds overrides, and stamps the marker key.
 */
export async function seedCatalog(): Promise<{ artists: number; studios: number; folded: number }> {
  const db = getDb();
  const now = new Date().toISOString();

  for (const artist of SEED_ARTISTS) {
    await upsertRow(db, "artists", artistToRow(artist, now));
  }
  for (const studio of SEED_STUDIOS) {
    await upsertRow(db, "studios", studioToRow(studio, now));
  }
  await seedLegacyReviews(db);
  const folded = await foldOverrides(db);

  await db
    .prepare(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES (@key, @value, NULL, @updated_at)
       ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at`,
    )
    .run(bind({ key: CATALOG_SEED_MARKER, value: now, updated_at: now }));

  return { artists: SEED_ARTISTS.length, studios: SEED_STUDIOS.length, folded };
}

let ensurePromise: Promise<void> | null = null;

/**
 * Lazily seed the catalog exactly once per process before the first read.
 * Cross-process safety comes from idempotent upserts (worst case two
 * instances seed concurrently and converge on identical rows).
 */
export function ensureCatalogSeeded(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const db = getDb();
      const marker = (await db
        .prepare("SELECT value FROM platform_settings WHERE key = ?")
        .get(CATALOG_SEED_MARKER)) as { value: string } | undefined;
      if (!marker) {
        await seedCatalog();
      }
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

/** Test helper: forget the per-process seed memo so tests can re-seed. */
export function resetCatalogSeedMemo() {
  ensurePromise = null;
}
