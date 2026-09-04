# NFR — Non-Functional Requirements (Supplementary Specification)

## Leish! v2 — Beauty Booking Marketplace

| Field           | Value                                             |
| --------------- | ------------------------------------------------- |
| **Document ID** | LEISH-NFR-v2.0                                    |
| **Version**     | 2.0.0                                             |
| **Date**        | 2026-08-29                                        |
| **Status**      | Baseline                                          |
| **Predecessor** | SRS (02) §7                                       |
| **Standard**    | ISO/IEC 25010 (SQuaRE) quality model + OWASP ASVS |

---

### 1. Purpose

Quantifies _how well_ the system shall perform, not what it does. Every NFR here is **measurable** and has a stated **fit-criterion** (pass/fail) and **verification method**.

Categories follow ISO 25010: Performance Efficiency, Compatibility, Usability, Reliability, Security, Maintainability, Portability — plus Compliance & Operations.

---

### 2. Performance Efficiency

#### NFR-P-01 — Response Time (Latency)

| Requirement                                           | Target (fit-criterion)                                   | Priority | Verification              |
| ----------------------------------------------------- | -------------------------------------------------------- | -------- | ------------------------- |
| Public catalog `GET /api/artists` (cached 300s) p95   | ≤500 ms on Vercel + PG; ≤300 ms on cold-cache SQLite dev | Must     | k6 / Vercel Analytics p95 |
| `POST /api/bookings` (create, incl. slot check) p95   | ≤400 ms excluding async email send                       | Must     | Load test 50 VUs          |
| `GET /api/bookings` (scoped list, 20 rows) p95        | ≤350 ms                                                  | Must     | Load test                 |
| `POST /api/payments/webhook` (verify+mark+settle) p95 | ≤300 ms                                                  | Must     | Webhook replay bench      |
| `PATCH /api/bookings/[id]` (state transition) p95     | ≤250 ms                                                  | Must     | Unit bench                |
| Admin dashboard aggregates `GET /api/admin` p95       | ≤800 ms (aggregated counts)                              | Should   | Bench                     |

_Measurement_: from Cloudflare/Vercel edge timing (`x-vercel-cache`, server-timing header if added) or `pino` request duration field.

#### NFR-P-02 — Throughput

| Requirement                | Target                               | Verification |
| -------------------------- | ------------------------------------ | ------------ |
| Sustained bookings         | 10 rps (sustained) without error     | Must         | k6 soak 10m    |
| Webhook ingestion          | 20 rps burst for 60s (Billplz spike) | Must         | Replay harness |
| Concurrent users (catalog) | 500 concurrent (95% <500 ms)         | Should       | k6             |

#### NFR-P-03 — Capacity & Scalability

| Requirement    | Target                                                                  | Implementation |
| -------------- | ----------------------------------------------------------------------- | -------------- |
| Catalog growth | 10k artists, 5k studios without schema change                           | Must           | `listAllArtists` paginated `limit≤500` guard; indexes on `state,area` |
| DB pool        | PG_MAX 10 by default, configurable to 50 (Neon limits)                  | Must           | `src/server/db.ts:840` Pool config                                    |
| Storage        | Images via Supabase/Vercel Blob, not DB                                 | Must           | `images.remotePatterns` `*.supabase.co`                               |
| Horizontal     | Stateless handlers (no session affinity); Redis optional for rate-limit | Must           | `getDb()` facade no sticky state                                      |

#### NFR-P-04 — Resource Utilization

| Requirement            | Target                                                           | Verification |
| ---------------------- | ---------------------------------------------------------------- | ------------ |
| Vercel function memory | ≤512 MB per invocation                                           | Must         | Vercel dashboard                      |
| PG connections         | P95 ≤ 80% of `PG_MAX`; idle 10s timeout prevents pool exhaustion | Must         | `pgPool` stats + `PG_IDLE_TIMEOUT_MS` |
| SQLite WAL             | Enabled (`PRAGMA journal_mode=WAL`) for concurrent readers       | Must         | `src/server/db.ts:876`                |

---

### 3. Reliability

#### NFR-R-01 — Availability

| Requirement                 | Target                                                              | Implementation |
| --------------------------- | ------------------------------------------------------------------- | -------------- |
| Production uptime (monthly) | ≥99.5% (≤3.6h downtime/mo) measured at `GET /api/health` externally | Must           | Vercel SLA + UptimeRobot; Docker `HEALTHCHECK` |
| Health endpoint             | Responds <1s even when email/Billplz down (degraded mode)           | Must           | `/api/health` does not call external services  |

#### NFR-R-02 — Fault Tolerance

