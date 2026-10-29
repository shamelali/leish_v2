# Leish.my Deployment — Environment Variables Reference

> ## 🔴 These credentials were committed to git. Rotate them.
>
> Until 2026-09-04 this file contained **live production secrets** in plain
> text: `SESSION_SECRET`, a Neon `DATABASE_URL` including its password,
> `CRON_SECRET`, `BILLPLZ_API_KEY`, and `TURNSTILE_SECRET_KEY`. The values have
> been redacted here, but **they remain in git history** and must be treated as
> compromised — anyone with read access to this repository has had them.
>
> The Billplz key is the urgent one: `verifyBillplzSignature()` uses
> `BILLPLZ_API_KEY` as the **webhook HMAC secret**, so whoever holds it can
> forge a signed `paid` callback and confirm bookings without payment.
>
> **Rotate every value at its source before going live.** Do not reuse any of
> them in the new environment. Redacting the file is not sufficient on its own;
> purging history would need `git filter-repo` and a force-push, which rewrites
> every commit SHA — an owner decision, and less important than rotating.
>
> Going forward, keep real values in Vercel's environment settings only. This
> file should stay a _map of where values come from_, never a store of them.
> See `docs/PHASE-1-ENV-CHECKLIST.md` for the provisioning guide.

> Gathered from `.env.local`, `.env.local.bak`, `.env.local.bak2`, and source code analysis.
> Date: 2026-08-27 · Secrets redacted 2026-09-04

---

## Vercel Project

| Field          | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| Team           | `shamelali's projects` (`team_4jCTNYGtzWrEYVfecXELf5YU`)                     |
| Live project   | `leishmy` (prj_SdMIAXv6ubqoQWA2mVl3ABA4Snqb) — linked to `shamelali/leishmy` |
| Target project | `leishv2` — **already exists in account, needs deletion + re-creation**      |
| Target repo    | `shamelali/leish_v2`                                                         |
| Framework      | Next.js                                                                      |
| Domain         | `leish.my`                                                                   |

---

## Required (production will crash without these)

