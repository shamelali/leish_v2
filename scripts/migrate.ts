import { Pool } from "pg";
import { PG_SCHEMA } from "../src/server/db.ts";

/**
 * Explicitly provision the db-facade schema on PostgreSQL.
 *
 *   DATABASE_URL="postgresql://...sslmode=require" npm run db:migrate
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS + additive column checks + constraint
 * reconciliation, so it is safe to re-run against an existing database. The
 * app applies the same PG_SCHEMA lazily on boot — this script exists so
 * operators can provision (and verify) before the first request hits prod,
 * per docs/DEPLOY.md.
 */

const ADDITIVE_COLUMNS: Record<string, Array<[string, string]>> = {
  // table: [column, ALTER statement][] — mirrors the SQLite backfill in db.ts
  users: [
    ["email_verified", "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0"],
    ["consent", "ALTER TABLE users ADD COLUMN consent INTEGER NOT NULL DEFAULT 0"],
    ["consent_timestamp", "ALTER TABLE users ADD COLUMN consent_timestamp TEXT"],
    ["supabase_id", "ALTER TABLE users ADD COLUMN supabase_id TEXT"],
  ],
  payments: [
    ["provider_url", "ALTER TABLE payments ADD COLUMN provider_url TEXT"],
    [
      "type",
      "ALTER TABLE payments ADD COLUMN type TEXT NOT NULL DEFAULT 'deposit' CHECK (type IN ('deposit','balance'))",
    ],
  ],
  bookings: [
    ["event_type", "ALTER TABLE bookings ADD COLUMN event_type TEXT"],
    ["venue", "ALTER TABLE bookings ADD COLUMN venue TEXT"],
    ["guest_count", "ALTER TABLE bookings ADD COLUMN guest_count INTEGER NOT NULL DEFAULT 0"],
    ["balance_reminder_at", "ALTER TABLE bookings ADD COLUMN balance_reminder_at TEXT"],
    ["balance_escalated_at", "ALTER TABLE bookings ADD COLUMN balance_escalated_at TEXT"],
    [
      "studio_id",
      "ALTER TABLE bookings ADD COLUMN studio_id TEXT REFERENCES studios(id) ON DELETE SET NULL",
    ],
    ["review_requested_at", "ALTER TABLE bookings ADD COLUMN review_requested_at TEXT"],
    [
      "quotation_recovery_sent_at",
      "ALTER TABLE bookings ADD COLUMN quotation_recovery_sent_at TEXT",
    ],
  ],
  email_outbox: [["html", "ALTER TABLE email_outbox ADD COLUMN html TEXT"]],
  email_preferences: [
    [
      "booking_created",
      "ALTER TABLE email_preferences ADD COLUMN booking_created INTEGER NOT NULL DEFAULT 1",
    ],
    [
      "quotation_sent",
      "ALTER TABLE email_preferences ADD COLUMN quotation_sent INTEGER NOT NULL DEFAULT 1",
    ],
    [
      "invoice_sent",
      "ALTER TABLE email_preferences ADD COLUMN invoice_sent INTEGER NOT NULL DEFAULT 1",
    ],
    [
      "quotation_expiry",
      "ALTER TABLE email_preferences ADD COLUMN quotation_expiry INTEGER NOT NULL DEFAULT 1",
    ],
    [
      "balance_reminder",
      "ALTER TABLE email_preferences ADD COLUMN balance_reminder INTEGER NOT NULL DEFAULT 1",
    ],
    [
      "status_changed",
      "ALTER TABLE email_preferences ADD COLUMN status_changed INTEGER NOT NULL DEFAULT 1",
    ],
    [
      "review_request",
      "ALTER TABLE email_preferences ADD COLUMN review_request INTEGER NOT NULL DEFAULT 1",
    ],
  ],
  email_retries: [
    ["html", "ALTER TABLE email_retries ADD COLUMN html TEXT"],
    ["last_error", "ALTER TABLE email_retries ADD COLUMN last_error TEXT"],
  ],
  artists: [
    ["referral_code", "ALTER TABLE artists ADD COLUMN referral_code TEXT NOT NULL DEFAULT ''"],
    [
      "referred_by",
      "ALTER TABLE artists ADD COLUMN referred_by TEXT REFERENCES artists(id) ON DELETE SET NULL",
    ],
    [
      "referral_earnings",
      "ALTER TABLE artists ADD COLUMN referral_earnings INTEGER NOT NULL DEFAULT 0",
    ],
  ],
  studios: [
    ["referral_code", "ALTER TABLE studios ADD COLUMN referral_code TEXT NOT NULL DEFAULT ''"],
    [
      "referred_by",
      "ALTER TABLE studios ADD COLUMN referred_by TEXT REFERENCES studios(id) ON DELETE SET NULL",
    ],
    [
      "referral_earnings",
      "ALTER TABLE studios ADD COLUMN referral_earnings INTEGER NOT NULL DEFAULT 0",
    ],
  ],
};

