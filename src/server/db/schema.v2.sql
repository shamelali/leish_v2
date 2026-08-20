-- Enterprise schema v2 - fixes for second pass audit
-- Run: psql $DATABASE_URL -f src/server/db/schema.v2.sql
-- Or for SQLite: sqlite3 data/leish.db < src/server/db/schema.v2.sql

-- Sessions with proper indexes
CREATE TABLE IF NOT EXISTS sessions (
  jti TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Bookings with indexes to fix N+1
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_artist_user_id ON bookings(claimed_artist_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);

-- Payments idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_billplz_id ON payments(billplz_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);

-- Quotations
CREATE INDEX IF NOT EXISTS idx_quotations_booking_id ON quotations(booking_id);

-- Enable WAL for SQLite (run separately)
-- PRAGMA journal_mode=WAL;
-- PRAGMA synchronous=NORMAL;
-- PRAGMA busy_timeout=5000;