| Requirement                                                                           | Target                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| DB pool error does not crash process                                                  | Must — `pool.on("error")` logs `pino.error` but keeps serving      |
| Email provider failure degrades to `email_outbox`                                     | Must — never throws from `sendEmail()` to caller route             |
| Settings read failure falls back to defaults                                          | Must — `getSetting()` catches and warns, never breaks payment math |
| Billplz API timeout → payment marked `required` (not `failed`) until webhook confirms | Must                                                               |

#### NFR-R-03 — Recoverability

| Requirement                                                                                                                  | Target                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| SQLite PG migration failure logs and throws (forces deploy rollback)                                                         | Must — `pgReady` catch logs and rethrows |
| Session JTI lookup failure (infra) is fail-open (accept valid signature) but logs warning — explicit `revoked=1` always wins | Must                                     |

#### NFR-R-04 — Data Integrity

| Requirement                                                | Target                                    |
| ---------------------------------------------------------- | ----------------------------------------- |
| Money never stored as float                                | Must — all `INTEGER sen`                  |
| Unique slot constraint enforced even under race            | Must — partial index + friendly 409 catch |
| Rating blend without lost updates under concurrent reviews | Must — single UPDATE                      |

---

### 4. Security

#### NFR-S-01 — Authentication

| ID      | Requirement                                                                                 | Fit-criterion                                                             | Verification                       |
| ------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| S-01.01 | Passwords scrypt-hashed with random salt, timing-safe compare, optional pepper HMAC         | No plaintext in logs/DB; `PEPPER_SECRET` rotates via `PEPPER_VERSION`     | Code review + `src/server/auth.ts` |
| S-01.02 | JWT HS256 with `SESSION_SECRET` 32-byte base64 in prod; 7-day TTL; JTI revocation table     | `validateEnv()` throws if weak secret in prod; `revokeSession` clears JTI | Pentest + session tests            |
| S-01.03 | Cookie `leish_session` flags: `httpOnly` always, `Secure` in prod, `SameSite=lax`, `Path=/` | Header inspection                                                         | OWASP ZAP                          |
| S-01.04 | No user enumeration on login/forgot-password                                                | Constant-time response regardless of user existence                       | Auth tests                         |

#### NFR-S-02 — Authorization

| ID      | Requirement                                                                                    | Fit-criterion                                                                 |
| ------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| S-02.01 | `requireAdmin` guards every `/api/admin/*`; `/admin/*` layout also server-guards before render | Must — 401/403 tests; `src/app/api/admin/list-routes.test.ts` audits coverage |
| S-02.02 | Booking ownership: customer only sees `WHERE user_id=?`; artist only sees claimed ids          | Must — scope tests                                                            |
| S-02.03 | Message SSE: participants only (`owner` OR `claimedArtist`)                                    | Must — 403 for third party                                                    |

#### NFR-S-03 — Input Validation & Injection

| ID      | Requirement                                                                                                                       | Fit-criterion                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| S-03.01 | All API inputs validated with `zod` via `registerSchema/loginSchema/bookingSchema/quotationSchema/artistsQuerySchema`             | Must — zod rejects invalid before any DB touch                |
| S-03.02 | No SQL string concatenation for table names; `applyUpdate` field-map whitelist; values always via placeholders (`?`/`@name → $n`) | Must — `ARTIST_UPDATE_FIELDS` whitelist                       |
| S-03.03 | Billplz webhook verified via `verifyBillplzSignature` timing-safe **before** any state mutation                                   | Must — reject 401 on bad sig; test suite covers tampered body |

#### NFR-S-04 — Security Headers & Transport

| Header                      | Value                                                                                    | Source                          |
| --------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (prod)                                    | `next.config.ts`                |
| `X-Frame-Options`           | `DENY`                                                                                   | `next.config.ts`                |
| `X-Content-Type-Options`    | `nosniff`                                                                                | `next.config.ts`                |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                        | `next.config.ts`                |
| `Content-Security-Policy`   | Per-request nonce, no `unsafe-inline` for scripts; inline theme script uses nonce/hashed | `next.config.ts` + `layout.tsx` |
| `Content-Type` charset      | `utf-8` always                                                                           | Next default                    |

#### NFR-S-05 — Rate Limiting & Bot Protection

| Requirement                                                                                                                                | Fit-criterion                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Sliding window per IP on `register/login/forgot/verify-email/bookings webhook` — Upstash Redis when `UPSTASH_REST_URL` set, else in-memory | Must — 429 + `Retry-After` header            |
| Turnstile widget (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) required for `register/login/forgot/bookings pay-*` when configured                    | Should — skip silently in dev/e2e when unset |
| `ALLOWED_ORIGINS` extra origins checked for state-changing requests                                                                        | Should                                       |

