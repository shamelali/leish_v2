# Deploy checklist

## 1. Database & Supabase

The public booking loop persists through `src/server/db.ts`: PostgreSQL when
`DATABASE_URL` is set (use the Supabase pooler connection string in prod),
node:sqlite otherwise. The `/admin/**` pages additionally use the Supabase
client for provider management.

- [ ] Create a new Supabase project (do not reuse the v1 Neon project — this is a clean start).
- [ ] Set `DATABASE_URL` in Vercel to the Supabase pooler connection string (`sslmode=require`).
- [ ] Run `npm run db:migrate` (scripts/migrate.ts) against production `DATABASE_URL`.
- [ ] `npx supabase link --project-ref <ref>` and `npx supabase db push` — applies the
      admin-side schema + RLS policies (`supabase/migrations/*`).
- [ ] Confirm RLS is enabled on all tables (`supabase/migrations/0002_rls_policies.sql`
      enables it, but verify in the dashboard).
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required by
      `/admin/**` and `src/proxy.ts` — they fail loudly without them).
- [ ] Create a Storage bucket for provider portfolio images; set public read policy for
      active providers only if you add photo upload before launch.

## 2. Vercel

- [ ] New Vercel project (do not reuse the old project ID — avoids inheriting stale env vars).
- [ ] Set all vars from `.env.example` in the **Production** environment. Double-check
      `NEXT_PUBLIC_URL=https://leish.my` — not localhost.
- [ ] Confirm no `NEXT_PUBLIC_*` var is marked "sensitive" (breaks the client bundle).
- [ ] Connect the domain, confirm Cloudflare DNS points at Vercel correctly.
- [ ] Turn off auto-deploy from any bot/agent commit path — human review required on `main`.

## 3. Billplz (single payment path — no second webhook route)

The db-facade is the only payment path: `POST /api/bookings/[id]/pay-fee` creates
the bill; the callback defaults to `{NEXT_PUBLIC_SITE_URL}/api/payments/webhook`
(override with `BILLPLZ_CALLBACK_URL` if needed). The legacy
`/api/payments/billplz/*` routes were removed on 2026-08-17.

- [ ] Confirm production mode (not sandbox) API key.
- [ ] Set webhook callback URL to `https://leish.my/api/payments/webhook` in the
      Billplz dashboard (must match `BILLPLZ_CALLBACK_URL` if overridden).
- [ ] Run one real end-to-end low-value payment (e.g. RM 1) before considering this done.
      Verify: bill created → webhook received → HMAC signature verified → `payments`
      row marked `paid` → `bookings.status` flips to `confirmed`.

## 4. Brevo

- [ ] Confirm sender domain is verified (SPF/DKIM) so mail doesn't land in spam.
- [ ] Send one test transactional email via `/api/email/send` and confirm delivery.
- [ ] Check the free-plan send cap against expected launch volume — this was flagged as a
      near-term scaling constraint previously.

## 5. Sentry

- [ ] New Sentry project (or reuse the org, new project) so v1 noise doesn't pollute triage.
- [ ] Confirm errors from `src/app/api/payments/webhook/route.ts` and
      `src/lib/email/brevo.ts` are actually reaching Sentry — these were previously
      failing silently in places.

## 6. Pre-launch smoke test (do this manually, in order)

The core loop: browse → request → accept → quotation → pay fee → webhook confirms.

1. Sign up as a client, verify the email (dev outbox at `/dev/emails` if `EMAIL_PROVIDER=dev`).
2. Sign up as an artist, verify the email, claim a catalog profile via the dashboard
   (`POST /api/artist-profiles` — unverified accounts are rejected).
3. As the client, open the artist page, pick a service + date + time + event type and
   send the booking request.
4. As the artist, accept the request and send a quotation (base + travel + extras).
5. As the client, pay the RM 200 booking fee from the dashboard (real small Billplz
   amount) and land back on `/dashboard` / `/booking/success`.
6. Confirm the booking flips to `confirmed` and the success page shows it — the webhook
   is the only thing that can confirm a booking.
7. Negative tests: an unverified client cannot book; a webhook with a bad signature is
   rejected with 401; booking the same date does not 500.

Only cut over DNS after all six sections above are checked.
