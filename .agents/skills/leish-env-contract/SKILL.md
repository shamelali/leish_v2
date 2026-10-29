---
name: leish-env-contract
description: "Use when adding, renaming, or removing an environment variable; when a boot fails with 'Missing required environment variable(s) in production'; when configuring a new integration, CI job, Playwright webServer, Docker run, or Vercel project. Triggers: src/env.ts, validateEnv, env.test.ts, .env.example, .env.local, SESSION_SECRET, DATABASE_URL, CRON_SECRET, PAYMENTS_ALLOW_DEV, EMAIL_ALLOW_DEV, SKIP_ENV_VALIDATION."
metadata:
  author: leish
  version: "1.0.0"
---

# Environment contract

`src/env.ts` is the single source of truth. It is called from
`src/instrumentation.ts` at boot and by `pnpm run env:check`.

## What production requires (hard fail)

`SESSION_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`.

## What production requires conditionally

- Payments: `BILLPLZ_API_KEY` and `BILLPLZ_COLLECTION_ID` must be set **together**
  (one without the other throws). Neither set requires an explicit
  `PAYMENTS_ALLOW_DEV=1` opt-out, otherwise boot fails — the dev provider
  records payments without collecting money.
- Email: `EMAIL_PROVIDER` (`resend | postmark | brevo`) with its API key,
  otherwise `EMAIL_ALLOW_DEV=1` is required for the same reason.

## Recommended (warns only)

`EMAIL_FROM`, `PEPPER_SECRET`, `SENTRY_DSN`, `ERROR_WEBHOOK_URL`.

## Rules

- `validateEnv()` skips the checks during `next build`. Do not set
  `SESSION_SECRET` to make a build pass; set it in `.env.local` or the platform.
- SQLite is the fallback when `DATABASE_URL` is absent — it is a *warning*, not
  an error, so a missing production database url does not fail the boot. Keep
  `DATABASE_URL` in the required list.
- `.env.example` is the template and must list every variable the code reads.
  `.env.local` is gitignored and holds real values; never print its contents.
- Playwright's `webServer.env` (`playwright.config.ts`) and `.github/workflows/*`
  each need their own copy of whatever the suite touches.

## Checklist for a new variable

1. Add the read in code, then add it to `src/env.ts` (required / conditional /
   recommended) and to `.env.example`.
2. Extend `src/env.test.ts` — it asserts the exact missing-variable error text.
3. Add it to `playwright.config.ts` `webServer.env` if any e2e path needs it.
4. Add it to the relevant workflow env block and to `deploy-env.md` /
   `docs/PHASE-1-ENV-CHECKLIST.md` if it is production-relevant.

Verify with `pnpm run env:check` and `pnpm test src/env.test.ts`.