| Variable               | Value                                                       | Notes                                                                     |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `SESSION_SECRET`       | _(ROTATED — generate a new one: `openssl rand -base64 32`)_ | 32-byte base64, signs JWTs                                                |
| `DATABASE_URL`         | _(ROTATED — pooler URI from the new Supabase project)_      | Supabase PostgreSQL (pooler, `sslmode=require`); old Neon project retired |
| `NEXT_PUBLIC_SITE_URL` | `https://leish.my`                                          | Used for metadata, sitemap, emails, Billplz callbacks                     |
| `CRON_SECRET`          | _(ROTATED — `openssl rand -base64 32`)_                     | Protects /api/cron/* endpoints                                            |

## Verified production cascade (2026-10-29)

With the four core vars present (`SESSION_SECRET`, `DATABASE_URL`,
`NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`), `validateEnv()` fails in this order:

1. Core required vars (all missing ones are listed together).
2. Billplz — `BILLPLZ_API_KEY` and `BILLPLZ_COLLECTION_ID` must be set together.
3. Email — `EMAIL_PROVIDER` plus its key, or an explicit `EMAIL_ALLOW_DEV=1`.

Supplying the core four + the Billplz pair + `EMAIL_PROVIDER=brevo` +
`BREVO_API_KEY` + `EMAIL_FROM` therefore boots with **no throw**. The only output
is the recommended-variable warning for `PEPPER_SECRET`, `SENTRY_DSN` and
`ERROR_WEBHOOK_URL`. Reproduced against `src/env.ts` on 2026-10-29.

## Recommended (warns but doesn't crash)

| Variable          | Value              | Notes                                      |
| ----------------- | ------------------ | ------------------------------------------ |
| `NEXT_PUBLIC_URL` | `https://leish.my` | May be redundant with NEXT_PUBLIC_SITE_URL |

## Email — Brevo (current config)

| Variable         | Value                                                              | Notes                                                            |
| ---------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `EMAIL_PROVIDER` | `brevo`                                                            | Natively supported by `getActiveEmailProvider()` + `brevoSend()` |
| `BREVO_API_KEY`  | `xkeysib-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` | Brevo (ex-Sendinblue) API key — provide in Vercel Production     |
| `EMAIL_FROM`     | `Leish! <no-reply@leish.my>`                                       | Set explicitly in Vercel Production                              |

### Previous email configs (from .bak files)

| Variable         | Value                                    | Notes                       |
| ---------------- | ---------------------------------------- | --------------------------- |
| `EMAIL_PROVIDER` | `resend`                                 | Was used in .env.local.bak2 |
| `RESEND_API_KEY` | `re_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` | Resend API key (from .bak2) |

## Payments — Billplz

| Variable                  | Value                                                     | Notes                                                        |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| `BILLPLZ_API_KEY`         | _(ROTATED — Billplz dashboard → Settings → API keys)_     | Found in migrate-leishmy-to-nextjs/.env (production)         |
| `BILLPLZ_COLLECTION_ID`   | _(from Billplz → Billing → Collections)_                  | Found in migrate-leishmy-to-nextjs/.env (production)         |
| `BILLPLZ_X_SIGNATURE_KEY` | _(not needed)_                                            | v2 code uses BILLPLZ_API_KEY for HMAC verification           |
| `BILLPLZ_BASE_URL`        | `https://www.billplz.com/api/v3` (default)                | Live host; sandbox: `https://www.billplz-sandbox.com/api/v3` |
| `BILLPLZ_CALLBACK_URL`    | _(defaults to NEXT_PUBLIC_SITE_URL/api/payments/webhook)_ |                                                              |
| `BILLPLZ_REDIRECT_URL`    | _(defaults to NEXT_PUBLIC_SITE_URL/dashboard)_            |                                                              |

## Bot Protection — Cloudflare Turnstile

| Variable                         | Value                                | Notes                                         |
| -------------------------------- | ------------------------------------ | --------------------------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | _(Cloudflare → Turnstile → widget)_  | Widget site key (leish.my)                    |
| `TURNSTILE_SECRET_KEY`           | _(ROTATED — Cloudflare → Turnstile)_ | Retrieved via `wrangler turnstile widget get` |

## Storage — Vercel Blob

| Variable                | Value                  | Notes                                                          |
| ----------------------- | ---------------------- | -------------------------------------------------------------- |
| `BLOB_READ_WRITE_TOKEN` | _(auto-set on Vercel)_ | Created via `vercel blob create-store`, auto-linked to project |

## Observability (optional)

| Variable            | Value                         | Notes |
| ------------------- | ----------------------------- | ----- |
| `LOG_LEVEL`         | _(not set, defaults to info)_ |       |
| `LOG_WEBHOOK_URL`   | _(not set)_                   |       |
| `SENTRY_DSN`        | _(not set)_                   |       |
| `ERROR_WEBHOOK_URL` | _(not set)_                   |       |

## Security (optional)

| Variable          | Value       | Notes                         |
| ----------------- | ----------- | ----------------------------- |
| `ALLOWED_ORIGINS` | _(not set)_ | Comma-separated extra origins |
| `PEPPER_SECRET`   | _(not set)_ | Password pepper for scrypt    |

## Neon Auth (placeholder)

| Variable                  | Value                                | Notes                                        |
| ------------------------- | ------------------------------------ | -------------------------------------------- |
| `NEON_AUTH_BASE_URL`      | `https://your-project-id.neon.build` | **PLACEHOLDER — needs real value or remove** |
| `NEON_AUTH_COOKIE_SECRET` | `GENERATE_ANOTHER_ONE_WITH_OPENSSL`  | **PLACEHOLDER — needs real value or remove** |

---

## Summary of missing/placeholder values

| Variable                  | Status         | Action needed                                              |
| ------------------------- | -------------- | ---------------------------------------------------------- |
| `DATABASE_URL`            | ✅ Supplied    | New Supabase project pooler URI — set in Vercel Production |
| `BILLPLZ_API_KEY`         | ✅ Supplied    | Set in Vercel Production (not `.env.local`)                |
| `BILLPLZ_COLLECTION_ID`   | ✅ Supplied    | Set in Vercel Production (not `.env.local`)                |
| `BREVO_API_KEY`           | ✅ Supplied    | Set in Vercel Production with `EMAIL_PROVIDER=brevo`       |
| `EMAIL_FROM`              | ✅ Supplied    | Set in Vercel Production                                   |
| `BILLPLZ_X_SIGNATURE_KEY` | ✅ Not needed  | v2 uses BILLPLZ_API_KEY for HMAC                           |
| `TURNSTILE_SECRET_KEY`    | ✅ Retrieved   | Set in .env.local via wrangler                             |
| `R2_ACCOUNT_ID`           | ✅ Known       | _(Cloudflare dashboard → account ID)_                      |
| `BLOB_READ_WRITE_TOKEN`   | ✅ Auto-set    | Created via CLI, linked to leishv2 project                 |
| `NEON_AUTH_BASE_URL`      | ⚠️ Placeholder | Configure or remove                                        |
| `NEON_AUTH_COOKIE_SECRET` | ⚠️ Placeholder | Configure or remove                                        |
