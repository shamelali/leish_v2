# Deploy checklist

## 1. Database

The app persists through a single db-facade (`src/server/db.ts`): PostgreSQL when
`DATABASE_URL` is set (use a Neon/Supabase pooler connection string in prod),
Node's built-in `node:sqlite` otherwise. There is no Supabase client dependency —
users, bookings, quotations, payments and **sessions** all live in this store.

- [ ] Provision a PostgreSQL database (Neon or Supabase pooler).
- [ ] Set `DATABASE_URL` in Vercel to the pooler connection string (`sslmode=require`).
- [ ] Run `npm run db:migrate` (scripts/migrate.ts) against production `DATABASE_URL`.
      It is idempotent (CREATE TABLE IF NOT EXISTS + additive column backfills) and
      verifies all expected tables (including `sessions`) are present.
- [ ] The app also applies the same schema lazily on first request, so migration is a
      belt-and-braces step you can run before the first deploy.

## 2. Vercel

- [ ] Set all required vars from `.env.example` in the **Production** environment:
      `SESSION_SECRET` (required), `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL=https://leish.my`.
- [ ] Set Billplz + email provider vars if launching payments/email (see sections 3–4).
- [ ] Set `CRON_SECRET` so the scheduled jobs in `vercel.json` are authenticated.
- [ ] Confirm no `NEXT_PUBLIC_*` var is marked "sensitive" (breaks the client bundle).
- [ ] Connect the domain, confirm DNS points at Vercel correctly.
- [ ] Turn off auto-deploy from any bot/agent commit path — human review required on `main`.

## 3. Billplz (single payment path — no second webhook route)

The db-facade is the only payment path: `POST /api/bookings/[id]/pay-fee` creates
the bill; the callback defaults to `{NEXT_PUBLIC_SITE_URL}/api/payments/webhook`
(override with `BILLPLZ_CALLBACK_URL` if needed). The legacy Supabase-based
`/api/payments/billplz/*` routes have been removed — there is a single webhook.

- [ ] Confirm production mode (not sandbox) API key.
- [ ] Set webhook callback URL to `https://leish.my/api/payments/webhook` in the
      Billplz dashboard (must match `BILLPLZ_CALLBACK_URL` if overridden).
- [ ] Run one real end-to-end low-value payment (e.g. RM 1) before considering this done.
      Verify: bill created → webhook received → HMAC signature verified → `payments`
      row marked `paid` → `bookings.status` flips to `confirmed`.

## 4. Email

Transactional email is sent via `src/server/email.ts`. The default provider is
`dev` (writes to the `email_outbox` table, viewable at `/dev/emails` outside
production). For real delivery set `EMAIL_PROVIDER=resend` (+ `RESEND_API_KEY`) or
`EMAIL_PROVIDER=postmark` (+ `POSTMARK_SERVER_TOKEN`), plus `EMAIL_FROM`.

- [ ] Confirm the sender domain is verified (SPF/DKIM) so mail doesn't land in spam.
- [ ] Trigger a verification email via registration and confirm delivery.
- [ ] Check the provider's plan send cap against expected launch volume.

## 5. Error reporting (optional)

- [ ] Set `SENTRY_DSN` (preferred) or `ERROR_WEBHOOK_URL`; `reportError()` posts a
      sanitized payload to whichever is configured.
- [ ] Confirm errors from `src/app/api/payments/webhook/route.ts` reach your sink.

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
