# AGENTS.md — Leish! v2

## Quickstart

```bash
cp .env.example .env.local
pnpm install        # or npm ci
npm run dev        # http://localhost:3000
```

## Commands (order matters)

```bash
npm run lint          # ESLint (0 warnings required)
npm run typecheck     # tsc --noEmit
npm test              # Vitest unit + component tests (48 tests)
npm run build         # production build
npx playwright test   # E2E (needs browsers; CI only)
```

**Order**: always `lint -> typecheck -> test -> build`. CI runs format → lint → typecheck → test → build.

## CI / GitHub Actions

This project uses GitHub Actions for automated quality gates. On every push to `main` and on pull requests:

- **CI** (`.github/workflows/ci.yml`): lint → typecheck → Vitest → Playwright → build
- **Quality Gate** (`.github/workflows/quality-gate.yml`): lint → typecheck → Vitest with coverage threshold → prettier check. Fails on coverage < 80%.
- **Deploy** (`.github/workflows/deploy.yml`): lint → typecheck → test → build → Vercel production deploy (guarded by human review)
- **Database** (`.github/workflows/database.yml`): runs Supabase migrations + type regeneration on `supabase/migrations/` changes
- **Billplz Webhook** (`.github/workflows/billplz-webhook.yml`): periodic verification of HMAC-SHA256 signature logic

## Environment

Copy `.env.example` to `.env.local`. Required vars:

- `SESSION_SECRET` — signs session JWTs (must be set in prod)
- `NEXT_PUBLIC_SITE_URL` — used for metadata, sitemap, OG metadata
- `LEISH_DB_PATH` — optional; defaults to `./data/leish.db` (SQLite)

Database: SQLite by default (node:sqlite). To use PostgreSQL (Supabase/Neon), set `DATABASE_URL`. Never mix SQLite and PostgreSQL in the same run.

## Architecture high-signal notes

- **Data flow**: `src/lib/data.ts` contains all artist/studio mock data. It is NOT read from the DB. DB tables (`providers`, `services`, `availability_slots`, `bookings`, `payment_transactions`, `profiles`) are Supabase-managed.
- **Commission**: `src/lib/payments/commission.ts` is the _only_ place to resolve `amount`/`depositAmount`. Never accept these from client input — must be derived server-side from `service.price` and `provider.default_deposit_percent`. The function accepts an optional `commissionPercent` (defaults to `MUA_COMMISSION_PERCENT`); never override it from client requests.
- **RLS**: Data access is enforced by Postgres RLS policies (`supabase/migrations/0002_rls_policies.sql`). The admin layout has a UI guard, but RLS is the defense-in-depth backstop.
- **Billplz webhook**: `src/lib/payments/billplz.ts` verifies `X-Signature` via HMAC-SHA256 over ordered fields: `amount|collection_id|id|paid|paid_amount|state`. Reject anything that doesn't match — this is the only guard against forged webhooks.
- **Email**: Dev provider stores messages in `email_outbox` table, viewable at `/dev/emails` (dev builds only). Production needs `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` in `.env.local`.
- **Static paths**: `@/*` aliases to `src/*` (tsconfig.json). Import via `import ... from "@/..."`.

## Constraints & gotchas

- `NEXT_PUBLIC_*` vars must NOT be marked "sensitive" in Vercel — they inline into the client bundle.
- `NEXT_PUBLIC_URL` must be `https://leish.my` in production Vercel; never `localhost`.
- All monetary values are server-derived. If you see `amount` or `depositAmount` accepted from a request body, stop and fix it.
- No bot/agent commits auto-deploy to production without a human review gate.
- `src/app/admin/providers/page.tsx` — approve/reject action is TODO'd, not wired.
- `src/lib/types/database.ts` is a placeholder — regenerate via `npm run db:types` after running supabase migrations.
- Vitest coverage excludes `src/lib/data.ts` (mock data).
- github Actions CI: `lint -> typecheck -> test -> build`. On failure, artifacts are uploaded.

## Testing

```bash
npm test              # run all Vitest tests
npm run test:coverage # with coverage report
```

- 48 unit/component tests. Coverage includes `src/lib/**` and `src/components/**`, excludes `src/lib/data.ts`.
- E2E: `npx playwright test` — requires browsers installed and server running (CI handles browser install).

## Formatting

```bash
npm run format   # prettier --write .
npm run format:check # prettier --check .
```