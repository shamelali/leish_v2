# Phase 1 — Production environment provisioning checklist

**Purpose:** turn Roadmap Phase 1 into a mechanical exercise. Every variable the
code actually reads, where its value comes from, and whether launch is blocked
without it.

**Verified against the codebase on 2026-09-04** by grepping every
`process.env.*` read in `src/` and `scripts/`. Where this document and
`AGENTS.md` / `docs/CODEBASE-AUDIT-FINAL.md` disagree, **this document matches
the code** — see §6.

> **Companion file:** `deploy-env.md` holds discovered _values_ from the v1
> migration. It also contains live production secrets in git — see §7 before
> using it.

---

## 0. Before you start

| Prerequisite                | Why                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GitHub billing lock cleared | Roadmap Phase 0. Nothing merges green until then.                                                                                  |
| Vercel project settled      | One project, Root Directory = repo root, Production branch = `main`. Four of six projects on this repo currently fail; prune them. |
| Decide the DB story         | See §2 — there is no `supabase/` directory in this repo.                                                                           |

---

## 1. Tier 1 — Blocking. The app will not work without these.

| Variable               | Where the value comes from                                          | Notes                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`       | `openssl rand -base64 32`                                           | **Hard boot failure.** `src/env.ts` throws in production if unset. Do not reuse the v1 value in `deploy-env.md` — it is public in git.         |
| `DATABASE_URL`         | Supabase → Project Settings → Database → **Connection pooling** URI | Must include `?sslmode=require`. Without it the app silently falls back to SQLite on ephemeral serverless disk — data loss, not an error.      |
| `NEXT_PUBLIC_SITE_URL` | `https://leish.my`                                                  | Drives metadataBase, sitemap, robots, verification/reset links, **and the Billplz callback/redirect defaults**. Never localhost in production. |

`validateEnv()` only _throws_ for `SESSION_SECRET`; it _warns_ for the other
two. Treat all three as blocking regardless.

---

## 2. Tier 1 — Database provisioning

```bash
# 1. Create a fresh Supabase project (do NOT reuse the v1 Neon instance).
# 2. Apply the schema:
DATABASE_URL="postgresql://...pooler...?sslmode=require" pnpm run db:migrate
# 3. Seed the artist/studio catalog:
DATABASE_URL="..." pnpm run db:seed-catalog
# 4. Create the first admin:
DATABASE_URL="..." ADMIN_EMAIL="you@leish.my" ADMIN_PASSWORD="..." \
  node --experimental-strip-types scripts/seed-admin.ts
```

> ### ✅ Resolved: skip `supabase db push`, and do not add RLS
>
> Roadmap step 6 said to run `supabase link` + `supabase db push` against
> `supabase/migrations/*` and verify RLS. **There is no `supabase/` directory
> and no migration files.** The schema lives in `PG_SCHEMA` in
> `src/server/db.ts`, applied idempotently by `pnpm run db:migrate`. That is the
> whole migration story — nothing is missing.
>
> On RLS: it would have **no effect** here. RLS constrains requests arriving
> through Supabase's Data API with a user JWT, and this app never makes one.
> Every query goes through `getDb()` on a direct `DATABASE_URL` connection,
> which connects as the owner and bypasses row-level policies. Supabase is used
> **only for OAuth sign-in** — there is not a single `.from()` data query in
> `src/`.
>
> Adding RLS now would provide no protection while adding risk: a policy on a
> table the app writes to either does nothing or silently breaks writes.
> Authorization is enforced in the application — see `docs/ARCHITECTURE.md`.
>
> **Revisit only if** the browser is ever given direct Supabase Data API access
> (a client-side `.from()` query, or Realtime). Then RLS becomes mandatory
> before that ships.

`ADMIN_EMAIL` / `ADMIN_PASSWORD` are read only by `scripts/seed-admin.ts`. Pass
them inline for the one-off run; do **not** store them in Vercel.

---

## 3. Tier 2 — Required for the launch feature set

### Payments — Billplz

