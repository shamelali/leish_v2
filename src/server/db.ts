import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";

/**
 * Persistence facade with two interchangeable backends:
 *
 * - PostgreSQL (`DATABASE_URL` set): async `pg` Pool (works with Neon).
 *   Used in production / Vercel.
 * - node:sqlite (no `DATABASE_URL`): Node's built-in SQLite, wrapped in the
 *   same async API. Used for local dev and tests (hermetic via
 *   LEISH_DB_PATH=:memory:).
 *
 * `getDb()` is SYNCHRONOUS (initialization is sync on both backends; the
 * pg migration runs lazily before the first query). Callers keep the same
 * shape and simply `await` the terminal call:
 *   const row = (await getDb().prepare(sql).get<T>(params);
 *   const rows = await getDb().prepare(sql).all<T>(params);
 *   await getDb().prepare(sql).run(params);
 * `?` and `@name` placeholders work on both backends (pg translates to $1..$n).
 */

export type BindValue = string | number | bigint | boolean | null | Uint8Array;
export type BindParam = BindValue | Record<string, BindValue>;

export interface Statement {
  get<T>(...params: BindParam[]): Promise<T | undefined>;
  all<T>(...params: BindParam[]): Promise<T[]>;
  run(...params: BindParam[]): Promise<{ changes: number }>;
}

export interface DbFacade {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void> | void;
}

// ── Placeholder translation (sqlite ? / @name -> pg $n) ─────────────────────

interface CompiledSql {
  sql: string;
  names: string[];
  usesNamed: boolean;
}

export function compilePlaceholders(sql: string): CompiledSql {
  if (sql.includes("@")) {
    const names: string[] = [];
    let i = 1;
    const translated = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name: string) => {
      names.push(name);
      return `$${i++}`;
    });
    return { sql: translated, names, usesNamed: true };
  }
  if (sql.includes("?")) {
    let i = 1;
    const translated = sql.replace(/\?/g, () => `$${i++}`);
    return { sql: translated, names: [], usesNamed: false };
  }
  return { sql, names: [], usesNamed: false };
}

/** Flatten variadic args into an ordered bind array; handle named-object runs. */
export function resolveParams(compiled: CompiledSql, params: BindParam[]): BindValue[] {
  if (params.length === 0) return [];
  if (compiled.usesNamed && params.length === 1 && !Array.isArray(params[0])) {
    const obj = params[0] as Record<string, BindValue>;
    return compiled.names.map((n) => obj[n] ?? null);
  }
  return params.flatMap((p) => (Array.isArray(p) ? (p as BindValue[]) : [p as BindValue]));
}

// ── PostgreSQL backend ───────────────────────────────────────────────────────

function createPgFacade(pool: Pool, ensureReady: () => Promise<void>): DbFacade {
  const statement = (sql: string): Statement => {
    const compiled = compilePlaceholders(sql);
    return {
      async get<T>(...params: BindParam[]): Promise<T | undefined> {
        await ensureReady();
        const { rows } = await pool.query(compiled.sql, resolveParams(compiled, params));
        return rows[0] as T | undefined;
      },
      async all<T>(...params: BindParam[]): Promise<T[]> {
        await ensureReady();
        const { rows } = await pool.query(compiled.sql, resolveParams(compiled, params));
        return rows as T[];
      },
      async run(...params: BindParam[]): Promise<{ changes: number }> {
        await ensureReady();
        const res = await pool.query(compiled.sql, resolveParams(compiled, params));
        return { changes: res.rowCount ?? 0 };
      },
    };
  };

  return {
    prepare: statement,
    async exec(sql: string) {
      await ensureReady();
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const s of statements) {
        await pool.query(s);
      }
    },
  };
}

// ── node:sqlite backend ─────────────────────────────────────────────────────

function createSqliteFacade(db: DatabaseSync): DbFacade {
  return {
    prepare(sql: string): Statement {
      const stmt = db.prepare(sql);
      return {
        async get<T>(...params: BindParam[]): Promise<T | undefined> {
          return stmt.get(...(params as unknown as never[])) as T | undefined;
        },
        async all<T>(...params: BindParam[]): Promise<T[]> {
          return stmt.all(...(params as unknown as never[])) as T[];
        },
        async run(...params: BindParam[]): Promise<{ changes: number }> {
          const [first, ...rest] = params;
          const result =
            typeof first === "object" && first !== null && !Array.isArray(first)
              ? stmt.run(first as never, ...(rest as unknown as never[]))
              : stmt.run(...(params as unknown as never[]));
          return { changes: Number(result.changes) };
        },
      };
    },
    exec(sql: string) {
      db.exec(sql);
    },
  };
}

