# Architecture

## Data flow: booking → payment (single db-facade backend)

The public booking loop runs entirely on the db-facade backend (`src/server/*`,
`POST /api/*`). There is one payment path and one webhook.

1. Client browses the catalog (`src/lib/data.ts`) and opens `/artists/[slug]`
   (`BookingCalendar` component).
2. `POST /api/bookings` sends a booking **request** — `{ artistId, service, date, time, eventType, notes }`:
   - Zod-validated (`src/server/validation.ts`).
   - Gated on a verified email (`EMAIL_NOT_VERIFIED` otherwise).
   - The catalog price is informational only: quotations, the RM 200 fee and
     the balance are re-derived server-side from DB records — client-sent
     amounts are never trusted.
3. The MUA accepts the request (`PATCH /api/bookings/[id] { action: "accept" }`) and
   sends a line-item quotation (`POST /api/bookings/[id]/quotation`) with a 24h
   review window. Re-quoting supersedes the previous pending quotation.
4. The client pays the flat RM 200 booking fee via
   `POST /api/bookings/[id]/pay-fee` → `createBookingFeePayment()`
   (`src/server/payments.ts`):
   - `billplz` provider when `BILLPLZ_API_KEY` + `BILLPLZ_COLLECTION_ID` are set;
     a `dev` provider otherwise (local/testing, no external calls).
5. Billplz calls `POST /api/payments/webhook`:
   - Raw-body HMAC-SHA256 signature verified (timing-safe) before any state change.
   - `paid: true` → payment marked `paid` and the booking transitions
     `accepted → confirmed` via the state machine (`src/server/bookings.ts`).
     Only the payment webhook can confirm a booking.
6. The balance (quotation total − RM 200) is due 3 days before the event.
   The client lands back on `/dashboard` (or `/booking/success`, which reads the
   real booking status — never a mock).

Persistence: `src/server/db.ts` — PostgreSQL when `DATABASE_URL` is set
(Supabase pooler recommended in prod), else node:sqlite for local/dev/tests.
Same async API either way. Schema migrations: `scripts/migrate.ts`
(`npm run db:migrate`).

## Where Supabase still appears

- `/admin/**` pages (provider approvals, overview metrics) use the Supabase
  client (`src/lib/supabase`, typed by `src/lib/types/database.ts`, schema in
  `supabase/migrations/*`). They require `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and are the only pages that do.
- `src/proxy.ts` refreshes Supabase auth sessions in middleware.
- The legacy Supabase booking routes (`/api/payments/billplz/*`,
  `src/lib/actions/*`, `src/lib/payments/*`) were removed on 2026-08-17 —
  the public loop is single-path.

## Why one Postgres provider (not Neon + Supabase, not Drizzle)

v1's mid-migration state (Neon for auth, Supabase-bound schema, a
dual-connection sync cron to keep them consistent) was the single biggest
source of drift. One provider for Postgres + Auth + Storage removes:

- The sync cron entirely.
- Drizzle's `db:push` vs. journal-file inconsistency — Supabase migrations
  are just ordered `.sql` files, applied via `supabase db push`, and Supabase's
  own migration history table tracks what's been applied. No separate
  journal to drift out of sync with.
- A second set of connection strings/pooling config to keep straight.

## RLS instead of hand-rolled route/layout guards (admin surface)

v1's admin access check was an `if` statement in `app/admin/layout.tsx`
that had a role-check bug (see HANDOVER.md). The admin pages still have
that layout guard for UX (redirect before rendering), and the Supabase-backed
data they read is protected by Postgres RLS policies
(`supabase/migrations/0002_rls_policies.sql`). That means even if the layout
guard has a bug in the future, queries from a non-admin still return nothing —
defense in depth instead of a single point of failure.

The public booking loop is protected by the session checks inside the
`/api/*` route handlers (`src/server/session.ts`, per-route role checks), not
by RLS.

## Money logic lives in one place

- `src/server/payments.ts` — the only place the RM 200 booking fee
  (`BOOKING_FEE_SEN`), Billplz bill creation, refund rules and webhook
  signature verification live.
- `src/server/quotations.ts` — the only place quotation totals (base +
  travel + early call + accommodation + extras) are computed, along with
  the 24h expiry window.

If you're tempted to compute an amount inline in a route handler, don't —
import from these modules so there's exactly one audited code path for
anything touching money. Client-sent amounts are never trusted.

## Scope boundary: why no studios yet

Studios add a second provider type, a second commission tier, and a second
approval/booking flow. None of that is required to hit the launch gate
(10 MUAs, Klang Valley, one working payment flow). The catalog
(`src/lib/data.ts`) currently holds artists only — add studio support as a
deliberate follow-up, not retrofitted into the artist flow.