#### NFR-S-06 — Vulnerability Management

| Requirement                                               | Fit-criterion  |
| --------------------------------------------------------- | -------------- |
| `npm audit` clean criticals at build; Dependabot auto-PRs | Must           |
| ESLint `next` rules clean (`npm run lint` 0 warnings)     | Must (CI gate) |
| Secret scanning: `github_run_secret_scanning` on PR       | Must           |

---

### 5. Usability

#### NFR-U-01 — Accessibility

| Requirement                                                                                                  | Target | Verification                         |
| ------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------ |
| WCAG 2.1 AA: color contrast ≥4.5:1, keyboard navigation, screen-reader labels on filters/search              | Must   | Lighthouse a11y ≥90; manual axe-core |
| Form validation messages via zod surfaced inline; no raw zod dump                                            | Must   | Component tests                      |
| Dark/light theme preserved in `localStorage` with inline anti-CLS script; `prefers-reduced-motion` respected | Should | `src/lib/theme.tsx` + `layout.tsx`   |

#### NFR-U-02 — UX & Content

| Requirement                                                                         | Target                                 |
| ----------------------------------------------------------------------------------- | -------------------------------------- |
| Booking request completable in <90s (discovery → submit)                            | Should — measured via analytics funnel |
| Empty states with role-appropriate CTA ("Browse artists" vs "Claim a profile")      | Must                                   |
| Currency displayed via `formatRM(sen)` `src/lib/utils.ts` as `RM X.XX` consistently | Must                                   |
| 404 pages return true 404 (not 200 shell)                                           | Must — no root `loading.tsx`           |

#### NFR-U-03 — Internationalization

| Requirement                                               | Target                     |
| --------------------------------------------------------- | -------------------------- |
| Date/times `en-MY` locale (`toLocaleDateString("en-MY")`) | Must — `formatDate` helper |
| Currency MYR only; English only at launch                 | Accept — i18n deferred     |

---

### 6. Maintainability & Supportability

#### NFR-M-01 — Code Quality

| Requirement                                                | Fit-criterion           |
| ---------------------------------------------------------- | ----------------------- |
| TypeScript `tsc --noEmit` 0 errors (`npm run typecheck`)   | Must (CI gate)          |
| Prettier formatted (`npm run format:check`)                | Must (CI gate)          |
| Coverage ≥80% (`npm run test:coverage` HTML)               | Must (quality-gate.yml) |
| `vitest` suite green; `playwright` e2e green on `chromium` | Must (CI + `ci.yml`)    |

#### NFR-M-02 — Modularity & Documentation

| Requirement                                                                                                                                          | Fit-criterion                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Money logic isolated to 4 modules only: `settings.ts`, `payments.ts`, `payouts.ts`, `quotations.ts` — route handlers must not compute amounts inline | Should — enforced by code review |
| Catalog source of truth clearly documented: `src/lib/data.ts` is **seed-only**, never runtime; runtime is `src/server/catalog.ts`                    | Must — AGENTS.md §1              |
| Absolute imports `@/` enforced                                                                                                                       | Should — `tsconfig paths`        |

#### NFR-M-03 — Operability

| Requirement                                                                                | Fit-criterion |
| ------------------------------------------------------------------------------------------ | ------------- |
| `LOG_LEVEL` env governs `pino` verbosity; JSON lines in prod, pretty in dev                | Must          |
| `reportError(err, ctx)` always logs structurally and optionally forwards to Sentry/webhook | Must          |
| PG & SQLite schemas kept in sync; `detectSchemaDrift()` warns on divergence                | Should        |
| `npm run db:migrate` idempotent and also backfills additive columns (e.g. `payments.type`) | Must          |

---

### 7. Portability & Compatibility

| Requirement                                                                                                                 | Target | Verification                   |
| --------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------ |
| Node ≥22 required (for `node:sqlite`) — `engines.node` in `package.json`                                                    | Must   | `npm install` warns below 22   |
| Runs on Vercel serverless (primary) and Docker `node:20-alpine` `standalone`                                                | Must   | `Dockerfile` multi-stage build |
| Browsers: last 2 evergreen; mobile-first responsive (<640px works)                                                          | Must   | Manual device matrix           |
| Env portability: same `.env.example` works for local (SQLite) and prod (PG) — behavior switches via `DATABASE_URL` presence | Must   | `isPostgres()` check           |

---

### 8. Compliance (Cross-Cut)

