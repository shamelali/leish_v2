-- Enterprise schema with indexes + WAL + constraints
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT CHECK(role IN ('client','artist','studio','admin')) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  consent_at TIMESTAMPTZ, -- PDPA consent timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  jti TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  revoked BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL,
  claimed_artist_id TEXT REFERENCES users(id),
  date DATE NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  status TEXT CHECK(status IN ('requested','quoted','fee_paid','confirmed','completed','cancelled','expired')) DEFAULT 'requested',
  client_email TEXT,
  client_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_artist ON bookings(claimed_artist_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  base_price INTEGER NOT NULL,
  travel_fee INTEGER DEFAULT 0,
  early_call_fee INTEGER DEFAULT 0,
  accommodation_fee INTEGER DEFAULT 0,
  extras JSONB,
  total INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quotations_booking ON quotations(booking_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  billplz_id TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT CHECK(status IN ('pending','paid','failed')) DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_billplz ON payments(billplz_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