| Variable                | Source                                                   | Notes                                                                                             |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `BILLPLZ_API_KEY`       | Billplz dashboard → Settings → API keys (**production**) | Also the **HMAC secret for webhook verification** — see §6.1.                                     |
| `BILLPLZ_COLLECTION_ID` | Billplz → Billing → Collections                          | Both must be set or `getPaymentProvider()` returns `"dev"` and no real bill is created.           |
| `BILLPLZ_BASE_URL`      | `https://www.billplz.com/api/v3`                         | Defaults to live. Sandbox: `https://www.billplz-sandbox.com/api/v3`. **Use sandbox first.**       |
| `BILLPLZ_CALLBACK_URL`  | _optional_                                               | Defaults to `${NEXT_PUBLIC_SITE_URL}/api/payments/webhook`. Leave unset if the site URL is right. |
| `BILLPLZ_REDIRECT_URL`  | _optional_                                               | Defaults to `${NEXT_PUBLIC_SITE_URL}/dashboard`.                                                  |

Register the callback URL in the Billplz dashboard too — the webhook is the
**only** path that confirms a booking.

### Email

| Variable                                   | Source                                     | Notes                                                                                                                       |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER`                           | `brevo` \| `resend` \| `postmark` \| `dev` | Defaults to `dev` (writes to `email_outbox`, sends nothing). **Must be set** or no user ever receives a verification email. |
| `BREVO_API_KEY`                            | Brevo → SMTP & API → API keys              | Recommended per `.env.example`.                                                                                             |
| `RESEND_API_KEY` / `POSTMARK_SERVER_TOKEN` | provider dashboard                         | Alternatives.                                                                                                               |
| `EMAIL_FROM`                               | `Leish! <no-reply@leish.my>`               | Sender must pass SPF/DKIM on the sending domain.                                                                            |

Auto-detection: if `EMAIL_PROVIDER` is unset, the first key found wins
(`RESEND` → `POSTMARK` → `BREVO`). Set it explicitly. If a provider is named
but its key is missing, the app **falls back to `dev` with a warning** —
silently no email. Verify with a real signup, not the log line.

### Cron protection

| Variable              | Source                    | Notes                                                                                                             |
| --------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`         | `openssl rand -base64 32` | Guards all **eight** cron routes. Vercel sends it as a Bearer token.                                              |
| `INTERNAL_API_SECRET` | `openssl rand -base64 32` | _Optional._ Accepted by `/api/cron/email-retries` as an alternative to `CRON_SECRET`. Absent from `.env.example`. |

Eight crons are declared in `vercel.json`: `retention` (02:00),
`quotation-expiry` (hourly), `balance-reminders` (09:00), `email-retries`
(every 5 min), `booking-transitions` (hourly), `payout-automation` (03:00),
`review-requests` (10:00), `quotation-recovery` (11:00).

Note that Vercel's Hobby plan caps cron frequency at once per day, which the
5-minute `email-retries` schedule exceeds — confirm the plan supports these
schedules, or the retry queue will not drain.

### File uploads

| Variable                | Source                                              | Notes                                                                              |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `BLOB_READ_WRITE_TOKEN` | Auto-injected by Vercel once a Blob store is linked | `src/lib/storage.ts` **throws** if missing. Only needed if uploads ship at launch. |

`next.config.ts` restricts `images.remotePatterns` to `*.supabase.co` and
`*.public.blob.vercel-storage.com`. Storage code uses **Vercel Blob**, so if you
serve images from Supabase Storage instead, that code path does not exist yet.

---

## 4. Tier 3 — Recommended

