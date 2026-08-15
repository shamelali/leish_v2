# Architecture

## Data flow: booking → payment

1. Client selects a service + slot on `/artists/[slug]` (`BookingCalendar` component).
2. `POST /api/bookings` → `createBooking()` server action:
   - Validates input with Zod.
   - Fetches `service.price` and `provider.default_deposit_percent` from Supabase (never trusts client-sent amounts).
   - Resolves `amount` / `depositAmount` via `resolveBookingAmount()`.
   - Inserts the `bookings` row as `pending_payment`.
   - The DB-level unique index on `(slot_id) where status != 'cancelled'` rejects a double-booking race at the constraint level, not just in application code.
3. Client is redirected to `POST /api/payments/billplz/create`, which creates a Billplz bill for `deposit_amount` and returns the payment URL.
4. Client pays on Billplz's hosted page.
5. Billplz calls `POST /api/payments/billplz/webhook`:
   - Verifies `x_signature` (HMAC-SHA256 over an ordered field set) before trusting anything in the payload.
   - Logs the event to `payment_transactions` (append-only, idempotent on `billplz_bill_id`).
   - If paid, flips `bookings.status` to `confirmed` — guarded by `.eq("status", "pending_payment")` so a retried webhook can't double-process.
6. Client lands on `/booking/success`, which reads the real booking status rather than assuming success.

## Why Supabase-only (not Neon + Supabase, not Drizzle)

v1's mid-migration state (Neon for auth, Supabase-bound schema, a
dual-connection sync cron to keep them consistent) was the single biggest
source of drift. One provider for Postgres + Auth + Storage removes:

- The sync cron entirely.
- Drizzle's `db:push` vs. journal-file inconsistency — Supabase migrations
  are just ordered `.sql` files, applied via `supabase db push`, and Supabase's
  own migration history table tracks what's been applied. No separate
  journal to drift out of sync with.
- A second set of connection strings/pooling config to keep straight.

## RLS instead of hand-rolled route/layout guards

v1's admin access check was an `if` statement in `app/admin/layout.tsx`
that had a role-check bug (see HANDOVER.md). This repo still has that
layout guard for UX (redirect before rendering), but the actual data
access is enforced by Postgres RLS policies (`supabase/migrations/0002_rls_policies.sql`).
That means even if the layout guard has a bug in the future, queries from
a non-admin still return nothing — defense in depth instead of a single
point of failure.

## Commission logic lives in one place

`src/lib/payments/commission.ts` is the only place commission percentages
and deposit resolution logic should live. If you're tempted to compute an
amount inline in a route handler, don't — import `resolveBookingAmount`
instead so there's exactly one audited code path for anything touching
money.

## Scope boundary: why no studios yet

Studios add a second provider type, a second commission tier, and a second
approval/booking flow. None of that is required to hit the launch gate
(10 MUAs, Klang Valley, one working payment flow). The schema reserves
`STUDIO_COMMISSION_PERCENT` and `EXTERNAL_STUDIO_COMMISSION_PERCENT` as
constants so the naming is consistent when studios do get built, but no
studio tables exist yet — add them as a new migration, don't retrofit
`providers`.
