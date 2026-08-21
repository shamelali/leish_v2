# Leish v2 — Enterprise Grade Agents Guide

## Project Overview
Leish v2 is a Next.js 16 (app router) platform connecting clients with beauty artists/studios in Malaysia. It handles:
- Artist/studio discovery and booking
- Session management (JWT cookies, 7-day TTL)
- Payment processing via Billplz (Malaysian gateway)
- Transactional emails via Brevo
- Structured logging with pino + webhook forwarding
- PostgreSQL primary, SQLite fallback for local dev/tests

**Key URLs:**
- Source: `src/` (app router, components, lib, server)
- Config: `.env.local` (production), `.env.example` (template)
- Deploy: Vercel (`vercel deploy --prod`)

---

## Architecture Patterns

### 1. Data Layer (`src/lib/data.ts`)
- Static artist/studio data with typed lookups (`getArtist()`, `getStudio()`)
- Malaysia states/areas constants for filtering
- Event categories (bridal / non-bridal)

### 2. Database Facade (`src/server/db.ts`)
- **Two-backend facade**: PostgreSQL (`DATABASE_URL`) or node:sqlite
- `getDb()` is synchronous — init is sync; pg schema migrates lazily on first query
- `DbFacade` interface: `prepare(sql)`, `exec(sql)`, `get<T>()`, `all<T>()`, `run()`
- Placeholder translation: `@name` / `?` → pg `$1..$n`
- Schema (`PG_SCHEMA` / `SQLITE_SCHEMA`): users, bookings, payments, quotations, artist_profiles, etc.

### 3. Session & Auth (`src/server/session.ts`)
- HS256 JWT signed with `SESSION_SECRET` (32-byte base64)
- Cookie: `leish_session` (httpOnly, secure@prod, sameSite=lax, 7-day TTL)
- JTI revocation tracking in `sessions` table via Supabase
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

### 7. Payments (`src/lib/payments/billplz.ts`)
- Billplz API: `createBill()`, `verifyWebhookSignature()` (HMAC-SHA256)
- Signature fields (ordered): `amount|collection_id|id|paid|paid_amount|state`
- `BILLPLZ_X_SIGNATURE_KEY` required for webhook verification
- `BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, `BILLPLZ_BASE_URL`, `BILLPLZ_X_SIGNATURE_KEY`

### 8. Email (`src/lib/email/brevo.ts`)
- Brevo SMTP API: `sendTransactionalEmail()`
- Requires `BREVO_API_KEY`, optional `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`
- Templates: `bookingConfirmationEmail()`, `bookingReminderEmail()`

### 9. Theme (`src/lib/theme.tsx`)
- `ThemeProvider` / `useTheme()` with localStorage persistence
- Default: `dark`; inline script in `layout.tsx` avoids CLS

### 10. API Routes (`src/app/api/`)
- `/api/auth/*` — login/register/logout (token-based)
- `/api/bookings/*` — booking flow
- `/api/quotations/*` — quotation generation
- `/api/payments/*` — Billplz webhook handler
- `/api/health` — health check (used by Docker HEALTHCHECK)

---

## Development Workflow

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev mode (`NODE_ENV=development`) |
| `npm run build` | `next build` (sets `NODE_ENV=production`) |
| `npm run start` | `next start` (production server) |
| `npm run lint` | ESLint (`eslint-config-next`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite (`jsdom` environment) |
| `npm run test:coverage` | Vitest + HTML coverage report |
| `npm run env:check` | Validate required env vars |
| `npm run format` | Prettier auto-fix |
| `npm run format:check` | Prettier check |

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
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` (optional but recommended)
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

### 2. Vercel Settings
- Set all env vars in the Vercel dashboard (Production & Preview)
- `NEXT_PUBLIC_SITE_URL` must match the Vercel domain or custom domain
- Enable `OUTPUT=standalone` in `next.config.mjs` (already set)
- Add `vercel-build` and `vercel-start` scripts if custom

### 3. Database Migrations
- Run `npm run db:migrate` (scripts/migrate.ts) to apply schema to SQLite
- For PostgreSQL: `npx supabase db push` or manual `PG_SCHEMA` execution
- CI: `database.yml` runs `supabase db push` on migration pushes
- **Never** edit `src/lib/types/database.ts` manually — it's generated from Supabase

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
9. Test email sending (Brevo) in a staging environment
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
- JTI revoked on logout via `supabase.from("sessions").update({ revoked: true })`
- If JTI not found in sessions table, token is still valid (best-effort)

### 4. Billplz Webhook
- **Must** set `BILLPLZ_X_SIGNATURE_KEY` in production
- Signature verification checks: `amount|collection_id|id|paid|paid_amount|state`
- Reject webhooks with mismatched signatures (prevents forged "paid" events)

### 5. Email Delivery
- Brevo requires `BREVO_API_KEY`; missing key throws early (visible in Sentry, not silent)
- Templates expect specific params (see `brevo.ts` and `templates.ts`)
- Outbox stored in `email_outbox` table when using dev provider

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

---

## Directory Conventions

```
src/
  app/          → Next.js app router pages/layouts
  components/   → Reusable React components (client)
  lib/
    actions/    → Server actions
    auth.tsx    → AuthProvider + ROLE_LABELS
    data.ts     → Static data (artists, studios, states)
    email/      → Brevo send + templates
    payments/   → Billplz API + types
    supabase/   → Supabase client helpers
    theme.tsx   → Theme provider
    types.ts    → Shared types (Role, Artist, Studio, etc.)
    utils.ts    → cn(), formatRM(), pluralize()
  server/
    db.ts       → DbFacade + PG_SCHEMA + SQLite schema
    errors.ts   → reportError + Sentry integration
    logger.ts   → pino logger + forwarding sink
    session.ts  → JWT create/verify/revoke
    validation.ts → Zod schemas
    [other]*.ts → booking-emails, chat-bus, invoice-pdf, etc.
```