/**
 * Reconcile the payments table for the hybrid payment model:
 * - Drop the legacy UNIQUE(booking_id) constraint (old inline column UNIQUE
 *   creates a constraint named payments_booking_id_key) so a booking can hold
 *   both a deposit and a balance payment.
 * - Add the canonical unique index on (booking_id, type).
 * No-op when already up to date.
 */
async function fixPaymentsUniqueness(pool: Pool): Promise<void> {
  const { rows } = await pool.query(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = 'payments'::regclass AND contype = 'u'`,
  );
  for (const row of rows as { conname: string }[]) {
    if (row.conname === "payments_booking_id_key") {
      console.log("[migrate] dropping legacy constraint payments_booking_id_key");
      await pool.query("ALTER TABLE payments DROP CONSTRAINT payments_booking_id_key");
    }
  }
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_booking_type ON payments(booking_id, type)",
  );
}

/**
 * Reconcile the users.role CHECK constraint on databases created before the
 * 'admin' role existed. Drops any role CHECK lacking 'admin' and re-adds the
 * canonical named constraint. No-op when already up to date.
 */
const FIX_ROLE_CHECK = `
DO $fix$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    IF c.def NOT ILIKE '%admin%' THEN
      RAISE NOTICE '[migrate] dropping outdated constraint %', c.conname;
      EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', c.conname);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('customer','artist','studio','admin'));
  END IF;
END
$fix$;
`;

/**
 * Reconcile the payouts table for the one-payout-per-booking invariant.
 *
 * Replayed payment webhooks used to be able to insert a second payout for the
 * same booking. Collapse the `pending` duplicates (keeping the earliest row) so
 * the unique index can be created; settled/failed rows are financial records
 * and are left for an operator to reconcile — this script reports them instead
 * of deleting them.
 */
async function fixPayoutsUniqueness(pool: Pool): Promise<void> {
  const dedupe = await pool.query(`
    DELETE FROM payouts AS p
    USING (
      SELECT ctid, row_number() OVER (PARTITION BY booking_id ORDER BY created_at, id) AS rn
      FROM payouts
      WHERE status = 'pending'
    ) AS d
    WHERE p.ctid = d.ctid AND d.rn > 1
  `);
  if (dedupe.rowCount) {
    console.warn(`[migrate] removed ${dedupe.rowCount} duplicate pending payout row(s)`);
  }

  const { rows } = await pool.query(
    `SELECT booking_id, COUNT(*) AS n FROM payouts GROUP BY booking_id HAVING COUNT(*) > 1`,
  );
  if (rows.length > 0) {
    console.error(
      `[migrate] WARNING: ${rows.length} booking(s) still have multiple payouts ` +
        "(settled/failed rows were not deleted) — reconcile manually; " +
        "uq_payouts_booking cannot be created until they are resolved.",
    );
  }

  try {
    await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS uq_payouts_booking ON payouts(booking_id)");
  } catch (err) {
    // Non-fatal: the webhook is still idempotent (the status guard in
    // markBillPaid is the primary boundary) but the database no longer backs
    // that guarantee, so make it loud in the deploy log.
    console.error(
      "[migrate] could not create uq_payouts_booking:",
      err instanceof Error ? err.message : err,
    );
  }
}

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
    // Backfill payments.type BEFORE PG_SCHEMA: the schema creates a unique
    // index on (booking_id, type), which fails if the column doesn't exist
    // yet on databases created before the hybrid payment model.
    if (
      (await columnExists(pool, "payments", "booking_id")) &&
      !(await columnExists(pool, "payments", "type"))
    ) {
      console.log("[migrate] + payments.type (pre-schema backfill)");
      await pool.query(
        "ALTER TABLE payments ADD COLUMN type TEXT NOT NULL DEFAULT 'deposit' CHECK (type IN ('deposit','balance'))",
      );
    }

    console.log("[migrate] applying db-facade schema (idempotent)…");
    await pool.query(PG_SCHEMA);
    await pool.query(FIX_ROLE_CHECK);
    await fixPaymentsUniqueness(pool);
    await fixPayoutsUniqueness(pool);

    // Backfill columns on databases created before they were added.
    for (const [table, columns] of Object.entries(ADDITIVE_COLUMNS)) {
      for (const [column, ddl] of columns) {
        if (!(await columnExists(pool, table, column))) {
          console.log(`[migrate] + ${table}.${column}`);
          await pool.query(ddl);
        }
      }
    }

    // Unique index for supabase_id — created after column backfill so it
    // succeeds on legacy databases that didn't have the column originally.
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_supabase_id ON users(supabase_id)",
    );

    const EXPECTED_TABLES = [
      "users",
      "bookings",
      "password_resets",
      "email_verifications",
      "email_outbox",
      "email_preferences",
      "email_retries",
      "artist_profiles",
      "studio_profiles",
      "quotations",
      "messages",
      "payments",
      "payouts",
      "sessions",
      "admin_audit_log",
      "catalog_overrides",
      "platform_settings",
      "artists",
      "studios",
      "reviews",
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
