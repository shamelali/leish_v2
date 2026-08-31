# Data Model & ERD — Leish! v2

| Field | Value |
|-------|-------|
| **Document ID** | LEISH-DATA-v2.0 |
| **Version** | 2.0.0 |
| **Date** | 2026-08-29 |
| **Source of Truth** | `src/server/db.ts` — `PG_SCHEMA` (line 207) + `SQLITE_SCHEMA` (line 477) |
| **Access Facade** | `getDb(): DbFacade` — `prepare(sql) → Statement {get,all,run}` + `exec(sql)` |
| **Migration** | `scripts/migrate.ts` (`npm run db:migrate`) idempotent; SQLite `migrateSqlite()` auto-runs |

---

### 1. Overview & Conventions

- **Two-backend facade**: `isPostgres()` → `pg.Pool` (production, `DATABASE_URL`) else `node:sqlite DatabaseSync` (`LEISH_DB_PATH` or `data/leish.db`, `WAL` + `foreign_keys=ON`). Placeholders `@name`/`?` translated to `$n` for PG (`compilePlaceholders`).
- **IDs**: `TEXT PK` — `randomUUID()` / `crypto.randomUUID()`.
- **Times**: `TEXT` ISO-8601 `new Date().toISOString()` everywhere (no `TIMESTAMPTZ` variance across backends).
- **Money**: `INTEGER` sen (cents) — never float. Only `artists.rating` is `REAL`.
- **Booleans**: `INTEGER 0/1` (`verified`, `email_verified`, `consent`, `revoked`, `email_preferences` flags).
- **JSON arrays**: `TEXT` containing `JSON.stringify(...)` (`specialties`, `services`, `portfolio`, `extras`, etc.).
- **Cascade**: `bookings/payments/quotations/messages` `CASCADE` on parent delete (PDPA); `admin_audit_log.admin_user_id` `SET NULL` (preserve audit).

 drift guard: `detectSchemaDrift()` warns when `PG_SCHEMA` and `SQLITE_SCHEMA` diverge on tables/columns (dev-time only).

---

### 2. Entity-Relationship Diagram

```
                    ┌─────────────┐
                    │    users    │ PK(id) ─────┐
                    │ id email    │             │
                    │ role        │             │
                    └──────┬──────┘             │
           ┌───────────────┼────────────────┐   │
           │               │                │   │
    FK users.id     FK users.id      FK users.id
           │               │                │
  ┌────────▼────┐  ┌──────▼──────┐  ┌──────▼────────┐
  │  sessions   │  │artist_profs │  │studio_profs   │
  │ jti PK      │  │user_id PK-FK│  │user_id PK-FK  │
  │ user_id FK  │  │artist_id UQ │  │studio_id UQ   │
  └─────────────┘  └──────┬──────┘  └──────┬────────┘
                          │                │
              ┌───────────┤                │
              │           │                │
      ┌───────▼──────┐  ┌─▼────────────────▼───────┐
      │   artists    │  │        studios           │
      │ id PK slug UQ│  │ id PK slug UQ            │
      │ rating REAL  │  │ rating REAL              │
      └──────┬───────┘  └──────────┬───────────────┘
             │                     │
             └─────────┬───────────┘
                       │ artist_id / studio_id (polymorphic-ish; FK in bookings is loose for flexibility)
       ┌───────────────▼─────────────────┐
       │           bookings              │ PK(id)
       │ user_id FK→users                │
       │ artist_id (text, no FK strict)  │  ┌─ UNIQUE partial index uq_bookings_slot
       │ studio_id FK→studios SET NULL   │  │  ON (artist_id, date, time) WHERE status IN (…)
       │ status CHECK(requested…)       │
       │ date,time,service,price,notes… │
       └──────┬──────────┬──────┬────────┘
              │          │      │
     ┌────────▼──┐ ┌─────▼──┐ ┌─▼────────┐
     │quotations │ │payments│ │ messages │
     │booking FK │ │booking │ │ booking  │
     │status CHK │ │type    │ │ sender   │
     └───────────┘ │UNIQUE(b│ └──────────┘
                   │ooking,│        │
                   │type)  │        │
                   └───────┼────────┘
                           │
                    ┌──────▼──────┐
                    │   payouts   │ PK(id) FK booking→bookings CASCADE, artist_user_id→users SET NULL
                    │ booking_id  │
                    │ gross/comms │
                    │ net status  │
                    └─────────────┘

     ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
     │   reviews    │  │  referrals   │  │  platform_settings│ PK(key)
     │ entity_type  │  │ referrer/ref │  │  value  updated_by│
     │ entity_id    │  │ referee      │  └──────────────────┘
     │ booking UNIQUE│ └──────────────┘
     └──────────────┘

     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │email_outbox  │  │email_retries │  │email_prefs   │ PK(user_id FK)
     └──────────────┘  └──────────────┘  └──────────────┘

     ┌─────────────────────┐  ┌──────────────┐
     │email_verifications  │  │password_resets│ PK(id) FK user
     └─────────────────────┘  └──────────────┘

     ┌──────────────────┐
     │ admin_audit_log  │ PK(id) FK admin_user_id→users SET NULL
     └──────────────────┘

     Legacy removed scaffold: catalog_overrides (kept for migration but folded into real columns at seed)
```

---

### 3. Table Dictionaries

#### 3.1 `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK, `randomUUID()` | Public user id (`toPublicUser` strips `password`) |
| `email` | TEXT | UNIQUE, lowercased | Login key; `idx_users_email` |
| `name` | TEXT | NOT NULL | Display name (2–80 validated) |
| `role` | TEXT | CHECK `customer|artist|studio|admin` | See `src/lib/types.ts:1` |
| `password` | TEXT | NOT NULL | scrypt hash (+ pepper HMAC if `PEPPER_SECRET`) |
| `email_verified` | INTEGER | 0/1 default 0, backfilled via `migrateSqlite` when missing | Verification gate |
| `consent` | INTEGER | 0/1 default 0 | PDPA consent flag |
| `consent_timestamp` | TEXT | nullable ISO | When consent was given |
| `created_at` | TEXT | NOT NULL ISO | |

**Indexes**: `idx_users_email(email)`.
**Backfill**: SQLite adds `email_verified`, `consent`, `consent_timestamp` via `ALTER TABLE` when absent.

#### 3.2 `artists` (runtime catalog)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | `aisha-azman` for seeds, UUID for admin-created |
| `slug` | TEXT | UNIQUE | URL key; seeded `slug===id`; dedup via `slugifyName()+suffix` |
| `name` | TEXT | NOT NULL | |
| `tagline` | TEXT | default '' | |
| `bio` | TEXT | default '' | |
| `image` | TEXT | default '' | URL or `/images/...` |
| `rating` | REAL | default 0 | Blended atomically (2dp) |
| `review_count` | INTEGER | default 0 | |
| `state` | TEXT | default '' | `MALAYSIA_STATES` value |
| `area` | TEXT | default '' | within state's `AREAS_BY_STATE` |
| `price_from` | INTEGER | default 0 | sen; min service price |
| `verified` | INTEGER | 0/1 default 0 | Admin-only field |
| `years_experience` | INTEGER | default 0 | |
| `specialties` | TEXT | JSON `[]` | string[] |
| `services` | TEXT | JSON `[]` | `Service[] {name,price,duration}` |
| `bridal` | TEXT | JSON `[]` | `BridalEvent[]` |
| `non_bridal` | TEXT | JSON `[]` | `NonBridalEvent[]` |
| `availability` | TEXT | JSON `[]` | string[] slots e.g. "Tomorrow, 10:00 AM" |
| `portfolio` | TEXT | JSON `[]` | image URLs |
| `referral_code` | TEXT | default '' | Assigned via `assignReferralCode` |
| `referred_by` | TEXT | FK artists(id) SET NULL | Referrer |
| `referral_earnings` | INTEGER | default 0 | sen |
| `created_at`,`updated_at` | TEXT | NOT NULL | |

**Indexes**: `idx_artists_state_area(state,area)`.

#### 3.3 `studios` — same shape, replaces `tagline→description?` Actually both `tagline`+`description`; `services` is `string[]` not `Service[]`; plus `address`, `hours`, `phone`.

Full DDL identical to `PG_SCHEMA` block lines 403–424.

#### 3.4 `bookings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `user_id` | TEXT | FK users CASCADE | Customer owner; `idx_bookings_user` |
| `artist_id` | TEXT | NOT NULL | Catalog artist booked (text, intentionally not strict FK for seed flexibility) |
| `studio_id` | TEXT | FK studios SET NULL, nullable | Studio variant (Option B); backfilled |
| `artist_name` | TEXT | NOT NULL | Denormalized at booking time for fast display |
| `service` | TEXT | NOT NULL | Service name chosen |
| `price` | INTEGER | NOT NULL | sen; server-derived from `artist.services.find(service).price` |
| `date` | TEXT | `YYYY-MM-DD` | Event date (`≥ today` at creation) |
| `time` | TEXT | NOT NULL | Slot label ("10:00 AM" etc) |
| `notes` | TEXT | nullable | ≤2000 chars |
| `event_type` | TEXT | nullable | e.g. "solemnization" (backfilled) |
| `venue` | TEXT | nullable | ≤200 chars (backfilled) |
| `guest_count` | INTEGER | default 0 | 0–1000 (backfilled) |
| `status` | TEXT | CHECK `requested|accepted|confirmed|cancelled|completed` default requested | State machine |
| `balance_reminder_at` | TEXT | nullable ISO | When reminder sent (backfilled) |
| `created_at` | TEXT | NOT NULL | |

**Critical constraint**:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_slot
  ON bookings(artist_id, date, time)
  WHERE status IN ('requested','accepted','confirmed');
```
Prevents double-booking live slots; cancelled/completed don't block.

#### 3.5 `quotations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `booking_id` | TEXT | FK bookings CASCADE | |
| `base_fee` | INTEGER | default 0 | sen |
| `travel_fee` | INTEGER | default 0 | |
| `early_call_fee` | INTEGER | default 0 | |
| `accommodation_fee` | INTEGER | default 0 | |
| `extras` | TEXT | JSON `[]` | `ExtraItem[] {label, amount sen}` ≤10 |
| `artist_note` | TEXT | nullable | ≤1000 |
| `total` | INTEGER | NOT NULL | `quotationTotal()` computed sen |
| `status` | TEXT | CHECK `pending|paid|expired|superseded` default pending | |
| `created_at`,`expires_at` | TEXT | NOT NULL | `expires_at = created_at + 24h` |

#### 3.6 `payments` (hybrid)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | `PaymentRecord.id` |
| `booking_id` | TEXT | FK bookings CASCADE | `idx_payments_booking` |
| `type` | TEXT | CHECK `deposit|balance` default deposit | |
| `amount` | INTEGER | NOT NULL | sen |
| `currency` | TEXT | default MYR | |
| `provider` | TEXT | default dev | `dev|billplz` |
| `status` | TEXT | CHECK `required|paid|failed|refunded` default required | |
| `provider_ref` | TEXT | nullable | Billplz `id` or `dev_…` |
| `provider_url` | TEXT | nullable | Billplz hosted page URL |
| `created_at`,`updated_at` | TEXT | NOT NULL | |

**Unique**: `CREATE UNIQUE INDEX uq_payments_booking_type ON payments(booking_id,type)` — one deposit + one balance per booking.
**Migration**: legacy single-`UNIQUE(booking_id)` tables rebuilt to this shape; backfill adds `type` and `provider_url` if missing.

#### 3.7 `payouts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `artist_user_id` | TEXT | FK users SET NULL | Claimed artist user (nullable when unclaimed) |
| `booking_id` | TEXT | FK bookings CASCADE | one payout per booking |
| `gross_sen` | INTEGER | NOT NULL | quotation.total |
| `commission_sen` | INTEGER | NOT NULL | computed via `computeCommission` |
| `net_sen` | INTEGER | NOT NULL | `max(0, gross - commission - deposit)` |
| `status` | TEXT | CHECK `pending|settled|failed` default pending | |
| `settleable_at` | TEXT | nullable ISO | `eventDate+24h` |
| `settled_at` | TEXT | nullable ISO | set when `settled` |
| `notes` | TEXT | nullable | "Commission waived (small booking)" etc |
| `created_at` | TEXT | NOT NULL | |

**Indexes**: `idx_payouts_status`, `idx_payouts_artist`.
**Cardinality**: ≤1 per `booking_id` (app guard; could be made `UNIQUE` in future).

#### 3.8 `sessions` (JTI revocation)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `jti` | TEXT | PK | JWT ID |
| `user_id` | TEXT | FK users CASCADE | owner; `idx_sessions_user` |
| `revoked` | INTEGER | 0/1 default 0 | revoked=1 means blocked |
| `expires_at` | TEXT | NOT NULL | `exp` mirrored for cleanup |
| `created_at` | TEXT | NOT NULL | |

#### 3.9 `reviews`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `entity_type` | TEXT | CHECK `artist|studio` | polymorphic target |
| `entity_id` | TEXT | NOT NULL | `artists.id` or `studios.id` |
| `booking_id` | TEXT | UNIQUE FK bookings CASCADE | gates: one review per booking |
| `user_id` | TEXT | FK users SET NULL | author; nullable for seed rows |
| `author_name` | TEXT | NOT NULL | denormalized display name |
| `rating` | INTEGER | CHECK 1–5 | rounded int |
| `event` | TEXT | nullable | service/event label |
| `text` | TEXT | NOT NULL | review body |
| `created_at` | TEXT | NOT NULL | |

**Index**: `idx_reviews_entity(entity_type,entity_id)`.

#### 3.10 `referrals`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `referrer_type` | TEXT | CHECK `artist|studio` | who referred |
| `referrer_id` | TEXT | NOT NULL | |
| `referee_type` | TEXT | CHECK `artist|studio` | who was referred |
| `referee_id` | TEXT | NOT NULL | |
| `status` | TEXT | CHECK `pending|qualified|paid` default pending | |
| `reward_sen` | INTEGER | default 0 | earned |
| `qualified_at`,`paid_at` | TEXT | nullable ISO | |
| `created_at` | TEXT | NOT NULL | |

**Indexes**: `idx_referrals_referrer`, `idx_referrals_referee`, `idx_referrals_status`.

#### 3.11 `messages`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `booking_id` | TEXT | FK bookings CASCADE | `idx_messages_booking` |
| `sender_id` | TEXT | FK users CASCADE | |
| `body` | TEXT | NOT NULL | message text |
| `created_at` | TEXT | NOT NULL | ordered ASC for replay |

#### 3.12 Communication & Email Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `email_outbox` | `id, to_email, subject, text, html, created_at` | dev provider sink; viewable at `/dev/emails` |
| `email_retries` | `id,to_email,subject,text,html,attempts,max_attempts=3,next_retry,last_error,created_at` | Async retry queue up to 3 attempts |
| `email_preferences` | `user_id PK FK, booking_created, quotation_sent, invoice_sent, quotation_expiry, balance_reminder, status_changed INTEGER 0/1 default1, updated_at` | Per-user toggles |
| `email_verifications` | `id,user_id FK CASCADE, token_hash, expires_at, used_at, created_at` | Single-use, hashed token for verification |
| `password_resets` | `id,user_id FK CASCADE, token_hash, expires_at, used_at, created_at` | Single-use 1h hashed reset |

#### 3.13 Operational Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `artist_profiles` | `user_id PK FK CASCADE, artist_id TEXT UNIQUE, claimed_at` | Artist/studio claims — scope filter |
| `studio_profiles` | `user_id PK FK CASCADE, studio_id TEXT UNIQUE, claimed_at` | Same for studios |
| `platform_settings` | `key PK, value TEXT, updated_by FK SET NULL, updated_at` | Runtime knobs: `booking_fee_sen`, `commission_rate_bps`, `commission_waiver_sen` |
| `admin_audit_log` | `id PK, admin_user_id FK SET NULL, action, target_table, target_id, details JSON '{}', created_at` | Audit trail; indexes on `admin_user_id`, `created_at` |
| `catalog_overrides` | `id PK, entity_type, entity_id, field, value, updated_by, created_at, updated_at, UNIQUE(entity_type,entity_id,field)` | Legacy — folded into real columns at seed; kept for migration but `idx_catalog_overrides_entity` still indexed |

**Note** on FKs in tests: `admin_audit_log.admin_user_id → users(id)` has real FK; tests must seed a user row before inserting audit.

---

### 4. Constraints & Indexes (Summary)

| Constraint / Index | SQL excerpt | Purpose |
|--------------------|-------------|---------|
| `uq_bookings_slot` | `UNIQUE(artist_id,date,time) WHERE status IN (…)` | Anti double-booking |
| `uq_payments_booking_type` | `UNIQUE(booking_id,type)` | One deposit + one balance |
| `uq_artist_profiles_artist_id` | `UNIQUE(artist_id)` | One owner per artist |
| `uq_studio_profiles_studio_id` | `UNIQUE(studio_id)` | One owner per studio |
| `reviews.booking_id UNIQUE` | Column constraint | One review per booking |
| Role checks | `CHECK role IN (…)` etc | Enforce vocabularies |
| State checks | `CHECK status IN (…)` | Enforce booking/quote/payment/payout states |
| Range checks | `CHECK rating BETWEEN 1 AND 5` | Validate rating |
| Foreign keys | `REFERENCES … ON DELETE CASCADE/SET NULL` | PDPA & audit semantics |
| Area index | `idx_artists_state_area(state,area)` | Fast catalog pre-filter |
| Booking user index | `idx_bookings_user(user_id)` | Customer booking list |
| Payment booking index | `idx_payments_booking(booking_id)` | Serialization join |

---

### 5. Money Logic & Derived Fields

**Quoting** (`src/server/quotations.ts:44`):
```ts
function quotationTotal(input): number {
  return input.baseFee + (travelFee??0) + (earlyCallFee??0) + (accommodationFee??0) + sum(extras.amount)
}
```
Stored in `quotations.total`; never float.

**Commission** (`src/server/settings.ts:100`):
```ts
function computeCommission(totalSen, rateBps, waiverSen) {
  const waived = total < waiverSen;
  const commissionSen = waived ? 0 : Math.round(total * rateBps / 10000);
  return { totalSen, waived, commissionSen, artistNetSen: total - commissionSen };
}
```
**Payout net** (`src/server/payouts.ts:79`): `artistReceivesSen = max(0, artistNetSen - depositSen)` where `depositSen = getBookingFeeSen()`.

**Booking serialization** (`src/app/api/bookings/route.ts:39`): `balanceDueDate = eventDate - 3 days`, `balanceAmount = max(0, total - fee)` when quotation exists and not expired.

---

### 6. Seeding & Migration

#### 6.1 Catalog Seeding (Idempotent)

- Source: `SEED_ARTISTS` (7 entries) + `SEED_STUDIOS` (4) `src/lib/data.ts`.
- Runner: `ensureCatalogSeeded()` called lazily before first catalog read AND explicitly via `npm run db:seed-catalog` (`scripts/seed-catalog.ts`).
- Logic: Inserts new `artists/studios` rows when missing; legacy `catalog_overrides` rows are **folded** into real columns and deleted (so old overrides don't drift).
- Placeholders: Admin-created artists without image get `/images/hero.jpg` to satisfy `next/image` requirements.

#### 6.2 Admin Seeding

- `scripts/seed-admin.ts`: reads `ADMIN_EMAIL/ADMIN_PASSWORD`, upserts `users` (`role='admin'`), hash via scrypt; idempotent upgrade of existing non-admin user.

#### 6.3 Schema Migrations

- **Postgres**: `PG_SCHEMA` applied lazily on `getDb()` first query via `pool.query(PG_SCHEMA)` in `pgReady`; explicitly via `scripts/migrate.ts`.
- **SQLite**: `SQLITE_SCHEMA` + `migrateSqlite(db)` additive `ALTER TABLE` + partial-index creation; supports aging DBs lacking newer columns (`email_verified`, `provider_url`, `type`, etc.).
- Both backends apply `CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_booking_type` separately to avoid rollback of entire schema on legacy databases.

---

### 7. Data Retention & Lifecycle

Per `docs/PDPA_RETENTION_GUIDELINES.md`:

| Entity | Retention | Deletion |
|--------|-----------|----------|
| `users` | Until account deletion; then anonymized audit log retained with `admin_user_id→null` | `DELETE /api/me` cascades bookings/messages/payments via FK `CASCADE` |
| `bookings/quotations/payments` | 7 years for financial audit (configurable) | Cascade on user delete; admin may override status but never hard-delete for audit |
| `messages` | Same as booking | Cascade |
| `reviews` | Indefinite (anonymized if user deleted → `user_id null` kept) | No hard delete of public proof |
| `sessions` | Expire after `expires_at`; gc via cron or lazy cleanup | `revoked` rows inert |
| `email_outbox` | Dev only; not retention-bound | Ephemeral |

---

### 8. Verification of Model

| Check | Method |
|-------|--------|
| PG_SCHEMA vs SQLite drift | `extractSchemaTables()` + `detectSchemaDrift()` warning (dev) — run `npm run db:migrate` and compare `PG_SCHEMA` / `SQLITE_SCHEMA` tables+columns |
| Placeholder translation | Unit tests `compilePlaceholders/resolveParams` |
| FK enforcement | Integration tests with `:memory:` SQLite `foreign_keys=ON` |
| Money integer | Lint grep for float amounts in `src/server/{payments,quotations,payouts}.ts` |
| Index coverage | `EXPLAIN QUERY PLAN` on `listArtists(state,area)` must use `idx_artists_state_area` |

---

*Next: `docs/07-API-Specification.md` details HTTP contracts over this model; `docs/08-Traceability-Matrix.md` maps requirements to tables and endpoints.*
