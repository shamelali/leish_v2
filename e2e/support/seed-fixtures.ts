import fs from "node:fs";
import path from "node:path";
import { closeDb, getDb } from "../../src/server/db.ts";
import {
  FIXTURE_ARTISTS,
  FIXTURE_STATE_FILE,
  FIXTURE_STUDIOS,
  type CatalogFixtureState,
} from "./catalog.ts";

/**
 * Write the E2E catalog fixtures into a throwaway SQLite database.
 *
 * Runs from the Playwright `webServer.command` before `next start` — the app
 * itself never seeds a catalog, so specs need rows to browse. Refuses to run
 * against PostgreSQL or an in-memory database, and recreates the SQLite file
 * from scratch so every E2E run starts from a known state.
 */

const dbPath = process.env.LEISH_DB_PATH;

if (process.env.DATABASE_URL) {
  console.error("[e2e-fixtures] refusing to run with DATABASE_URL set");
  process.exit(1);
}
if (!dbPath || dbPath === ":memory:") {
  console.error(
    "[e2e-fixtures] LEISH_DB_PATH must point at a file (e.g. ./data/e2e.db) " +
      "so the fixtures survive into the server process",
  );
  process.exit(1);
}

for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.mkdirSync(path.dirname(FIXTURE_STATE_FILE), { recursive: true });

const now = new Date().toISOString();
const state: CatalogFixtureState = { artists: {}, studios: {} };

async function main() {
  const db = getDb();

  for (const artist of FIXTURE_ARTISTS) {
    await db
      .prepare(
        `INSERT INTO artists (id, slug, name, tagline, bio, image, rating, review_count,
                              state, area, price_from, verified, years_experience,
                              specialties, services, bridal, non_bridal, availability,
                              portfolio, referral_code, referred_by, referral_earnings,
                              created_at, updated_at)
         VALUES (?, ?, ?, ?, 'E2E fixture profile.', '/images/hero.jpg', ?, ?, ?, ?, ?, 1, 8,
                 ?, ?, ?, ?, ?, '[]', ?, NULL, 0, ?, ?)`,
      )
      .run(
        artist.id,
        artist.id,
        artist.name,
        artist.tagline,
        artist.rating,
        artist.reviewCount,
        artist.state,
        artist.area,
        artist.priceFrom,
        JSON.stringify(artist.specialties),
        JSON.stringify(artist.services),
        JSON.stringify(artist.bridal),
        JSON.stringify(artist.nonBridal),
        JSON.stringify(artist.availability),
        `E2E-${artist.id}`,
        now,
        now,
      );

    for (const [index, review] of artist.reviews.entries()) {
      await db
        .prepare(
          `INSERT INTO reviews (id, entity_type, entity_id, booking_id, user_id, author_name, rating, event, text, created_at)
           VALUES (?, 'artist', ?, NULL, NULL, ?, ?, ?, ?, ?)`,
        )
        .run(
          `${artist.id}-review-${index + 1}`,
          artist.id,
          review.author,
          review.rating,
          review.event,
          review.text,
          now,
        );
    }

    state.artists[artist.id] = {
      id: artist.id,
      slug: artist.id,
      name: artist.name,
      services: artist.services.map((s) => s.name),
    };
  }

  for (const studio of FIXTURE_STUDIOS) {
    await db
      .prepare(
        `INSERT INTO studios (id, slug, name, tagline, description, image, rating, review_count,
                              state, area, address, services, price_from, hours, phone,
                              referral_code, referred_by, referral_earnings, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'E2E fixture studio.', '/images/hero.jpg', 4.7, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
      )
      .run(
        studio.id,
        studio.id,
        studio.name,
        studio.tagline,
        studio.state,
        studio.area,
        studio.address,
        JSON.stringify(studio.services),
        studio.priceFrom,
        studio.hours,
        studio.phone,
        `E2E-${studio.id}`,
        now,
        now,
      );

    state.studios[studio.id] = { id: studio.id, slug: studio.id, name: studio.name };
  }

  fs.writeFileSync(FIXTURE_STATE_FILE, JSON.stringify(state, null, 2));
  console.log(
    `[e2e-fixtures] wrote ${FIXTURE_ARTISTS.length} artists, ${FIXTURE_STUDIOS.length} studios → ${dbPath}`,
  );
}

main()
  .then(() => closeDb())
  .catch(async (err: unknown) => {
    console.error("[e2e-fixtures] failed:", err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });
