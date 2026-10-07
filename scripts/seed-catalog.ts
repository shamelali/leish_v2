import { getDb, closeDb } from "../src/server/db.ts";
import { seedCatalog } from "../src/server/catalog-seed.ts";

/**
 * Seed the DB-backed catalog (artists / studios / legacy reviews) from
 * src/lib/data.ts and fold any legacy catalog_overrides rows into columns.
 *
 *   npm run db:seed-catalog        # uses DATABASE_URL, else local SQLite
 *
 * Idempotent: safe to run repeatedly.
 *
 * Guarded: refuses to run unless ALLOW_CATALOG_SEED=1, so a stray invocation
 * can never resurrect deleted seed rows in production. The lazy
 * ensureCatalogSeeded() path has the same guard for NODE_ENV=production.
 */

async function main(): Promise<void> {
  if (process.env.ALLOW_CATALOG_SEED !== "1") {
    console.error(
      "[seed-catalog] refused: set ALLOW_CATALOG_SEED=1 to seed the catalog " +
        "(deleted seed rows stay deleted otherwise).",
    );
    process.exit(1);
  }
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
