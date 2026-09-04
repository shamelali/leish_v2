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

**Supabase is used for OAuth sign-in only. It is not a data path.**

- `src/lib/supabase/auth.ts` wraps `signInWithOAuth`, `exchangeCodeForSession`,
  `getUser` and `signOut` for the Google / Facebook / Instagram buttons
  (`/api/auth/oauth/*`, `/auth/callback`). `/admin/**` calls `getSupabaseUser()`
  to recognise a user who signed in via OAuth.
- These paths need `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Without them the OAuth buttons fail; email + password login is unaffected.
- **No code issues a Supabase data query.** There is not one `.from()` call in
  `src/`. Once OAuth resolves an identity, the user row is read from the
  Postgres facade (`getDb()`), and every subsequent read and write goes through
  that facade.
- The legacy Supabase booking routes (`/api/payments/billplz/*`,
  `src/lib/actions/*`, `src/lib/payments/*`) were removed on 2026-08-17 —
  the public loop is single-path.

_Corrected 2026-09-04: this section previously described `/admin/**` as reading
its data through the Supabase client, and referenced `src/proxy.ts` and
`src/lib/types/database.ts`. Neither file exists, and the admin pages read
through `getDb()` like everything else._

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

## Authorization is enforced in the application, not by RLS

**There are no RLS policies in this repo, and RLS would not currently do
anything if there were.**

RLS constrains requests that arrive through Supabase's Data API carrying a user
JWT. This app never makes such a request: all data access goes through
`getDb()` over a direct `DATABASE_URL` connection, which connects as the
database owner and bypasses row-level policies by design. Supabase is an OAuth
provider here, nothing more (see "Where Supabase still appears").

So authorization is enforced in the application, at three layers:

- **Admin surface** — `src/app/admin/layout.tsx` redirects unless
  `user.role === "admin"`, and `src/server/admin-auth.ts` re-checks on every
  admin API call. Destructive admin mutations go through `atomicAdminGuard()`,
  which folds the check and the write into one conditional SQL statement so two
  concurrent demotions cannot remove the last admin.
- **Booking loop** — session checks inside each `/api/*` handler
  (`src/server/session.ts`), plus per-route role and ownership checks. Prices
  are always resolved server-side from DB records, never trusted from the
  client.
- **Payments** — the Billplz webhook verifies an HMAC signature before any
  mutation, so a forged callback cannot confirm a booking.

### Should RLS be added?

Not now. It would add no meaningful protection while creating real risk: a
policy on a table the app writes to via `DATABASE_URL` either does nothing
(owner bypass) or silently breaks writes in a way that is painful to diagnose.

Revisit this **only** if the browser is ever given direct Supabase Data API
access — for example a client-side `.from()` query or Supabase Realtime. At
that point RLS stops being defence-in-depth and becomes the only thing standing
between an anon key and the table, and it must be added before that ships.

_Corrected 2026-09-04: this section previously claimed admin data was protected
by `supabase/migrations/0002_rls_policies.sql`. There is no `supabase/`
directory, no such migration, and no RLS policy anywhere in the repo. See also
`docs/PHASE-1-ENV-CHECKLIST.md` §2._

## Money logic lives in a few places

- `src/server/settings.ts` — the business-model knobs: booking deposit
  (`booking_fee_sen`, default RM 50), commission rate (`commission_rate_bps`,
  default 10%, artist-side) and the commission waiver threshold. Includes the
  pure `computeCommission()` helper.
- `src/server/payments.ts` — Billplz bill creation (deposit + balance
  payments, one per booking per type), refund rules and webhook signature
  verification.
- `src/server/payouts.ts` — artist settlement rows created when a balance is
  paid: net = quote total − commission − deposit; settled manually via
  `/admin/payouts`.
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