// ── Schema (PostgreSQL) ─────────────────────────────────────────────────────

/**
 * Single source of truth for the db-facade PostgreSQL schema. Applied lazily
 * by getDb() on first query, and explicitly by `npm run db:migrate`
 * (scripts/migrate.ts) — never duplicate these statements elsewhere.
 */
export const PG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('customer','artist','studio','admin')),
    password      TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    consent       INTEGER NOT NULL DEFAULT 0,
    consent_timestamp TEXT,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artist_id   TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    service     TEXT NOT NULL,
    price       INTEGER NOT NULL,
    date        TEXT NOT NULL,
    time        TEXT NOT NULL,
    notes       TEXT,
    event_type  TEXT,
    venue       TEXT,
    guest_count INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested','accepted','confirmed','cancelled','completed')),
    balance_reminder_at TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_verifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_outbox (
    id         TEXT PRIMARY KEY,
    to_email   TEXT NOT NULL,
    subject    TEXT NOT NULL,
    text       TEXT NOT NULL,
    html       TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_preferences (
    user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    booking_created  INTEGER NOT NULL DEFAULT 1,
    quotation_sent   INTEGER NOT NULL DEFAULT 1,
    invoice_sent     INTEGER NOT NULL DEFAULT 1,
    quotation_expiry INTEGER NOT NULL DEFAULT 1,
    balance_reminder INTEGER NOT NULL DEFAULT 1,
    status_changed   INTEGER NOT NULL DEFAULT 1,
    updated_at       TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_retries (
    id           TEXT PRIMARY KEY,
    to_email     TEXT NOT NULL,
    subject      TEXT NOT NULL,
    text         TEXT NOT NULL,
    html         TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_retry   TEXT NOT NULL,
    last_error   TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS artist_profiles (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    artist_id  TEXT NOT NULL,
    claimed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS quotations (
    id          TEXT PRIMARY KEY,
    booking_id  TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    base_fee    INTEGER NOT NULL DEFAULT 0,
    travel_fee  INTEGER NOT NULL DEFAULT 0,
    early_call_fee INTEGER NOT NULL DEFAULT 0,
    accommodation_fee INTEGER NOT NULL DEFAULT 0,
    extras      TEXT NOT NULL DEFAULT '[]',
    artist_note TEXT,
    total       INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','expired','superseded')),
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    sender_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id           TEXT PRIMARY KEY,
    booking_id   TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    type         TEXT NOT NULL DEFAULT 'deposit' CHECK (type IN ('deposit','balance')),
    amount       INTEGER NOT NULL,
    currency     TEXT NOT NULL DEFAULT 'MYR',
    provider     TEXT NOT NULL DEFAULT 'dev',
    status       TEXT NOT NULL DEFAULT 'required'
                 CHECK (status IN ('required','paid','failed','refunded')),
    provider_ref TEXT,
    provider_url TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  -- One payment per booking per type (deposit + balance), never two of the same.
  CREATE TABLE IF NOT EXISTS payouts (
    id             TEXT PRIMARY KEY,
    artist_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    booking_id     TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    gross_sen      INTEGER NOT NULL,
    commission_sen INTEGER NOT NULL,
    net_sen        INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','failed')),
    settleable_at  TEXT,
    settled_at     TEXT,
    notes          TEXT,
    created_at     TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    jti        TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked    INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id            TEXT PRIMARY KEY,
    admin_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    target_table  TEXT NOT NULL,
    target_id     TEXT,
    details       TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS catalog_overrides (
    id          TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('artist','studio')),
    entity_id   TEXT NOT NULL,
    field       TEXT NOT NULL,
    value       TEXT NOT NULL,
    updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    UNIQUE(entity_type, entity_id, field)
  );
  CREATE TABLE IF NOT EXISTS platform_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS artists (
    id            TEXT PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    tagline       TEXT NOT NULL DEFAULT '',
    bio           TEXT NOT NULL DEFAULT '',
    image         TEXT NOT NULL DEFAULT '',
    rating        REAL NOT NULL DEFAULT 0,
    review_count  INTEGER NOT NULL DEFAULT 0,
    state         TEXT NOT NULL DEFAULT '',
    area          TEXT NOT NULL DEFAULT '',
    price_from    INTEGER NOT NULL DEFAULT 0,
    verified      INTEGER NOT NULL DEFAULT 0,
    years_experience INTEGER NOT NULL DEFAULT 0,
    specialties   TEXT NOT NULL DEFAULT '[]',
    services      TEXT NOT NULL DEFAULT '[]',
    bridal        TEXT NOT NULL DEFAULT '[]',
    non_bridal    TEXT NOT NULL DEFAULT '[]',
    availability  TEXT NOT NULL DEFAULT '[]',
    portfolio     TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS studios (
    id            TEXT PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    tagline       TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    image         TEXT NOT NULL DEFAULT '',
    rating        REAL NOT NULL DEFAULT 0,
    review_count  INTEGER NOT NULL DEFAULT 0,
    state         TEXT NOT NULL DEFAULT '',
    area          TEXT NOT NULL DEFAULT '',
    address       TEXT NOT NULL DEFAULT '',
    services      TEXT NOT NULL DEFAULT '[]',
    price_from    INTEGER NOT NULL DEFAULT 0,
    hours         TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id           TEXT PRIMARY KEY,
    entity_type  TEXT NOT NULL CHECK (entity_type IN ('artist','studio')),
    entity_id    TEXT NOT NULL,
    booking_id   TEXT UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    author_name  TEXT NOT NULL,
    rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    event        TEXT,
    text         TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_artists_state_area ON artists(state, area);
  CREATE INDEX IF NOT EXISTS idx_studios_state_area ON studios(state, area);
  CREATE INDEX IF NOT EXISTS idx_reviews_entity ON reviews(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
  CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id);
  CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
  CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
  CREATE INDEX IF NOT EXISTS idx_payouts_artist ON payouts(artist_user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON admin_audit_log(admin_user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_catalog_overrides_entity ON catalog_overrides(entity_type, entity_id);
  -- One active booking per artist/date/time slot (cancelled/completed don't block).
  CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_slot
    ON bookings(artist_id, date, time)
    WHERE status IN ('requested','accepted','confirmed');
`;

// ── Schema (SQLite) ─────────────────────────────────────────────────────────

const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('customer','artist','studio','admin')),
    password   TEXT NOT NULL,
    consent    INTEGER NOT NULL DEFAULT 0,
    consent_timestamp TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artist_id   TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    service     TEXT NOT NULL,
    price       INTEGER NOT NULL,
    date        TEXT NOT NULL,
    time        TEXT NOT NULL,
    notes       TEXT,
    status      TEXT NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested','accepted','confirmed','cancelled','completed')),
    created_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_verifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_outbox (
    id         TEXT PRIMARY KEY,
    to_email   TEXT NOT NULL,
    subject    TEXT NOT NULL,
    text       TEXT NOT NULL,
    html       TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_preferences (
    user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    booking_created  INTEGER NOT NULL DEFAULT 1,
    quotation_sent   INTEGER NOT NULL DEFAULT 1,
    invoice_sent     INTEGER NOT NULL DEFAULT 1,
    quotation_expiry INTEGER NOT NULL DEFAULT 1,
    balance_reminder INTEGER NOT NULL DEFAULT 1,
    status_changed   INTEGER NOT NULL DEFAULT 1,
    updated_at       TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_retries (
    id           TEXT PRIMARY KEY,
    to_email     TEXT NOT NULL,
    subject      TEXT NOT NULL,
    text         TEXT NOT NULL,
    html         TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_retry   TEXT NOT NULL,
    last_error   TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS artist_profiles (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    artist_id  TEXT NOT NULL,
    claimed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS quotations (
    id          TEXT PRIMARY KEY,
    booking_id  TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    base_fee    INTEGER NOT NULL DEFAULT 0,
    travel_fee  INTEGER NOT NULL DEFAULT 0,
    early_call_fee INTEGER NOT NULL DEFAULT 0,
    accommodation_fee INTEGER NOT NULL DEFAULT 0,
    extras      TEXT NOT NULL DEFAULT '[]',
    artist_note TEXT,
    total       INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','expired','superseded')),
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    sender_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id           TEXT PRIMARY KEY,
    booking_id   TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    type         TEXT NOT NULL DEFAULT 'deposit' CHECK (type IN ('deposit','balance')),
    amount       INTEGER NOT NULL,
    currency     TEXT NOT NULL DEFAULT 'MYR',
    provider     TEXT NOT NULL DEFAULT 'dev',
    status       TEXT NOT NULL DEFAULT 'required'
                 CHECK (status IN ('required','paid','failed','refunded')),
    provider_ref TEXT,
    provider_url TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  -- One payment per booking per type (deposit + balance), never two of the same.
  CREATE TABLE IF NOT EXISTS payouts (
    id             TEXT PRIMARY KEY,
    artist_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    booking_id     TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    gross_sen      INTEGER NOT NULL,
    commission_sen INTEGER NOT NULL,
    net_sen        INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','failed')),
    settleable_at  TEXT,
    settled_at     TEXT,
    notes          TEXT,
    created_at     TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    jti        TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked    INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id            TEXT PRIMARY KEY,
    admin_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    target_table  TEXT NOT NULL,
    target_id     TEXT,
    details       TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS catalog_overrides (
    id          TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('artist','studio')),
    entity_id   TEXT NOT NULL,
    field       TEXT NOT NULL,
    value       TEXT NOT NULL,
    updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    UNIQUE(entity_type, entity_id, field)
  );
  CREATE TABLE IF NOT EXISTS platform_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS artists (
    id            TEXT PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    tagline       TEXT NOT NULL DEFAULT '',
    bio           TEXT NOT NULL DEFAULT '',
    image         TEXT NOT NULL DEFAULT '',
    rating        REAL NOT NULL DEFAULT 0,
    review_count  INTEGER NOT NULL DEFAULT 0,
    state         TEXT NOT NULL DEFAULT '',
    area          TEXT NOT NULL DEFAULT '',
    price_from    INTEGER NOT NULL DEFAULT 0,
    verified      INTEGER NOT NULL DEFAULT 0,
    years_experience INTEGER NOT NULL DEFAULT 0,
    specialties   TEXT NOT NULL DEFAULT '[]',
    services      TEXT NOT NULL DEFAULT '[]',
    bridal        TEXT NOT NULL DEFAULT '[]',
    non_bridal    TEXT NOT NULL DEFAULT '[]',
    availability  TEXT NOT NULL DEFAULT '[]',
    portfolio     TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS studios (
    id            TEXT PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    tagline       TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    image         TEXT NOT NULL DEFAULT '',
    rating        REAL NOT NULL DEFAULT 0,
    review_count  INTEGER NOT NULL DEFAULT 0,
    state         TEXT NOT NULL DEFAULT '',
    area          TEXT NOT NULL DEFAULT '',
    address       TEXT NOT NULL DEFAULT '',
    services      TEXT NOT NULL DEFAULT '[]',
    price_from    INTEGER NOT NULL DEFAULT 0,
    hours         TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id           TEXT PRIMARY KEY,
    entity_type  TEXT NOT NULL CHECK (entity_type IN ('artist','studio')),
    entity_id    TEXT NOT NULL,
    booking_id   TEXT UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    author_name  TEXT NOT NULL,
    rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    event        TEXT,
    text         TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_artists_state_area ON artists(state, area);
  CREATE INDEX IF NOT EXISTS idx_studios_state_area ON studios(state, area);
  CREATE INDEX IF NOT EXISTS idx_reviews_entity ON reviews(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
  CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id);
  CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
  CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
  CREATE INDEX IF NOT EXISTS idx_payouts_artist ON payouts(artist_user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON admin_audit_log(admin_user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_catalog_overrides_entity ON catalog_overrides(entity_type, entity_id);
  -- One active booking per artist/date/time slot (cancelled/completed don't block).
  CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_slot
    ON bookings(artist_id, date, time)
    WHERE status IN ('requested','accepted','confirmed');
`;

function migrateSqlite(db: DatabaseSync) {
  db.exec(SQLITE_SCHEMA);

  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userCols.some((c) => c.name === "email_verified")) {
    db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  }
  if (!userCols.some((c) => c.name === "consent")) {
    db.exec("ALTER TABLE users ADD COLUMN consent INTEGER NOT NULL DEFAULT 0");
  }
  if (!userCols.some((c) => c.name === "consent_timestamp")) {
    db.exec("ALTER TABLE users ADD COLUMN consent_timestamp TEXT");
  }
  const paymentCols = db.prepare("PRAGMA table_info(payments)").all() as { name: string }[];
  if (!paymentCols.some((c) => c.name === "provider_url")) {
    db.exec("ALTER TABLE payments ADD COLUMN provider_url TEXT");
  }
  // Legacy payments tables carry UNIQUE(booking_id) — the hybrid model needs
  // one deposit AND one balance payment per booking. SQLite cannot drop a
  // table-level constraint, so rebuild the table when the type column is
  // missing (fresh databases already get the new shape from SQLITE_SCHEMA).
  if (!paymentCols.some((c) => c.name === "type")) {
    db.exec(`
      CREATE TABLE payments_new (
        id           TEXT PRIMARY KEY,
        booking_id   TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        type         TEXT NOT NULL DEFAULT 'deposit' CHECK (type IN ('deposit','balance')),
        amount       INTEGER NOT NULL,
        currency     TEXT NOT NULL DEFAULT 'MYR',
        provider     TEXT NOT NULL DEFAULT 'dev',
        status       TEXT NOT NULL DEFAULT 'required'
                     CHECK (status IN ('required','paid','failed','refunded')),
        provider_ref TEXT,
        provider_url TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      INSERT INTO payments_new (id, booking_id, type, amount, currency, provider, status, provider_ref, provider_url, created_at, updated_at)
        SELECT id, booking_id, 'deposit', amount, currency, provider, status, provider_ref, provider_url, created_at, updated_at FROM payments;
      DROP TABLE payments;
      ALTER TABLE payments_new RENAME TO payments;
    `);
  }
  // Unique (booking_id, type) — created here (not in SQLITE_SCHEMA) so legacy
  // databases are rebuilt first and the column exists before indexing.
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_booking_type ON payments(booking_id, type)",
  );
  const bookingCols = db.prepare("PRAGMA table_info(bookings)").all() as { name: string }[];
  for (const [col, ddl] of [
    ["event_type", "ALTER TABLE bookings ADD COLUMN event_type TEXT"],
    ["venue", "ALTER TABLE bookings ADD COLUMN venue TEXT"],
    ["guest_count", "ALTER TABLE bookings ADD COLUMN guest_count INTEGER NOT NULL DEFAULT 0"],
    ["balance_reminder_at", "ALTER TABLE bookings ADD COLUMN balance_reminder_at TEXT"],
  ] as const) {
    if (!bookingCols.some((c) => c.name === col)) {
      db.exec(ddl);
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let facade: DbFacade | null = null;
let pgPool: Pool | null = null;
let pgReady: Promise<void> | null = null;

export function isPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Synchronous accessor — initialization is sync; pg migration runs lazily. */
export function getDb(): DbFacade {
  if (facade) return facade;

  if (isPostgres()) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_MAX ?? 10),
      connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 10_000),
      // Neon + serverless: short idle timeouts keep the pooler healthy.
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 10_000),
    });
    pool.on("error", (err) => {
      console.error("[db] pg pool error:", err.message);
    });
    pgPool = pool;
    pgReady = (async () => {
      await pool.query(PG_SCHEMA);
      // Applied separately so a missing payments.type on a legacy database
      // cannot roll back the rest of PG_SCHEMA. migrate.ts also creates this.
      try {
        await pool.query(
          "CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_booking_type ON payments(booking_id, type)",
        );
      } catch (err) {
        console.error(
          "[db] payments unique index skipped:",
          err instanceof Error ? err.message : err,
        );
      }
    })().catch((err) => {
      console.error("[db] pg schema migration failed:", err instanceof Error ? err.message : err);
      throw err;
    });
    facade = createPgFacade(pool, () => pgReady!);
    return facade;
  }

  const dataDir = path.join(process.cwd(), "data");
  const dbPath = process.env.LEISH_DB_PATH ?? path.join(dataDir, "leish.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrateSqlite(db);
  facade = createSqliteFacade(db);
  return facade;
}

/** Used by the standalone migration script and tests. */
export async function closeDb(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  facade = null;
  pgReady = null;
}

export function getPgPool(): Pool | null {
  return pgPool;
}

// ── Shared row types + helpers (kept for compatibility with call sites) ─────

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "customer" | "artist" | "studio" | "admin";
  password: string;
  email_verified: number;
  consent: number;
  consent_timestamp: string | null;
  created_at: string;
}

export interface BookingRow {
  id: string;
  user_id: string;
  artist_id: string;
  artist_name: string;
  service: string;
  price: number;
  date: string;
  time: string;
  notes: string | null;
  event_type: string | null;
  venue: string | null;
  guest_count: number;
  balance_reminder_at: string | null;
  status: "requested" | "accepted" | "confirmed" | "cancelled" | "completed";
  created_at: string;
}

/** Public view of a user — never includes the password hash. */
export function toPublicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: Boolean(user.email_verified),
  };
}

/** Cast node:sqlite/pg row output to typed rows. */
export function asRows<T>(value: Record<string, unknown>[]): T[] {
  return value as unknown as T[];
}

/** Cast a typed object for use as named bind parameters. */
export function bind(row: object): Record<string, string | number | bigint | null | Uint8Array> {
  return row as Record<string, string | number | bigint | null | Uint8Array>;
}
