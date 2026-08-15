# Deploy checklist

## 1. Supabase

- [ ] Create a new Supabase project (do not reuse the v1 Neon project — this is a clean start).
- [ ] `npx supabase link --project-ref <ref>`
- [ ] `npx supabase db push` — applies both migration files in order.
- [ ] Confirm RLS is enabled on all 6 tables (`supabase/migrations/0002_rls_policies.sql` enables it, but verify in the dashboard).
- [ ] Create a Storage bucket for provider portfolio images; set public read policy for active providers only if you add photo upload before launch.
- [ ] `npm run db:types` locally and commit the generated `src/lib/types/database.ts`.

## 2. Vercel

- [ ] New Vercel project (do not reuse the old project ID — avoids inheriting stale env vars).
- [ ] Set all vars from `.env.example` in the **Production** environment. Double-check `NEXT_PUBLIC_URL=https://leish.my` — not localhost.
- [ ] Confirm no `NEXT_PUBLIC_*` var is marked "sensitive" (breaks the client bundle).
- [ ] Connect the domain, confirm Cloudflare DNS points at Vercel correctly.
- [ ] Turn off auto-deploy from any bot/agent commit path — human review required on `main`.

## 3. Billplz

- [ ] Confirm production mode (not sandbox) API key.
- [ ] Set webhook callback URL to `https://leish.my/api/payments/billplz/webhook` in the Billplz dashboard.
- [ ] Run one real end-to-end low-value payment (e.g. RM 1) before considering this done. Verify: bill created → webhook received → signature verified → `payment_transactions` row inserted → `bookings.status` flips to `confirmed`.

## 4. Brevo

- [ ] Confirm sender domain is verified (SPF/DKIM) so mail doesn't land in spam.
- [ ] Send one test transactional email via `/api/email/send` and confirm delivery.
- [ ] Check the free-plan send cap against expected launch volume — this was flagged as a near-term scaling constraint previously.

## 5. Sentry

- [ ] New Sentry project (or reuse the org, new project) so v1 noise doesn't pollute triage.
- [ ] Confirm errors from `src/app/api/payments/billplz/webhook/route.ts` and `src/lib/email/brevo.ts` are actually reaching Sentry — these were previously failing silently in places.

## 6. Pre-launch smoke test (do this manually, in order)

1. Sign up as a client.
2. Sign up as an artist, complete provider profile — confirm it's `is_active: false` until approved.
3. As admin, approve the provider via `/admin/providers` (finish the TODO'd approve action first).
4. Add a service and an availability slot as the provider.
5. As the client, browse to the artist page, book the slot, pay the deposit via Billplz (real small amount).
6. Confirm the booking flips to `confirmed` and the success page shows it.
7. Try booking the same slot twice in two tabs — confirm the second one gets a clean "already booked" error, not a 500.

Only cut over DNS after all six sections above are checked.
