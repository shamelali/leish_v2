/**
 * Retention purge script — PDPA (Malaysia) data-retention enforcement.
 *
 * Purpose: report on, then optionally purge, rows older than a retention
 * window (default 7 years) per Malaysian tax law (LHDN) record-keeping rules.
 *
 * Usage:
 *   node scripts/retain-purge.js --mode=archive --weeks=364
 *   node scripts/retain-purge.js --mode=purge --weeks=364 --confirm
 *
 * Safety:
 * - `--mode=archive` only counts affected rows; it never deletes.
 * - `--mode=purge` requires `--confirm` before any DELETE runs.
 * - Requires POSTGRES_URL (or DATABASE_URL) to be set.
 */

import pg from "pg";

const { Pool } = pg;

function parseArgs(argv) {
  const args = { mode: null, weeks: 364, confirm: false, verbose: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--verbose") args.verbose = true;
    else if (arg.startsWith("--mode=")) args.mode = arg.slice("--mode=".length);
    else if (arg.startsWith("--weeks=")) {
      // Support a simple "a*b" form (e.g. 52*7) for convenience.
      const raw = arg.slice("--weeks=".length);
      const value = raw.includes("*")
        ? raw.split("*").reduce((acc, part) => acc * Number(part), 1)
        : Number(raw);
      if (Number.isFinite(value) && value > 0) args.weeks = value;
    }
  }
  return args;
}

function usage() {
  console.error("Usage: node scripts/retain-purge.js --mode=archive|purge --weeks=<n> [--confirm]");
  console.error("  --mode=archive : count rows older than the window (no deletion)");
  console.error("  --mode=purge   : delete rows older than the window (requires --confirm)");
  console.error("  --weeks=<n>    : retention window in weeks (default 364 ≈ 7 years)");
  console.error("  --confirm      : actually execute DELETE (purge mode only)");
}

// Tables scanned for retention reporting/anonymization.
const ARCHIVE_TABLES = ["payments", "bookings", "quotations", "email_outbox"];
// Tables from which rows are physically removed on purge.
const PURGE_TABLES = ["payments", "bookings"];

async function main() {
  const { mode, weeks, confirm, verbose } = parseArgs(process.argv);

  if (mode !== "archive" && mode !== "purge") {
    usage();
    process.exit(1);
  }

  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ POSTGRES_URL (or DATABASE_URL) must be set.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log(`🛡️  PDPA retention — mode=${mode}, weeks=${weeks}, confirm=${confirm}`);

    if (mode === "archive") {
      for (const table of ARCHIVE_TABLES) {
        const { rows } = await client.query(
          `SELECT count(*)::int AS total FROM ${table}
           WHERE created_at < NOW() - ($1 * INTERVAL '1 week')`,
          [weeks],
        );
        console.log(`  ${table}: ${rows[0].total} rows older than ${weeks} weeks`);
      }
      console.log("✅ Archive report complete — no data was deleted.");
      console.log("💡 Re-run with --mode=purge --confirm to permanently delete.");
      return;
    }

    // mode === "purge"
    if (!confirm) {
      console.error("❌ --confirm is required for purge mode.");
      process.exit(1);
    }

    for (const table of PURGE_TABLES) {
      const { rowCount } = await client.query(
        `DELETE FROM ${table}
         WHERE created_at < NOW() - ($1 * INTERVAL '1 week')`,
        [weeks],
      );
      console.log(`  ${table}: ${rowCount} rows deleted`);
      if (verbose) console.log(`    (window: older than ${weeks} weeks)`);
    }
    console.log("✅ Purge complete — data permanently deleted.");
  } catch (err) {
    console.error("❌ Error during retain-purge:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
