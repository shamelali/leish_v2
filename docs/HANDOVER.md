# Handover — read this first

## 2026-09-10 — CSP request proxy restored at `src/proxy.ts`

The app was shipping with no working Content-Security-Policy. Two defects
compounded:

1. `src/proxy.ts` had been moved to `src/app/proxy.ts`. Next.js resolves the
   proxy with the pattern `(?:src/)?proxy`, so the moved file was never loaded
   — it was dead code and no CSP was emitted at all.
2. `next.config.ts` still sent a static, nonce-less CSP. Browsers enforce
   _every_ CSP header on a response, so once the proxy did run, the static
   policy would be enforced alongside it and block every script, including
   Next.js hydration.

Fixed by consolidating on one source of truth:

- **`src/lib/csp.ts`** (new) — pure, tested policy builder: `generateNonce()`,
  `buildContentSecurityPolicy()`, and the shared `x-nonce` /
  `Content-Security-Policy` header names.
- **`src/proxy.ts`** (new) — the request proxy, at the path Next.js actually
  reads. Sets the policy on the response and forwards the nonce on the request
  so `layout.tsx` can nonce the inline theme script.
- **`src/middleware.ts`** and **`src/app/proxy.ts`** (deleted) — the former was
  a weaker duplicate (`script-src` only); the latter was the mislocated dead
  file.
- **`next.config.ts`** — CSP entry removed (comment left explaining why it must
  not come back). Other security headers unchanged.
- **`src/app/layout.tsx`** — reads the nonce via the shared `CSP_NONCE_HEADER`
  constant instead of a hardcoded string.

Covered by `src/lib/csp.test.ts` + `src/proxy.test.ts` (17 tests), including a
guard that the nonce appears in `script-src` exactly once and a matcher test
asserting API routes and static assets are excluded.

If you ever need a new script host or image source, change `src/lib/csp.ts`.
Never re-add a CSP header to `next.config.ts`.

## 2026-08-17 — public booking loop unified onto the db-facade backend

The repo briefly shipped two parallel booking implementations: the public
artist-page flow (`/artists/[slug]` + `BookingCalendar`) ran on Supabase
client actions with slot/deposit-percent billing, while the dashboard and
`/api/*` routes ran on the tested db-facade backend (request → quotation →
RM 200 fee → webhook). The public loop was unified onto the db-facade path:

- `src/app/artists/[slug]/page.tsx` reads the catalog (`src/lib/data.ts`),
  same source as the listing pages — artist pages no longer need Supabase.
- `src/components/booking-calendar.tsx` sends a booking **request** via
  `POST /api/bookings` (service + date + time + event type). Quotation and
  fee payment happen in the dashboard, per the leish.my journey.
- `src/app/booking/success/page.tsx` reads the real booking status from the
  db-facade instead of the Supabase client.
- Removed: `src/lib/actions/*`, `src/lib/payments/*`,
  `src/app/api/payments/billplz/*` (legacy slot-based billing path).
- The single Billplz webhook is `POST /api/payments/webhook`.
- `/admin/**` recognises OAuth sign-ins via the Supabase client, so
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are needed for
  that path. **Note (2026-09-04, updated 2026-09-10):** admin pages read their
  data through `getDb()`, not Supabase — Supabase is an OAuth provider only.
  (`src/proxy.ts` was absent when this note was written; it has since been
  restored as the CSP request proxy — see the 2026-09-10 entry below.)

## Why this rebuild happened

The previous Leish codebase (Next.js + Drizzle ORM + Neon Postgres, mid-way
through a migration to Supabase) had accumulated enough drift — a
Neon-to-Supabase migration half-done, a dual-connection sync cron, journal
vs. live-branch mismatches, nine one-off `fix*.js` patch scripts in root —
that continuing to patch it was slower than starting clean. This repo is
that clean start.

**This is not a from-scratch product rethink.** The business logic, schema
shape, and commission model are the same. What changed is: one backend
(Supabase only, no Neon/Drizzle), and a scope cut to the core booking loop
so launch isn't blocked on features that don't need to exist yet.

## What's explicitly fixed vs. the old codebase

