import { Pool } from "pg";
import { PG_SCHEMA } from "../src/server/db.ts";

/**
 * Explicitly provision the db-facade schema on PostgreSQL.
 *
 *   DATABASE_URL="postgresql://...sslmode=require" npm run db:migrate
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS + additive column checks, so it is
 * safe to re-run against an existing database. The app applies the same
 * PG_SCHEMA lazily on boot — this script exists so operators can provision
 * (and verify) before the first request hits prod, per docs/DEPLOY.md.
 */

const ADDITIVE_COLUMNS: Record<string, Array<[string, string]>> = {
  // table: [column, ALTER statement][] — mirrors the SQLite backfill in db.ts
  users: [
    ["email_verified", "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0"],
    ["consent", "ALTER TABLE users ADD COLUMN consent INTEGER NOT NULL DEFAULT 0"],
    ["consent_timestamp", "ALTER TABLE users ADD COLUMN consent_timestamp TEXT"],
  ],
  payments: [["provider_url", "ALTER TABLE payments ADD COLUMN provider_url TEXT"]],
};

async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows.length > 0;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set.\n" +
        'Usage: DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require" npm run db:migrate\n' +
        "(Use the Supabase pooler connection string in production — see docs/DEPLOY.md.)",
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 15_000),
  });

  try {
    console.log("[migrate] applying db-facade schema (idempotent)…");
    await pool.query(PG_SCHEMA);

    // Backfill columns on databases created before they were added.
    for (const [table, columns] of Object.entries(ADDITIVE_COLUMNS)) {
      for (const [column, ddl] of columns) {
        if (!(await columnExists(pool, table, column))) {
          console.log(`[migrate] + ${table}.${column}`);
          await pool.query(ddl);
        }
      }
    }

    const EXPECTED_TABLES = [
      "users",
      "bookings",
      "password_resets",
      "email_verifications",
      "email_outbox",
      "artist_profiles",
      "quotations",
      "messages",
      "payments",
      "sessions",
    ];
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [EXPECTED_TABLES],
    );
    const tables = rows.map((r: { table_name: string }) => r.table_name);
    console.log(
      `[migrate] ok — ${tables.length}/${EXPECTED_TABLES.length} tables present: ${tables.join(", ")}`,
    );
    if (tables.length !== EXPECTED_TABLES.length) {
      console.error(
        `[migrate] WARNING: expected ${EXPECTED_TABLES.length} tables — investigate before deploying.`,
      );
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[migrate] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