| Area              | NFR                                                                                                        | Fit-criterion                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **PDPA**          | Consent recorded (`consent` + `consent_timestamp`), exportable, deletable                                  | Must — see `docs/PDPA_RETENTION_GUIDELINES.md` |
| **Financial**     | Settlements auditable for ≥7 years (payments/payouts/quotations) even after user deletion (anonymized log) | Should                                         |
| **Privacy**       | No PII in logs (user names/emails redacted; IDs only)                                                      | Must                                           |
| **Accessibility** | PDPA/Human rights — data never exposed to wrong user (scope queries)                                       | Must                                           |

---

### 9. Operations & Observability

#### NFR-O-01 — Logging

| Requirement                                                                 | Fit-criterion |
| --------------------------------------------------------------------------- | ------------- |
| `logger` (`pino` 10.3) JSON in prod, pretty via `pino-pretty` in dev        | Must          |
| `LOG_WEBHOOK_URL` forwards JSON batch: 20 lines / 50ms debounce             | Should        |
| Every request logs route + userId (hashed if sensitive) + duration on error | Should        |

#### NFR-O-02 — Monitoring & Alerting

| Requirement                                                                        | Fit-criterion                                             |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Sentry envelope POST when `SENTRY_DSN` set, else `ERROR_WEBHOOK_URL` POST fallback | Should — `src/server/errors.ts`                           |
| Agnost events for business funnel (register/login/booking/quotation/payment)       | Should — dashboard `3e27e121-654d-4746-ba55-7996f21bb351` |
| `GET /api/health` polled by Docker + UptimeRobot (1m interval)                     | Must                                                      |

#### NFR-O-03 — Deployment

| Requirement                                                                                                          | Fit-criterion                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run build` succeeds with no errors (sets `NODE_ENV=production`)                                                 | Must — CI includes `ci.yml` build step                       |
| `npm run env:check` (production mode) reports missing `SESSION_SECRET`, `DATABASE_URL`, `POSTGRES_URL`, Billplz keys | Must — pre-deploy checklist AGENTS.md §Production Deployment |
| `npm run db:migrate` + `npm run db:seed-catalog` run successfully against target PG before first traffic             | Must                                                         |

---

### 10. Constraints & Assumptions (NFR View)

Inherited from SRS §2.5/2.6. Additional NFR constraints:

- Client `NEXT_PUBLIC_*` vars are the only ones exposed to browser; no secret may be `NEXT_PUBLIC_` — enforced by review.
- Images must come from `*.supabase.co` (locked `images.remotePatterns`) — no arbitrary external domain.
- No background job runtime in serverless — must use stateless cron routes (`src/app/api/cron/*`) with `CRON_SECRET` guard.

---

### 11. Verification Matrix (Sampling)

| NFR ID  | Method          | Tool                                       | Pass Criterion                                    |
| ------- | --------------- | ------------------------------------------ | ------------------------------------------------- |
| P-01    | Load test       | k6, Vercel analytics                       | p95 ≤ target                                      |
| P-04    | Config audit    | Code review                                | `PG_MAX`, `idleTimeoutMillis`, WAL pragma present |
| S-03.03 | Unit / contract | Vitest `verifyBillplzSignature` suite; ZAP | 0 bypass cases                                    |
| S-04    | Header scan     | `curl -I` + CSP evaluator                  | All headers present, no `unsafe-inline`           |
| U-01    | Accessibility   | Lighthouse CI + axe                        | ≥90 a11y, 0 critical                              |
| M-01    | CI gate         | GitHub Actions `quality-gate.yml`          | All jobs green                                    |
| O-02    | Smoke           | `curl /api/health` + Sentry dashboard      | 200 + no unreported error                         |

---

### 12. Trade-offs & Rationale

| Decision                                              | Trade-off                                      | Rationale                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| PG-first + SQLite fallback                            | Drift risk vs zero local setup friction        | Chosen: drift detection + shared facade keeps both backends cheap; local DX wins               |
| HS256 symmetric vs RS256 asymmetric sessions          | Must share secret vs PKI rotation complexity   | HS256 sufficient single-service platform; rotation via `SESSION_SECRET` redeploy               |
| In-memory fallback for rate-limit when Upstash absent | Multi-instance inaccuracy vs deploy simplicity | Acceptable for preview/dev; prod sets Upstash                                                  |
| pino batch webhook vs structured OTel                 | Simpler vs richer traces                       | Chose webhook forwarding to allow DataDog/ELK without SDK lock-in                              |
| `force-dynamic` for catalog vs ISR revalidation       | Always-fresh vs CDN cache hits                 | Freshness wins for admin edits; public catalog still benefits from `s-maxage=300` on API layer |

---

_Next: `05-Use-Cases-and-User-Stories.md` maps these NFRs to user-visible scenarios with step-by-step flows._
