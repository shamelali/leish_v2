# Roadmap to Deployment — 2026-08-19 audit

Projects: **GitHub** [`shamelali/leish_v2`](https://github.com/shamelali/leish_v2) ·
**Vercel** `shamelalis-projects/leish-v2` (deployment `UkJN7XcZFEZyXLPp4LHFNxALYNt8` —
dashboard URL is login-gated; verify its state from the Vercel console).

## Current state (verified in this audit)

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` / typecheck / lint              | ✅ pass                                                                                                                                                                                                                                                                                                                                             |
| Unit tests (vitest)                      | ✅ 122/122 pass                                                                                                                                                                                                                                                                                                                                     |
| Production build (`next build`)          | ✅ passes without secrets (build is exempt from env checks)                                                                                                                                                                                                                                                                                         |
| E2E suite discovery                      | ✅ 6 tests in `e2e/smoke.spec.ts`                                                                                                                                                                                                                                                                                                                   |
| E2E assertions vs live production server | ✅ all 6 replayed and pass against `PORT=3100 next start`                                                                                                                                                                                                                                                                                           |
| E2E `webServer` boot in CI               | ❌ **was broken** — `next start` requires `SESSION_SECRET` at runtime (`src/env.ts`, added in `54e77a8`), and neither `playwright.config.ts` nor `ci.yml` set it. **Fixed on this branch** by injecting a throwaway `SESSION_SECRET` via `webServer.env` (verified: server boots + tests pass)                                                      |
| `npm run db:migrate`                     | ❌ **was broken** — `package.json` pointed at `scripts/migrate.ts`, which was never committed (`MODULE_NOT_FOUND`). **Fixed on this branch**: script added, imports the same `PG_SCHEMA` from `src/server/db.ts` (single source of truth), idempotent + additive column backfills                                                                   |
| GitHub Actions                           | ❌ **billing-locked** (re-confirmed 2026-08-19 11:40Z — the readiness PR's `check`/`e2e` jobs also died in ~2s). Both jobs on `main` failed instantly: _"The job was not started because your account is locked due to a billing issue."_ No green e2e run exists in recorded history. **Owner must clear the billing lock.**                       |
| Vercel project `leish-v2`                | ✅ **alive and building** — PR #12's preview check passed (`BVKWqSP5QBMQbEeGwmCw1wd26Pkk`), so the GitHub↔Vercel integration and the production build path work. Preview URL: `https://leish-v2-git-arena-01a019be-leish-v2-shamelalis-projects.vercel.app` (SSO-protected — log in to view). Production env vars still need to be set per Phase 1. |
| Vercel project `leish-code`              | ❌ **a second, stale Vercel project watches this repo** and builds from the `leish-code/` directory. Its preview failed once this PR removed that directory (expected, preview-only). **Recommend decommissioning the project** (`vercel.com/shamelalis-projects/leish-code`) in the Vercel console to stop it shadow-building the repo.            |
| `leish-code/` directory                  | ⚠️ was a stale near-duplicate of the app (older `env.ts`, `proxy.ts`), referenced nowhere — **removed on this branch**. Deployment hazard gone; still confirm the Vercel project's Root Directory is the repo root                                                                                                                                  |

## Phase 0 — Unblock the pipeline (no deploy yet)

1. **Fix GitHub billing**: Settings → Billing, clear the lock so Actions can run again.
2. **Merge the readiness PR** (branch `arena/01a019be-leish-v2`): e2e `webServer`
   `SESSION_SECRET` fix, the missing `scripts/migrate.ts` restored, and the stale
   `leish-code/` copy removed. After merge, require a green `check` + `e2e` run on
   `main` (first true green e2e run on record).
3. **Confirm Vercel project settings**: Root Directory = repo root, Production
   branch = `main`, and "auto-deploy from bot/agent commits" disabled
   (per HANDOVER non-negotiable: human review gate on `main`).

## Phase 1 — Infrastructure & environment

5. Create the fresh **Supabase** project (do not reuse v1 Neon/old Supabase).
   Set `DATABASE_URL` (pooler, `sslmode=require`) in Vercel **Production**.
6. `pnpm run db:migrate` against prod `DATABASE_URL`, then `pnpm run db:seed-catalog`
   and seed the first admin (`scripts/seed-admin.ts`).
   **Revised 2026-09-04:** the `supabase link` + `supabase db push` step is dropped.
   There is no `supabase/` directory and no migration files — the schema lives in
   `PG_SCHEMA` in `src/server/db.ts` and `db:migrate` applies it idempotently.
   "Verify RLS on all tables" is likewise dropped: RLS has no effect while all
   access goes through a direct `DATABASE_URL` connection, and authorization is
   enforced in the application. See `docs/ARCHITECTURE.md` and
   `docs/PHASE-1-ENV-CHECKLIST.md` §2.
7. Set every var from `.env.example` in Vercel Production — real values for
   `NEXT_PUBLIC_URL`/`NEXT_PUBLIC_SITE_URL` (`https://leish.my`, never localhost),
   `SESSION_SECRET` (`openssl rand -base64 32` — **required**, server won't boot without it),
   Supabase URL/anon key, Brevo, Billplz, Sentry. No `NEXT_PUBLIC_*` marked "sensitive".
8. Storage for portfolio images, **only if uploads ship at launch**. Note the code
   uses **Vercel Blob** (`src/lib/storage.ts`, needs `BLOB_READ_WRITE_TOKEN`), not
   Supabase Storage — `next.config.ts` allows both hosts, but only the Blob path is
   implemented.

## Phase 2 — Payments, email, observability

9. **Billplz**: production API key; callback URL `https://leish.my/api/payments/webhook`;
   one real low-value (RM 1) end-to-end payment — bill → webhook → HMAC verified →
   `payments.paid` → booking `confirmed`. The webhook is the only path that confirms.
10. **Email**: configure `EMAIL_PROVIDER=resend` (or `postmark`); set `RESEND_API_KEY`
    (or `POSTMARK_SERVER_TOKEN`); verify SPF/DKIM; test send via `/dev/emails` (dev) or
    trigger a real booking flow. Check free-plan cap vs launch volume.
11. **Sentry**: new project; confirm errors from `webhook/route.ts` and `email.ts` arrive.

## Phase 3 — Pre-launch verification

12. Green CI on `main` (Phase 0 outcome) is the gate for every merge until launch.
13. Manual smoke of the core loop (ordered list in `docs/DEPLOY.md` §6):
    client signup+verify → artist signup+verify+claim → request → accept → quotation →
    RM 200 fee → webhook confirm; negative tests (unverified book, bad webhook signature
    401, duplicate-date no-500).

## Phase 4 — Cutover

14. Connect `leish.my` in Vercel; point Cloudflare DNS at Vercel; verify
    `NEXT_PUBLIC_URL`-derived metadataBase, sitemap, robots, redirect/callback URLs.
15. Only after Phase 3 is fully checked: DNS cutover, then monitor Sentry + webhook logs
    for the first real bookings.

---

### E2E audit appendix (evidence)

- Suite: `e2e/smoke.spec.ts`, 6 tests (3 UI via chromium, 3 API-level), `fullyParallel`,
  2 retries on CI, trace on first retry.
- Runner: `.github/workflows/ci.yml` job `e2e` → `playwright install --with-deps chromium`
  → `npx playwright test` on PRs to `main` and pushes to `main`.
- Sandbox blocks the Playwright browser CDN (no browser could be installed locally), so
  the 6 tests were verified by replaying each assertion against the exact production
  server the `webServer` spawns (`build` + `PORT=3100 next start`): homepage title/hero
  h1 accessible name "Your Beauty, Perfected." + "Find & Book Artists" CTA; artists
  listing "Aisha Azman"; profile "Reception Makeup" + "Send Booking Request";
  `GET /api/bookings` → 401; register-then-book → 403 `EMAIL_NOT_VERIFIED`;
  register-artist-then-claim → 403 "verify your email". All matched.
- Root-cause of the red `main`: GitHub Actions billing lock (2-second job deaths), not a
  test/code failure — but the `SESSION_SECRET` gap means the e2e job would have failed
  even unlocked. Both addressed above.