| Old problem                                                                            | Fix in this repo                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/supabase/server.ts` silently returned `null` on missing env vars → invisible 404s | `src/lib/supabase/server.ts` throws loudly instead                                                                                                                                                                                                                                                                                                                                                                         |
| Admin layout let `studio_manager` role into `/admin`                                   | `src/app/admin/layout.tsx` checks `role === "admin"` explicitly, and `src/server/admin-auth.ts` re-checks on every admin API call. **Note (2026-09-04):** the `is_admin()` RLS function referenced here was never implemented, and RLS would not apply anyway — all queries go through `getDb()` on a direct connection, which bypasses row-level policies. Authorization is application-level. See `docs/ARCHITECTURE.md` |
| `/api/debug/env` exposed env var names in prod                                         | Not present in this repo. Don't add a debug route without an auth check and a plan to delete it before launch.                                                                                                                                                                                                                                                                                                             |
| Booking `amount`/`depositAmount` could theoretically be sent from client               | `src/lib/payments/commission.ts` + `src/lib/actions/bookings.ts` resolve both server-side from DB records only                                                                                                                                                                                                                                                                                                             |
| Leaflet SSR crash (`L.Icon.Default.mergeOptions` outside browser context)              | No map dependency in v1. See comment in `src/components/booking-calendar.tsx` for how to add one back safely later.                                                                                                                                                                                                                                                                                                        |
| Booking success page used a `setTimeout` mock instead of checking real payment status  | `src/app/booking/success/page.tsx` queries the actual booking status                                                                                                                                                                                                                                                                                                                                                       |
| Neon Auth + dual-connection sync cron                                                  | Gone. Supabase Auth only, no sync job needed.                                                                                                                                                                                                                                                                                                                                                                              |
| `db:push` used for prod schema changes, causing drift                                  | Use `supabase db push` against migration files only — see `docs/DEPLOY.md`. Never hand-edit the live schema in the Supabase dashboard for anything that should persist.                                                                                                                                                                                                                                                    |

## What's deliberately out of scope for v1 launch

Cut to hit the actual launch gate (10 MUAs in Klang Valley + a working
Billplz live-money test) as fast as possible:

- **Studios** (studio profiles, studio booking, external studio rental commission tier) — schema has room for it later (`STUDIO_COMMISSION_PERCENT` constant already reserved), UI does not exist yet.
- **In-app messaging / AI concierge** — use WhatsApp Business API in the interim.
- **Loyalty points, pro-tier upgrades, surcharges** — not in schema yet.
- **Reviews** — not in schema yet, add as a follow-up migration.

Don't build these until the core loop (browse → book → pay deposit →
provider completes → admin can see it happened) is live and the first real
bookings are flowing.

## Completed for MVP Launch

All launch stubs have been implemented and verified:

- `src/app/admin/providers/page.tsx` — approve/reject server actions wired with DB updates and path revalidation.
- `src/app/admin/page.tsx` — overview metrics for pending approvals, active MUAs, total bookings, and recent Billplz transaction webhook log.
- `src/app/api/payments/webhook/route.ts` — transactional booking confirmation email dispatch wired via Brevo with client/provider/service metadata.
- `src/app/api/email/send/route.ts` — secured with internal shared-secret authorization.
- `src/components/booking-calendar.tsx` — styled booking component with service selection, deposit/balance calculations, slot conflict retry UX, and loading indicators.
- ~~`src/lib/types/database.ts`~~ — **removed.** These Supabase table typings, and the `0001_core_schema.sql` / `0002_rls_policies.sql` migrations they mirrored, are not in the repo. The schema of record is `PG_SCHEMA` in `src/server/db.ts`.
- `src/app/artists/[slug]/page.tsx` — styled responsive MUA profile page with verified status, services breakdown, and booking integration.

## Non-negotiables carried over from v1 learnings

- Never use `db:push`/dashboard schema edits for anything meant to persist — migration files only, via `supabase db push`.
- Never mark a `NEXT_PUBLIC_*` var as sensitive in Vercel — it's inlined into the client bundle at build time regardless.
- `NEXT_PUBLIC_URL` must be the real production domain (`https://leish.my`) in Vercel's production environment, never `localhost`.
- All monetary values are server-derived. If you ever see `amount` or `depositAmount` accepted from a request body, that's a regression — stop and fix it before merging.
- No bot/agent commits auto-deploy to production without a human review gate.