| Variable                                                  | Source                     | Why                                                                                                      |
| --------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN`                                              | Sentry → new project → DSN | Roadmap step 11. Confirm errors arrive from `webhook/route.ts` and `email.ts`.                           |
| `PEPPER_SECRET`                                           | `openssl rand -hex 16`     | HMAC pepper before scrypt. **Set at launch or never** — changing it invalidates every existing password. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile     | Bot protection. Inactive unless both are set. **Must be Cloudflare-issued — see below.**                 |
| `ALLOWED_ORIGINS`                                         | comma-separated            | Extra CORS origins beyond the site URL.                                                                  |
| `LOG_LEVEL`                                               | `info`                     | Default is `info`.                                                                                       |
| `AGNOST_ORG_ID` + `NEXT_PUBLIC_AGNOST_ORG_ID`             | Agnost dashboard           | Analytics; no-ops when unset.                                                                            |

> **🔴 `TURNSTILE_SECRET_KEY` cannot be self-generated.** It is a shared secret
> issued by Cloudflare and paired with `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
> Rotate it in **Cloudflare → Turnstile → your widget → Rotate secret**, never
> with `openssl rand`. A locally generated value is non-empty and plausible, so
> it silently switches the app from "skip verification" to "attempt
> verification", and Cloudflare rejects every call.
>
> Real Cloudflare secrets begin `0x`; documented testing keys begin `1x`/`2x`/`3x`.
> As of `src/server/turnstile.ts` the app validates this format and **degrades
> to skipping verification** (with a `malformed_secret` alert) rather than
> failing closed, because failing closed on a bad secret rejects 100% of logins
> and registrations. Do not "fix" that by failing closed — see the rationale in
> that file's header.
>
> The same applies to the other third-party shared secrets: `BILLPLZ_API_KEY`
> rotates at Billplz, OAuth keys at Supabase/Google/Facebook. Only
> `SESSION_SECRET`, `CRON_SECRET`, and `PEPPER_SECRET` are yours to generate.

### Supabase client keys

| Variable                        | Notes                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Needed for OAuth sign-in (`/api/auth/oauth/*`, `/auth/callback`) and for `/admin/**` to recognise an OAuth user. Not a data path. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same.                                                                                                                             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only. **Never** mark as a `NEXT_PUBLIC_*` variable.                                                                        |

These are separate from `DATABASE_URL`. The booking loop uses the db-facade
(`DATABASE_URL`); the admin console uses the Supabase client.

---

## 5. Tier 4 — Do not set (inactive or unused)

Setting these achieves nothing today and creates false confidence.

| Variable                                                                     | Status                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UPSTASH_REST_URL` / `_TOKEN`                                                | **Inactive.** `ratelimit.ts` hardcodes the in-memory store: _"Default limiter: ALWAYS memory (Upstash disabled for this deployment)."_ The Upstash store exists but is never wired to the default limiter. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN`                                          | A **second, different** name pair read by `redis.ts`. Two schemes coexist; neither is on the live rate-limit path.                                                                                         |
| `WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`                                    | Only feed `areWebhooksConfigured()`, which nothing calls. Stripe is not a payment path here. Candidates for deletion.                                                                                      |
| `R2_*` (5 vars)                                                              | Only `scripts/migrate-to-r2.ts`, a one-off. Not used at runtime.                                                                                                                                           |
| `SLACK_CHANNEL_ID`, `CONNECT_SLACK_CONNECTOR`                                | Slack notifications require a Vercel Connect connector. No-op without one.                                                                                                                                 |
| `NEXT_PUBLIC_CHAT_WS_URL`, `CHAT_NEW_SYSTEM_ENABLED`, `CHAT_ROLLOUT_PERCENT` | Cloudflare Worker chat. Only if the Worker is deployed — separate from the Vercel app.                                                                                                                     |
| `POSTGRES_URL`                                                               | Alias read only by `scripts/retain-purge.mjs`; falls back to `DATABASE_URL`.                                                                                                                               |
| `NEON_AUTH_*`                                                                | Placeholders in `deploy-env.md`. Neon Auth is **gone** per the handover. Do not carry them over.                                                                                                           |
| `BILLPLZ_X_SIGNATURE_KEY`                                                    | **Not read by any code.** See §6.1.                                                                                                                                                                        |

> **Rate limiting is in-memory in production.** On multi-instance serverless each
> instance keeps its own counters, so effective limits are multiplied by the
> instance count, and counters reset whenever an instance is recycled. A known,
> accepted limitation — but know it before launch.
>
> Accepted because the limiter blunts casual abuse and retry storms; it is not a
> security control, and nothing enforcing authorization or money depends on it.
> Setting `UPSTASH_REST_*` will **not** fix this — the default limiter ignores
> those variables (see §5). The fix is a one-line change in
> `src/server/ratelimit.ts` to use `createUpstashStore()`, which is already
> implemented and tested. Escalate to that if you see credential-stuffing on
> `/api/auth/login` or repeated bill creation on `/api/bookings/[id]/pay-fee`.

---

## 6. Documentation corrections

### 6.1 Billplz webhook secret

`AGENTS.md` (lines 85, 86, 186, 445), `docs/02-SRS`, and
`docs/CODEBASE-AUDIT-FINAL.md` all state that `BILLPLZ_X_SIGNATURE_KEY` is
**required** for webhook verification. **It is not read anywhere in the code.**

`verifyBillplzSignature()` in `src/server/payments.ts:383` uses
`BILLPLZ_API_KEY` as the HMAC secret over the **raw request body**:

```ts
export function verifyBillplzSignature(
  rawBody: string,
  signatureHeader: string | null,
  apiKey = process.env.BILLPLZ_API_KEY,
): boolean;
```

The audit also describes signing over a concatenation of
`amount|collection_id|id|paid|paid_amount|state` in
`src/lib/payments/billplz.ts` — **that file does not exist**; it was removed
when the booking loop was unified (see the handover). `deploy-env.md` already
records the correction; the other docs are stale.

**Impact:** following `AGENTS.md` you would set a variable that does nothing and
possibly omit nothing critical — but you would also be looking in the wrong
place when the webhook returns 401.

### 6.2 Brevo auto-detection

`deploy-env.md` notes brevo is "in the type union but not in
`getActiveEmailProvider()` auto-detect". **It is now** —
`src/server/integrations.ts:29` returns `"brevo"` when `BREVO_API_KEY` is set.

### 6.3 Variables absent from `.env.example`

Read by code but undocumented: `INTERNAL_API_SECRET`, `AGNOST_ENDPOINT`,
`NEXT_PUBLIC_AGNOST_ENDPOINT`, `NEXT_PUBLIC_CHAT_WS_URL`,
`CHAT_NEW_SYSTEM_ENABLED`, `CHAT_ROLLOUT_PERCENT`, `POSTGRES_URL`,
`WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, and the five `R2_*` vars. All are
Tier 3/4; none block launch.

---

## 7. 🔴 Security: rotate the secrets committed in `deploy-env.md`

`deploy-env.md` is **tracked in git** and contains live production credentials:

- a real `SESSION_SECRET`
- a full Neon `DATABASE_URL` **including the password**
- a real `BILLPLZ_API_KEY` and `BILLPLZ_COLLECTION_ID` — which, per §6.1, is
  also the **webhook signing secret**, so anyone with it can forge a paid
  webhook and confirm bookings without paying
- a real `CRON_SECRET`
- real Turnstile keys

Anyone with repository read access has these. **Treat every one as compromised.**

Recommended, in order:

1. **Rotate all of them** at their sources before going live. Generate fresh
   values for the new environment — never carry these across.
2. **Stop tracking the file**: `git rm --cached deploy-env.md` and add it to
   `.gitignore`, or strip the values and keep it as a template.
3. Note that removal does **not** purge git history. A history rewrite
   (`git filter-repo`) plus force-push would be needed, which rewrites every
   commit SHA — an owner decision. Rotation matters more than purging.

Since the Billplz key doubles as the webhook HMAC secret, item 1 is the
highest-priority action in this entire document.

### 7.1 Rotation status — updated 2026-09-04

| Secret                 | Status                        | Note                                                                                                                                                                                    |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BILLPLZ_API_KEY`      | ✅ Rotated at Billplz         | Live key on production, **sandbox key on preview** with `BILLPLZ_BASE_URL` pointed at sandbox. Correct split — keep it.                                                                 |
| `SESSION_SECRET`       | ✅ Rotated                    | Self-generated is correct here. Invalidates all existing sessions on deploy.                                                                                                            |
| `CRON_SECRET`          | ✅ Rotated                    | Self-generated is correct here.                                                                                                                                                         |
| `TURNSTILE_SECRET_KEY` | ⚠️ Needs a **Cloudflare** key | Was set to a self-generated value, which is never valid. Re-issue in the Cloudflare dashboard, or unset it to disable Turnstile.                                                        |
| `DATABASE_URL`         | 🔴 **Still outstanding**      | Being marked "sensitive" in Vercel does not help: the password is in `deploy-env.md`'s git history. Rotate the Neon password and update `DATABASE_URL` **and** `DATABASE_URL_UNPOOLED`. |

Steps 2 and 3 above (untracking the file, history rewrite) remain open and are
owner decisions.

---

## 8. Verification

After setting everything in **Vercel → Production**:

```bash
# Locally, against the production DATABASE_URL (read-only sanity check):
pnpm run env:check
```

Then, on the deployed instance:

1. `GET /api/health` returns OK.
2. Sign up → **a real verification email arrives** (not just an outbox row).
3. Admin login works at `/admin` (exercises the Supabase keys).
4. A cron route returns 401 without the secret, 200 with it.
5. Sandbox Billplz payment: bill → webhook → `payments.paid` → booking
   `confirmed`.
6. Only then switch `BILLPLZ_BASE_URL` to live and do the **RM 1 real payment**
   (Roadmap step 9).

Do not skip step 5. The webhook is the only path that confirms a booking, and a
signature mismatch there fails closed — the client is charged and the booking
never confirms.

### 8.1 Webhook alerting — set `SENTRY_DSN` before the first real payment

`POST /api/payments/webhook` deliberately returns 200 on most failures so
Billplz stops retrying. That means **the HTTP status tells you nothing**;
alerting is the only way these surface. The route calls `reportError()` on
every non-happy path:

| Alert message                                 | Meaning                                                                                                                                         | Action                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Billplz webhook signature verification failed | `metadata.apiKeyConfigured: false` ⇒ `BILLPLZ_API_KEY` is unset and **no payment will ever confirm**. If true ⇒ wrong key, or forged callbacks. | Treat as SEV-1 during launch. Check the key matches the Billplz account that owns the collection. |
| Paid Billplz bill has no payment row          | Money taken, nothing to settle against.                                                                                                         | Reconcile by hand from the Billplz dashboard.                                                     |
| Paid Billplz callback for unknown bill        | Valid signature, unrecognised bill — usually a stale bill from another environment pointing at this callback URL.                               | Confirm `BILLPLZ_CALLBACK_URL` is not shared between sandbox and prod.                            |

Without `SENTRY_DSN` (or `ERROR_WEBHOOK_URL`) these reports go only to the
process log, where nobody is watching. `SENTRY_DSN` is listed as Tier 3
"recommended" in §4 for the app generally — **for the webhook it is effectively
required**, because a paid-but-unconfirmed booking is otherwise invisible until
the customer complains.

Verify it end to end before launch: send a deliberately mis-signed POST to the
deployed webhook and confirm the alert arrives.

```bash
curl -X POST https://<prod-host>/api/payments/webhook \
  -H 'content-type: application/json' \
  -H 'x-billplz-signature: 0000000000000000000000000000000000000000000000000000000000000000' \
  -d '{"id":"alerting_smoke_test","paid":true,"state":"paid"}'
# Expect 401, and an "invalid_signature" alert in Sentry within ~1 min.
```

---

## Quick reference

```
Tier 1 (blocking)   SESSION_SECRET  DATABASE_URL  NEXT_PUBLIC_SITE_URL
Tier 2 (launch)     BILLPLZ_API_KEY  BILLPLZ_COLLECTION_ID  BILLPLZ_BASE_URL
                    EMAIL_PROVIDER  <provider key>  EMAIL_FROM
                    CRON_SECRET  [BLOB_READ_WRITE_TOKEN if uploads ship]
                    NEXT_PUBLIC_SUPABASE_URL  NEXT_PUBLIC_SUPABASE_ANON_KEY
                    SUPABASE_SERVICE_ROLE_KEY
Tier 3 (advised)    SENTRY_DSN  PEPPER_SECRET  TURNSTILE_*  AGNOST_*
Tier 4 (skip)       UPSTASH_*  R2_*  STRIPE_WEBHOOK_SECRET  NEON_AUTH_*
                    BILLPLZ_X_SIGNATURE_KEY
```
