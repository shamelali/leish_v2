# Leish.my Deployment — Environment Variables Reference

> Gathered from `.env.local`, `.env.local.bak`, `.env.local.bak2`, and source code analysis.
> Date: 2026-08-27

---

## Vercel Project

| Field | Value |
|---|---|
| Team | `shamelali's projects` (`team_4jCTNYGtzWrEYVfecXELf5YU`) |
| Live project | `leishmy` (prj_SdMIAXv6ubqoQWA2mVl3ABA4Snqb) — linked to `shamelali/leishmy` |
| Target project | `leishv2` — **already exists in account, needs deletion + re-creation** |
| Target repo | `shamelali/leish_v2` |
| Framework | Next.js |
| Domain | `leish.my` |

---

## Required (production will crash without these)

| Variable | Value | Notes |
|---|---|---|
| `SESSION_SECRET` | `vxlbk1olikeXI5K8mjvLAjvusgCIq24nP9U7slvHOT4=` | 32-byte base64, signs JWTs |
| `DATABASE_URL` | `postgresql://neondb_owner:npg_shOYe2vKN8kf@ep-delicate-resonance-azhtj4t1.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require` | Neon PostgreSQL |
| `NEXT_PUBLIC_SITE_URL` | `https://leish.my` | Used for metadata, sitemap, emails, Billplz callbacks |

## Recommended (warns but doesn't crash)

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_URL` | `https://leish.my` | May be redundant with NEXT_PUBLIC_SITE_URL |
| `CRON_SECRET` | `9PxTPwj8mePlAxSkA0pWTvP7IgGU80ArKcv0DlmGy4s=` | Protects /api/cron/* endpoints |

## Email — Brevo (current config)

| Variable | Value | Notes |
|---|---|---|
| `EMAIL_PROVIDER` | `brevo` | Note: codebase supports dev/resend/postmark; brevo is in type union but not in `getActiveEmailProvider()` auto-detect |
| `BREVO_API_KEY` | `xkeysib-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` | Brevo (ex-Sendinblue) API key |
| `EMAIL_FROM` | `Leish! <no-reply@leish.my>` | Default sender (used if not set) |

### Previous email configs (from .bak files)

| Variable | Value | Notes |
|---|---|---|
| `EMAIL_PROVIDER` | `resend` | Was used in .env.local.bak2 |
| `RESEND_API_KEY` | `re_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` | Resend API key (from .bak2) |

## Payments — Billplz

| Variable | Value | Notes |
|---|---|---|
| `BILLPLZ_API_KEY` | `034e5380-3276-4a55-a078-8edc4c0295bd` | Found in migrate-leishmy-to-nextjs/.env (production) |
| `BILLPLZ_COLLECTION_ID` | `8sij1nzh` | Found in migrate-leishmy-to-nextjs/.env (production) |
| `BILLPLZ_X_SIGNATURE_KEY` | _(not needed)_ | v2 code uses BILLPLZ_API_KEY for HMAC verification |
| `BILLPLZ_BASE_URL` | `https://www.billplz.com/api/v3` (default) | Live host; sandbox: `https://www.billplz-sandbox.com/api/v3` |
| `BILLPLZ_CALLBACK_URL` | _(defaults to NEXT_PUBLIC_SITE_URL/api/payments/webhook)_ | |
| `BILLPLZ_REDIRECT_URL` | _(defaults to NEXT_PUBLIC_SITE_URL/dashboard)_ | |

## Bot Protection — Cloudflare Turnstile

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `0x4AAAAAAEaBz0L0kZEVlLSt` | Widget site key (leish.my) |
| `TURNSTILE_SECRET_KEY` | `0x4AAAAAAEaBz8BLW67_hHJpPK16ybVCL6E` | Retrieved via `wrangler turnstile widget get` |

## Storage — Cloudflare R2

| Variable | Value | Notes |
|---|---|---|
| `R2_ACCOUNT_ID` | `26565f2b5af4f08b4a28122e9484c9e4` | Same as Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | _(not set)_ | **R2 NOT ENABLED** — enable via Cloudflare Dashboard first |
| `R2_SECRET_ACCESS_KEY` | _(not set)_ | Create API token after enabling R2 |
| `R2_BUCKET` | `leish-v2-assets` (from .env.example) | Will be created when R2 is enabled |
| `R2_PUBLIC_URL` | `https://assets.leish.my` | Custom domain on R2 bucket |

## Observability (optional)

| Variable | Value | Notes |
|---|---|---|
| `LOG_LEVEL` | _(not set, defaults to info)_ | |
| `LOG_WEBHOOK_URL` | _(not set)_ | |
| `SENTRY_DSN` | _(not set)_ | |
| `ERROR_WEBHOOK_URL` | _(not set)_ | |

## Security (optional)

| Variable | Value | Notes |
|---|---|---|
| `ALLOWED_ORIGINS` | _(not set)_ | Comma-separated extra origins |
| `PEPPER_SECRET` | _(not set)_ | Password pepper for scrypt |

## Neon Auth (placeholder)

| Variable | Value | Notes |
|---|---|---|
| `NEON_AUTH_BASE_URL` | `https://your-project-id.neon.build` | **PLACEHOLDER — needs real value or remove** |
| `NEON_AUTH_COOKIE_SECRET` | `GENERATE_ANOTHER_ONE_WITH_OPENSSL` | **PLACEHOLDER — needs real value or remove** |

---

## Summary of missing/placeholder values

| Variable | Status | Action needed |
|---|---|---|
| `BILLPLZ_API_KEY` | ✅ Found | Set in .env.local |
| `BILLPLZ_COLLECTION_ID` | ✅ Found | Set in .env.local |
| `BILLPLZ_X_SIGNATURE_KEY` | ✅ Not needed | v2 uses BILLPLZ_API_KEY for HMAC |
| `TURNSTILE_SECRET_KEY` | ✅ Retrieved | Set in .env.local via wrangler |
| `R2_ACCOUNT_ID` | ✅ Known | `26565f2b5af4f08b4a28122e9484c9e4` |
| `R2_ACCESS_KEY_ID` | ❌ R2 not enabled | Enable R2 in Cloudflare Dashboard → R2 |
| `R2_SECRET_ACCESS_KEY` | ❌ R2 not enabled | Create API token after enabling R2 |
| `NEON_AUTH_BASE_URL` | ⚠️ Placeholder | Configure or remove |
| `NEON_AUTH_COOKIE_SECRET` | ⚠️ Placeholder | Configure or remove |
