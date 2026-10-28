import { closeDb, getDb } from "../src/server/db.ts";

/**
 * Purge the catalog (artists, studios, reviews and their claims) so a database
 * can go from demo/dev content to a clean production launch.
 *
 *   npm run db:clear-catalog                  # dry run — prints what would go
 *   npm run db:clear-catalog -- --force       # delete catalog rows
 *   npm run db:clear-catalog -- --force --cascade   # …and bookings pointing at them
 *
 * Safety:
 * - Without `--force` nothing is deleted.
 * - Bookings reference `artists.id` without a foreign key, so orphaned
 *   bookings would silently survive. If any booking points at a catalog row
 *   the script refuses unless `--cascade` is also passed.
 * - Real users, sessions and platform settings are never touched.
 */

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const cascade = args.has("--cascade");
const CATALOG_CACHE_PREFIX = "cat:";

interface Counts {
  artists: number;
  studios: number;
  reviews: number;
  artist_profiles: number;
  studio_profiles: number;
  catalog_overrides: number;
  referrals: number;
  bookings: number;
  seed_marker: number;
}

async function count(sql: string): Promise<number> {
  const row = (await getDb().prepare(sql).get()) as { c: number | string } | undefined;
  return Number(row?.c ?? 0);
}

async function survey(): Promise<Counts> {
  return {
    artists: await count("SELECT COUNT(*) AS c FROM artists"),
    studios: await count("SELECT COUNT(*) AS c FROM studios"),
    reviews: await count("SELECT COUNT(*) AS c FROM reviews"),
    artist_profiles: await count("SELECT COUNT(*) AS c FROM artist_profiles"),
    studio_profiles: await count("SELECT COUNT(*) AS c FROM studio_profiles"),
    catalog_overrides: await count("SELECT COUNT(*) AS c FROM catalog_overrides"),
    referrals: await count("SELECT COUNT(*) AS c FROM referrals"),
    bookings: await count(
      `SELECT COUNT(*) AS c FROM bookings
       WHERE artist_id IN (SELECT id FROM artists)
          OR studio_id IN (SELECT id FROM studios)`,
    ),
    seed_marker: await count(
      "SELECT COUNT(*) AS c FROM platform_settings WHERE key = 'catalog_seeded_at'",
    ),
  };
}

function report(label: string, counts: Counts) {
  console.log(`[clear-catalog] ${label}`);
  for (const [table, value] of Object.entries(counts)) {
    console.log(`  ${String(value).padStart(6)}  ${table}`);
  }
}

async function main(): Promise<void> {
  const backend = process.env.DATABASE_URL ? "PostgreSQL (DATABASE_URL)" : "SQLite (local file)";
  console.log(`[clear-catalog] backend: ${backend}`);

  const before = await survey();
  report("rows matching the catalog purge:", before);

  if (!force) {
    console.log("\n[clear-catalog] dry run — re-run with `-- --force` to delete.");
    return;
  }

  if (before.bookings > 0 && !cascade) {
    throw new Error(
      `${before.bookings} booking(s) reference catalog rows. Deleting the catalog would orphan ` +
        "them. Re-run with `-- --force --cascade` to delete those bookings too, or keep the catalog.",
    );
  }

  const db = getDb();
  if (cascade) {
    await db
      .prepare(
        `DELETE FROM bookings
         WHERE artist_id IN (SELECT id FROM artists)
            OR studio_id IN (SELECT id FROM studios)`,
      )
      .run();
  }

  // Reviews first (booking_id FK), then claims and legacy overrides, then the
  // catalog rows themselves (artists/studios have a self-referencing FK).
  for (const statement of [
    "DELETE FROM reviews",
    "DELETE FROM artist_profiles",
    "DELETE FROM studio_profiles",
    "DELETE FROM catalog_overrides",
    "DELETE FROM referrals",
    "DELETE FROM studios",
    "DELETE FROM artists",
    "DELETE FROM platform_settings WHERE key = 'catalog_seeded_at'",
  ]) {
    await db.prepare(statement).run();
  }

  // Cached catalog reads would otherwise keep serving the deleted rows.
  const { cacheDelPrefix } = await import("../src/server/redis.ts");
  await cacheDelPrefix(CATALOG_CACHE_PREFIX);

  report("\n[clear-catalog] rows after purge:", await survey());
  console.log("[clear-catalog] done — the catalog is empty.");
}

main()
  .then(() => closeDb())
  .catch(async (err: unknown) => {
    console.error("[clear-catalog] failed:", err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });
