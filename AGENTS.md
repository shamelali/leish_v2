# Leish v2 — Enterprise Grade Agents Guide

## Project Overview

Leish v2 is a Next.js 16 (app router) platform connecting clients with beauty artists/studios in Malaysia. It handles:

- Artist/studio discovery and booking
- Session management (JWT cookies, 7-day TTL)
- Payment processing via Billplz (Malaysian gateway)
- Transactional emails via Resend/Postmark (dev outbox by default)
- Structured logging with pino + webhook forwarding
- PostgreSQL primary, SQLite fallback for local dev/tests

**Key URLs:**

- Source: `src/` (app router, components, lib, server)
- Config: `.env.local` (production), `.env.example` (template)
- Deploy: Vercel (`vercel deploy --prod`)

---

## Architecture Patterns

### 1. Data Layer — Catalog (`src/lib/data.ts` + `src/server/catalog.ts`)

- `src/lib/data.ts` is **seed data + constants only** (`SEED_ARTISTS`,
  `SEED_STUDIOS`, `MALAYSIA_STATES`, `AREAS_BY_STATE`, event lists) — never
  import runtime catalog entities from it
- **Runtime source of truth = DB tables** `artists` / `studios` / `reviews`
- Repository: `src/server/catalog.ts` — `listArtists(filters)` (SQL pre-filter
  on state/area/budget + pure `filterArtists()` for tags/query),
  `getArtistById()`, `getArtistBySlug()`, studio equivalents,
  `updateArtist()/updateStudio()` (whitelisted fields), review helpers
  (`addEntityReview`, `findReviewableBooking`, `listEntityReviews`)
- Seeding: `src/server/catalog-seed.ts` — idempotent; runs lazily before the
  first catalog read AND explicitly via `npm run db:seed-catalog`; folds
  legacy `catalog_overrides` rows into real columns and deletes them
- Slugs equal the original static ids (e.g. `aisha-azman`) so existing links
  and bookings keep working
- Live reviews are gated on a COMPLETED, not-yet-reviewed booking
  (`reviews.booking_id` UNIQUE); new ratings blend incrementally into the
  seeded aggregate (`rating`/`review_count` columns)
- Artist self-service profile edits: `PATCH /api/artist-profiles` scoped to
  claimed profiles (`artist_profiles` table)

### 1b. Database Facade (`src/server/db.ts`)

- **Two-backend facade**: PostgreSQL (`DATABASE_URL`) or node:sqlite
- `getDb()` is synchronous — init is sync; pg schema migrates lazily on first query
- `DbFacade` interface: `prepare(sql)`, `exec(sql)`, `get<T>()`, `all<T>()`, `run()`
- Placeholder translation: `@name` / `?` → pg `$1..$n`
- Schema (`PG_SCHEMA` / `SQLITE_SCHEMA`): users, bookings, payments, quotations, artist_profiles, etc.

### 3. Session & Auth (`src/server/session.ts`)

- HS256 JWT signed with `SESSION_SECRET` (32-byte base64)
- Cookie: `leish_session` (httpOnly, secure@prod, sameSite=lax, 7-day TTL)
- JTI revocation tracking in the `sessions` table via the db-facade (SQLite/Postgres)
- `createSessionToken()`, `verifySessionToken()`, `revokeSession()`

### 4. Error Reporting (`src/server/errors.ts`)

- Structural pino logging always
- Sentry envelope POST when `SENTRY_DSN` set
- Fallback webhook POST to `ERROR_WEBHOOK_URL`
- `reportError(err, context)` — entry point for all errors

### 5. Logging (`src/server/logger.ts`)

- pino instance (`logger`)
- JSON lines in production, pretty-printed in dev
- `LOG_LEVEL` env override (defaults to `info`)
- `LOG_WEBHOOK_URL` forwards every line as JSON batch

### 6. Validation (`src/server/validation.ts`)

- Zod schemas: `registerSchema`, `loginSchema`, `bookingSchema`, `quotationSchema`, `artistsQuerySchema`
- Cross-references `MALAYSIA_STATES`, `BRIDAL_EVENTS`, `NON_BRIDAL_EVENTS`
- Types inferred via `z.infer`

### 2. Payments (`src/lib/payments/billplz.ts` + `src/server/payments.ts`)

- Billplz API: `createBill()`, `verifyWebhookSignature()` (HMAC-SHA256)
- Signature fields (ordered): `amount|collection_id|id|paid|paid_amount|state`
- `BILLPLZ_X_SIGNATURE_KEY` required for webhook verification
- `BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, `BILLPLZ_BASE_URL`, `BILLPLZ_X_SIGNATURE_KEY`

### 2b. Hybrid Payment Model (`src/server/payments.ts`)

- Two payment types per booking (`payments.type`, UNIQUE `(booking_id, type)`):
  - `deposit` — flat non-refundable amount (settings: `booking_fee_sen`,
    default RM 50), paid to confirm the booking
  - `balance` — quotation total − deposit, due 3 days before the event
- Commission is artist-side: client always pays exactly the quoted price.
  Compute via `computeCommission(total, rateBps, waiverSen)` from
  `src/server/settings.ts` (`commission_rate_bps` default 10%,
  `commission_waiver_sen` default RM 100 — totals below the waiver are
  commission-free)
- Payouts (`src/server/payouts.ts`): per-booking settlement rows created when
  a balance payment lands; statuses `pending | settled | failed`; admin
  settle/fail via `/api/admin/payouts`
- Webhook routes by payment type before mutating booking state

### 8. Email (`src/server/email.ts`)

- Provider abstraction: `sendEmail()` dispatches to dev outbox / Resend / Postmark / Brevo
- Selected by `EMAIL_PROVIDER`; `resend` needs `RESEND_API_KEY`, `postmark` needs
  `POSTMARK_SERVER_TOKEN`, `brevo` needs `BREVO_API_KEY`, and all use `EMAIL_FROM`
- **Vercel Connect support**: API keys are resolved from Connect API-key connectors
  (`api-key/resend`, `api-key/postmark`, `api-key/brevo`) first, falling back to
  env vars. This lets you manage email credentials centrally in the Vercel dashboard.
- Failed emails are queued in `email_retries` with exponential backoff (1min, 5min, 25min)
- Booking emails composed in `src/server/booking-emails.ts`

### 8b. Analytics (`src/server/agnost.ts` + `src/lib/agnost-client.ts`)

- **Server-side**: `agnostai` SDK initialized in `src/instrumentation.ts` at startup
- **Client-side**: `src/lib/agnost-client.ts` — `trackEvent()`, `trackArtistView()`, `trackSearch()`, `trackBookingForm()`
- **Org ID**: `AGNOST_ORG_ID` (server) + `NEXT_PUBLIC_AGNOST_ORG_ID` (client)
- **Dashboard**: `https://app.agnost.ai/projects/3e27e121-654d-4746-ba55-7996f21bb351`
- **Instrumented routes**:
  - `POST /api/auth/register` — user registration
  - `POST /api/auth/login` — login attempts
  - `POST /api/bookings` — booking creation
  - `PATCH /api/bookings/[id]` — booking status updates (accept/reject/complete/cancel)
  - `POST /api/bookings/[id]/quotation` — quotation generation
  - `POST /api/payments/webhook` — payment success/failure
  - `PATCH /api/artist-profiles` — profile edits
- **Frontend tracking**: `ArtistsBrowser` component tracks filter/search interactions
- **Pattern**: `agnost.begin({ userId, agentName, input })` → `interaction.end(output, success)`

### 9. Theme (`src/lib/theme.tsx`)

- `ThemeProvider` / `useTheme()` with localStorage persistence
- Default: `dark`; inline script in `layout.tsx` avoids CLS

### 10. API Routes (`src/app/api/`)

- `/api/auth/*` — login/register/logout (token-based)
- `/api/bookings/*` — booking flow (pay-fee = deposit, pay-balance)
- `/api/quotations/*` — quotation generation
- `/api/payments/*` — Billplz webhook handler (routes by payment type)
- `/api/artists/*` — public catalog + reviews
- `/api/catalog/*` — full-catalog reads for client components
- `/api/artist-profiles` — claim + self-service profile edits
- `/api/admin/*` — admin panel (all under `requireAdmin()`)
- `/api/health` — health check (used by Docker HEALTHCHECK)

---

## Development Workflow

| Command                   | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `npm run dev`             | Next.js dev mode (`NODE_ENV=development`) |
| `npm run build`           | `next build` (sets `NODE_ENV=production`) |
| `npm run start`           | `next start` (production server)          |
| `npm run lint`            | ESLint (`eslint-config-next`)             |
| `npm run typecheck`       | `tsc --noEmit`                            |
| `npm test`                | Vitest suite (`jsdom` environment)        |
| `npm run test:coverage`   | Vitest + HTML coverage report             |
| `npm run env:check`       | Validate required env vars                |
| `npm run db:migrate`      | Apply/verify PostgreSQL schema            |
| `npm run db:seed-catalog` | Seed artists/studios/reviews tables       |
| `npm run format`          | Prettier auto-fix                         |
| `npm run format:check`    | Prettier check                            |

**Git branching:** `main` only. PRs require passing:

- `quality-gate.yml` (lint, typecheck, test, coverage ≥ 80%, format)
- `ci.yml` (test, lint, typecheck on PR)

---

## Production Deployment Checklist

### 1. Environment Variables (`/.env.local`)

**Required in production:**

- `NEXT_PUBLIC_SITE_URL` — site URL for metadata, sitemap, verification links
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — **never** expose to client
- `SESSION_SECRET` — 32-byte base64 generated via `openssl rand -base64 32`
- `DATABASE_URL` — PostgreSQL connection string (Neon/Supabase pooler)
- `BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, `BILLPLZ_X_SIGNATURE_KEY`
- `EMAIL_PROVIDER` — `dev` | `resend` | `postmark` (default: `dev`)
- `RESEND_API_KEY` — required when `EMAIL_PROVIDER=resend` (or use Vercel Connect API-key connector)
- `POSTMARK_SERVER_TOKEN` — required when `EMAIL_PROVIDER=postmark` (or use Vercel Connect API-key connector)
- `BREVO_API_KEY` — required when `EMAIL_PROVIDER=brevo` (or use Vercel Connect API-key connector)
- `EMAIL_FROM` — sender address (default: `Leish! <no-reply@leish.my>`)
- `LOG_LEVEL` — `info` | `debug` | `warn` | `error`
- `PG_MAX` / `PG_CONNECTION_TIMEOUT_MS` / `PG_IDLE_TIMEOUT_MS` (optional pool tuning)

**Optional but recommended:**

- `POSTGRES_URL` — validated by `checkPostgresUrl()` in `src/env.ts`
- `UPSTASH_REST_URL` / `UPSTASH_REST_TOKEN` — distributed rate limiting
- `SENTRY_DSN` — error reporting
- `ERROR_WEBHOOK_URL` — fallback error sink
- `LOG_WEBHOOK_URL` — log forwarding
- `PEPPER_SECRET` — password pepper (scrypt hashing)
- `CRON_SECRET`, `INTERNAL_API_SECRET` — internal endpoints
- `AGNOST_ORG_ID` — Agnost AI analytics org ID
- `NEXT_PUBLIC_AGNOST_ORG_ID` — client-side Agnost tracking

### 2. Vercel Settings

- Set all env vars in the Vercel dashboard (Production & Preview)
- `NEXT_PUBLIC_SITE_URL` must match the Vercel domain or custom domain
- `output: "standalone"` is set in `next.config.ts` (used by the Dockerfile;
  Vercel ignores it and uses its own build output)

### 3. Database Migrations

- Run `npm run db:migrate` (scripts/migrate.ts) to apply/verify the PostgreSQL
  schema against `DATABASE_URL` (idempotent; also backfills additive columns
  such as `payments.type`)
- Run `npm run db:seed-catalog` to populate `artists` / `studios` / `reviews`
  and fold legacy overrides (also happens lazily on first catalog read)
- SQLite applies the schema automatically on first `getDb()` call
- CI: `database.yml` runs `npm run db:migrate` when `db.ts`/`migrate.ts` change
- Schema is defined in `src/server/db.ts` (`PG_SCHEMA` / `SQLITE_SCHEMA`) — keep
  both backends in sync when adding columns

### 4. Docker (Optional)

- Build: `docker build -t leish-v2 .`
- Run: `docker run -p 3000:3000 --env-file .env.local leish-v2`
- Health check: `http://localhost:3000/api/health`
- See `Dockerfile` for multi-stage builder (node:20-alpine)

### 5. Verification Steps Before Go-Live

1. `npm run build` — successful build with no errors
2. `npm run typecheck` — zero TypeScript errors
3. `npm run lint` — zero lint warnings
4. `npm run env:check` — no missing required vars (in production mode)
5. `npm test` — all vitest tests pass
6. `npm run test:coverage` — coverage ≥ 80%
7. Verify `DATABASE_URL` connects to PostgreSQL
8. Test Billplz webhook signature verification
9. Test email sending (Resend/Postmark) in a staging environment
10. Check that `SESSION_SECRET` is set and not the dev fallback

---

## Security Considerations

### 1. Session Secrets

- `SESSION_SECRET` **must** be 32 random bytes (base64) in production
- Never commit to repo — use Vercel/env or CI secrets
- Rotate periodically; bump `PEPPER_VERSION` when rotating password pepper

### 2. Database Access

- `SUPABASE_SERVICE_ROLE_KEY` has full admin access — use only server-side
- Never expose to browser; all API routes use supabase server client
- Row-level security (RLS) recommended on Supabase tables

### 3. Payment Security

- `BILLPLX_X_SIGNATURE_KEY` must be kept secret — verifies webhook integrity
- Webhook signature: HMAC-SHA256 of `amount|collection_id|id|paid|paid_amount|state`
- Verify signature **before** marking bookings as paid (already implemented in `billplz.ts`)

### 4. Rate Limiting

- Distributed via Upstash Redis (optional): `UPSTASH_REST_URL`, `UPSTASH_REST_TOKEN`
- Falls back to in-memory when unset — not suitable for multi-instance prod

### 5. Headers

- next.config.mjs already sets:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`

### 6. Content Security

- No inline scripts except theme toggle (SSR-safe, injected in `layout.tsx`)
- `next/config` `images.remotePatterns` locked to `*.supabase.co`

---

## Testing Strategies

### 1. Unit Tests (`vitest`)

- Location: `src/**/*.test.{ts,tsx}`
- Coverage: `src/lib/` and `src/components/`, excluding `src/lib/data.ts`
- Run: `npm test` or `npm run test:coverage`
- CI threshold: ≥ 80% (quality-gate.yml)

### 2. Test Categories

- **Auth**: login/register/token verification
- **Booking**: validation, quota, artist availability
- **Payments**: Billplz signature verification (see `billplz-webhook.yml`)
- **Email**: template rendering (no send in unit tests — use mock)
- **Utils**: `formatRM()`, `cn()`, `pluralize()`
- **Types**: inferred from Zod schemas

### 3. E2E Tests (`playwright`)

- Location: `e2e/`
- Requires: `SESSION_SECRET=e2e-test-secret` (CI only)
- Run: `npx playwright test`
- CI: installed browsers via `playwright install --with-deps chromium`

### 4. Test Isolation

- `src/env.ts` `validateEnv()` skips required checks during `build`/`phase-production-build`
- Tests provide minimal env (e.g., `SESSION_SECRET` in `playwright.config.ts`)
- `db.ts` switches to `:memory:` SQLite when `DATABASE_URL` not set

---

## Observability

### 1. Structured Logging

- `logger` from `src/server/logger.ts` (pino)
- JSON format in production; pretty-printed in dev
- Example: `logger.info({ route, userId, message }, "request completed")`

### 2. Log Forwarding

- Set `LOG_WEBHOOK_URL` to forward every log line as JSON batch
- Batching: 20 lines per POST, debounced at 50ms
- Use with: DataDog, OTel, self-hosted ELK, etc.

### 3. Error Reporting

- `reportError(err, context)` in `src/server/errors.ts`
- Sentry envelope when `SENTRY_DSN` set
- Fallback webhook when `ERROR_WEBHOOK_URL` set
- Never includes client-facing stack internals

### 4. Metrics & Health

- Docker HEALTHCHECK: `http://localhost:3000/api/health`
- Consider adding `/api/metrics` endpoint for Prometheus if needed
- `NEXT_PUBLIC_SITE_URL` used for Sentry `server_name` enrichment

---

## Performance Considerations

### 1. Next.js Config

- `output: "standalone"` — standalone output for Docker/Vercel
- `images.remotePatterns` restricted to `*.supabase.co`
- Headers: security directives (frame-options, content-type, referrer)

### 2. Tailwind CSS 4

- Purge via `content: ["./src/app/**/*.{ts,tsx}", ...]`
- Production build minimizes CSS tree-shaking

### 3. Database Pool

- `PG_MAX` defaults to 10; tune based on connection pooler limits (Neon: ~20-50)
- `PG_CONNECTION_TIMEOUT_MS` and `PG_IDLE_TIMEOUT_MS` control pool health
- Monitor for connection leaks; use `pgPool.end()` on shutdown

### 4. Image Optimization

- Next.js serves images from `*.supabase.co` via optimized proxy
- Consider CDN for static assets (`/images/`)

### 5. Caching

- `TURBO_CACHE`, `TURBO_DOWNLOAD_LOCAL_ENABLED`, `TURBO_REMOTE_ONLY` (turbo repo settings)
- Not directly used by this monorepo but present in env

---

## Admin Panel

Full-featured admin panel at `/admin/*` for platform administration.

### Access Control

- `admin` is a first-class role (`customer | artist | studio | admin` in
  `src/lib/types.ts`, enforced by CHECK constraints in both DB schemas)
- `src/server/admin-auth.ts`: `requireAdmin(request)` guards every admin API
  route (401 unauthenticated, 403 non-admin); `logAdminAction()` writes the audit trail
- `src/app/admin/layout.tsx`: server-side guard — redirects non-admins before render
- Seed the first admin (idempotent; upgrades existing users):
  `ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx scripts/seed-admin.ts`

### Pages (`src/app/admin/`)

Dashboard (metrics + recent activity), Users (full CRUD), Artists/Studios
(direct DB column edits via `updateArtist()`/`updateStudio()` — the legacy
`catalog_overrides` mechanism is folded away at seed time), Bookings (status
override + notes), Payments, Payouts (settle/fail settlement rows),
Quotations, Messages, Email Outbox, Audit Log,
Settings (`platform_settings` table).

### API Routes (`src/app/api/admin/`)

All under `requireAdmin()`; mutations write to `admin_audit_log`
(id, admin_user_id → users.id FK, action, target_table, target_id, details JSON).

### Conventions

- Admin pages are `"use client"` and fetch from `/api/admin/*`
- Data fetching in effects uses `.then()` chains — do NOT call setState
  synchronously in an effect body (`react-hooks/set-state-in-effect`)
- `admin_audit_log.admin_user_id` has a real FK to `users(id)` — tests must
  seed a user row before writing audit entries
- Shared components in `src/components/admin/` (AdminShell sidebar + drawer,
  StatCard, Badge)

---

## Common Patterns & Gotchas

### 1. `src/env.ts` Build Quirk

- `validateEnv()` **only** checks `SESSION_SECRET` when `NODE_ENV === "production"` AND not a build phase
- `checkPostgresUrl()` throws if `POSTGRES_URL` missing in production
- **Do not** set `SESSION_SECRET` during `next build` — it will fail
- Set all vars in `.env.local` or Vercel dashboard

### 2. Database Backend Switching

- `isPostgres()` → `getDb()` uses pg Pool; otherwise node:sqlite
- Migration scripts (`scripts/migrate.ts`) handle SQLite schema evolution
- **Always** test both backends when adding new schema columns

### 3. JWT Session TTL

- 7 days (`SESSION_TTL_SECONDS = 60*60*24*7`)
- JTI revoked on logout via `UPDATE sessions SET revoked = 1 WHERE jti = ?` through
  the db-facade (`revokeSession()` in `src/server/session.ts`)
- If the JTI lookup fails (infra error), the token remains valid on signature +
  expiry (best-effort fail-open); an explicit `revoked = 1` row always wins

### 4. Billplz Webhook

- **Must** set `BILLPLZ_X_SIGNATURE_KEY` in production
- Signature verification checks: `amount|collection_id|id|paid|paid_amount|state`
- Reject webhooks with mismatched signatures (prevents forged "paid" events)

### 5. Email Delivery

- Provider selected by `EMAIL_PROVIDER`: `dev` (default), `resend`, or `postmark`
- `resend` needs `RESEND_API_KEY`; `postmark` needs `POSTMARK_SERVER_TOKEN`
- **Vercel Connect**: If API-key connectors are configured, keys are resolved from
  Connect first, falling back to env vars. This lets you manage credentials centrally.
- Missing credentials fall back to the dev outbox with a warning (never silent)
- Outbox stored in `email_outbox` table when using the dev provider (`/dev/emails`)

### 6. Type Safety

- `zod` schemas validate all API inputs; types inferred via `z.infer`
- `artistsQuerySchema` cross-references `MALAYSIA_STATES`, `BRIDAL_EVENTS`, `NON_BRIDAL_EVENTS`
- Run `npm run typecheck` before committing

### 7. Absolute Imports

- `@/` alias resolves to `./src/` (tsconfig `paths` + vite alias)
- Use `@/lib/...`, `@/app/...`, `@/components/...` pattern consistently

### 8. Client vs Server Components

- `"use client"` at top of files using hooks, state, or event handlers
- Server components can import from `@/lib/` (data, utils) but NOT from `@/components/`
- Auth context, theme, and `useAuth()`/`useTheme()` must use client components

### 9. Error Boundaries

- `src/app/error.tsx` — global error page
- `src/app/global-error.tsx` — fallback for server error boundaries
- `reportError()` called from API routes and server actions

### 10. Deployment Pitfalls

- **Forgot `SESSION_SECRET`** → app crashes on startup in production
- **Forgot `DATABASE_URL`** → pg pool fails; falls through to sqlite (different data)
- **Billplz webhook without `X_SIGNATURE_KEY`** → signature verification skipped, security risk
- **`NEXT_PUBLIC_` prefix** — only expose non-secret vars to browser
- **Vercel `NODE_ENV=production`** — `env.ts` `checkPostgresUrl()` runs; ensure `POSTGRES_URL` set

### 11. Catalog & 404 Gotchas

- **Never import catalog entities from `@/lib/data`** — it is seed-only;
  use `src/server/catalog.ts` (async, DB-backed, auto-seeds on first read)
- **No root `loading.tsx`**: a Suspense boundary above async pages streams a
  HTTP 200 shell before the page resolves, so `notFound()` cannot set a real
  404 status. Do not re-add a root-level loading boundary; scope any loading
  UI to segments that don't call `notFound()`
- **Catalog pages are `force-dynamic`** so admin edits appear immediately;
  public APIs keep CDN caching (`s-maxage=300`)
- **Slugs == legacy ids** (`aisha-azman`) — never regenerate slugs from names,
  bookings and links reference them

### 12. Multi-Agent / Concurrent Sessions

- Multiple agents have worked this repo concurrently; before editing shared
  files (`db.ts`, `payments.ts`, booking routes), check `git status` and file
  mtimes for in-flight work from another session and pick non-overlapping work

---

## Directory Conventions

```
src/
  app/          → Next.js app router pages/layouts
  components/   → Reusable React components (client)
  lib/
    actions/    → Server actions
    auth.tsx    → AuthProvider + ROLE_LABELS
    data.ts     → Seed data + constants (states, events) — seed-only
    email/      → Brevo send + templates
    payments/   → Billplz API + types
    supabase/   → Supabase client helpers
    theme.tsx   → Theme provider
    types.ts    → Shared types (Role, Artist, Studio, etc.)
    utils.ts    → cn(), formatRM(), pluralize()
  server/
    catalog.ts  → DB-backed artists/studios/reviews repository
    catalog-seed.ts → idempotent seeding + override folding
    db.ts       → DbFacade + PG_SCHEMA + SQLite schema
    errors.ts   → reportError + Sentry integration
    logger.ts   → pino logger + forwarding sink
    payouts.ts  → per-booking settlement rows (pending/settled/failed)
    settings.ts → typed platform_settings access + commission math
    session.ts  → JWT create/verify/revoke
    validation.ts → Zod schemas
    [other]*.ts → booking-emails, chat-bus, invoice-pdf, etc.
```
