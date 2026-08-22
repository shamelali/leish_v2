import { getDb, closeDb } from "../src/server/db.ts";
import { seedCatalog } from "../src/server/catalog-seed.ts";

/**
 * Seed the DB-backed catalog (artists / studios / legacy reviews) from
 * src/lib/data.ts and fold any legacy catalog_overrides rows into columns.
 *
 *   npm run db:seed-catalog        # uses DATABASE_URL, else local SQLite
 *
 * Idempotent: safe to run repeatedly.
 */

async function main(): Promise<void> {
  console.log("[seed-catalog] seeding artists/studios/reviews…");
  getDb(); // initialize backend (applies schema lazily for pg)
  const result = await seedCatalog();
  console.log(
    `[seed-catalog] ok — ${result.artists} artists, ${result.studios} studios, ` +
      `${result.folded} override(s) folded into columns`,
  );
}

main()
  .then(() => closeDb())
  .catch((err: unknown) => {
    console.error("[seed-catalog] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
