# SRS — Software Requirements Specification
## Leish! v2 — Beauty Booking Marketplace

| Field | Value |
|-------|-------|
| **Document ID** | LEISH-SRS-v2.0 |
| **Version** | 2.0.0 |
| **Status** | Baseline |
| **Date** | 2026-08-29 |
| **Complies With** | IEEE Std 830-1998 (SRS) |
| **Predecessor** | BRS (01) |
| **Successor** | FRS (03), NFR (04) |
| **Repo** | `src/` (Next.js 16 App Router, React 19, TypeScript) |

---

### Table of Contents
1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [System Features (Summary)](#3-system-features-summary)
4. [External Interface Requirements](#4-external-interface-requirements)
5. [System Features — Detailed (SRS-F)](#5-system-features--detailed-srs-f)
6. [Data Requirements](#6-data-requirements)
7. [Other Requirements](#7-other-requirements)
8. [Verification & Validation](#8-verification--validation)
9. [Appendices](#9-appendices)

---

### 1. Introduction

#### 1.1 Purpose
This SRS translates the business requirements (BRS `01`) into verifiable *software* requirements. Its audience is architects, developers, QA, and auditors. It is the single reference for what the system **shall** do, under what constraints, and how compliance will be shown.

#### 1.2 Scope
The system is **Leish! v2** — a web platform (`leish_v2`) that provides:

- Public catalog (artists/studios) with faceted discovery.
- Authenticated booking request → quotation → two-step payment → completion → review.
- Real-time per-booking messaging.
- Admin operations with audit trail and platform settings.
- Transactional email and observability.

**Out of scope** is listed in BRS §4.2 and restated in §2.5 below.

#### 1.3 Definitions, Acronyms, Abbreviations

| Term | Meaning |
|------|---------|
| **MUA** | Makeup Artist |
| **MYR/sen** | Ringgit; amounts stored as integer sen (1 MYR = 100 sen) |
| **Billplz** | Malaysian payment gateway (Billplz API v3) |
| **DFA** | DbFacade (`src/server/db.ts`) — PG or SQLite behind same async API |
| **JWT/JTI** | JSON Web Token / JWT ID (revocation key) |
| **SSE** | Server-Sent Events (chat live stream) |
| **PDPA** | Malaysia Personal Data Protection Act 2010 |
| **RQ** | Requirement |

See full glossary in `docs/09-Glossary.md`.

#### 1.4 References

- BRS `01-BRS-Business-Requirements-Specification.md`
- `AGENTS.md` (project conventions), `docs/ARCHITECTURE.md`, `docs/PDPA_RETENTION_GUIDELINES.md`
- Source of truth code: `src/server/db.ts`, `src/server/session.ts`, `src/server/bookings.ts`, `src/server/payments.ts`, `src/server/payouts.ts`, `src/server/quotations.ts`, `src/server/catalog.ts`, `src/server/validation.ts`
- Standards: IEEE 830, OWASP ASVS L2, WCAG 2.1 AA

#### 1.5 Overview
§2 gives the product context; §3 summarizes features; §4 defines interfaces; §5 decomposes each feature into verifiable SRS requirements with IDs; §6 details data; §7 covers adoption; §8 maps verification.

Conformance language: **shall** = mandatory, **should** = recommended, **may** = optional.

---

### 2. Overall Description

#### 2.1 Product Perspective

```
                         ┌─────────────────────────────────┐
                         │          Client (Browser)        │
                         │  Next.js 16 App Router · React 19│
                         │  Tailwind 4 · useAuth · Theme   │
                         └────────┬────────────────────────┘
                                  │ HTTPS
                         ┌────────▼────────────────────────┐
                         │     Vercel Edge / Node          │
                         │  API Routes (src/app/api/*)     │
                         │  Middleware auth (proxy.ts)     │
                         │  Headers: CSP nonce, HSTS, etc  │
                         └────────┬────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
     ┌────────▼─────┐   ┌────────▼─────┐   ┌────────▼─────┐
     │  DbFacade    │   │   Billplz    │   │  Email (Resend│
     │  PG/SQLite   │   │   API v3     │   │  Postmark/Brevo│
     │  src/server/ │   │  Webhook HMAC│   │  / dev outbox)│
     │  db.ts       │   └──────────────┘   └──────────────┘
     └──────┬───────┘            │
            │              ┌─────▼─────┐
            │              │ Supabase  │ (storage/images only;
            │              │ Storage   │  not primary DB)
            │              └───────────┘
     ┌──────▼───────┐
     │ Observability│ pino → LOG_WEBHOOK_URL / Sentry / Agnost
     └──────────────┘
```

- **Single persistence**: `getDb()` facade (`src/server/db.ts:828`). `isPostgres()` switches between `pg.Pool` (production) and `node:sqlite DatabaseSync` (dev/tests). Schema is defined once per backend (`PG_SCHEMA`/`SQLITE_SCHEMA`) and kept in sync by `extractSchemaTables()` drift detection.
- **Stateless auth**: HS256 JWT (`jose`) signed with `SESSION_SECRET`, stored in `leish_session` httpOnly cookie, `SameSite=lax`, `Secure` in prod, 7-day TTL, JTI revocation table `sessions`.
- **Deployment**: Vercel preferred; Docker `standalone` output also supported; health at `GET /api/health`.

#### 2.2 Product Functions (Summary)

1. Catalog browsing & search (guests and authed users).
2. Account lifecycle (register, login, verify, reset, consent).
3. Booking lifecycle with slot locking.
4. Quotation authoring & expiry.
5. Hybrid payments (deposit + balance) via Billplz/dev.
6. Payout & commission settlement.
7. Reviews (gated, atomic).
8. Real-time chat.
9. Admin CRUD + audit + settings.
10. Notifications, logging, analytics.

FRS (`03`) expands each function into `FR-xxx` with acceptance criteria.

#### 2.3 User Classes and Characteristics

| Class | Count (Launch) | Technical Skill | Frequency | Privileges |
|-------|----------------|-----------------|-----------|------------|
| Guest | Unbounded | Low | Occasional | Read catalog, register |
| Customer | ~500 | Low | 1–4/yr | Book, pay, chat, review, export/delete |
| Artist | ~10–30 | Low–Med | Daily (dashboard) | Claim profile, manage bookings, quote, complete |
| Studio | ~4–10 | Med | Daily | Same as artist (studio_id scoping) |
| Admin | 2–5 | High | Daily | Full CRUD + audit + settings + payouts |
| Cron/System | — | — | Scheduled | Sweep expired quotes, email retries |

Accessibility: WCAG 2.1 AA, responsive (mobile-first), dark/light theme persisted in `localStorage` (`src/lib/theme.tsx`).

#### 2.4 Operating Environment

| Layer | Requirement |
|-------|-------------|
| **Runtime** | Node ≥22 (for `node:sqlite`), Next.js 16.3.1, React 19.2.8 |
| **Hosting** | Vercel (primary) or Docker `node:20-alpine` with `output:"standalone"` |
| **DB — Prod** | PostgreSQL (Neon/Supabase pooler) via `DATABASE_URL` |
| **DB — Dev/Test** | `node:sqlite` (`LEISH_DB_PATH` or `:memory:`) |
| **Browsers** | Evergreen Chrome/Firefox/Safari/Edge (last 2 versions) |
| **Env** | `.env.local` (prod), `.env.example` template; `src/env.ts` validates `SESSION_SECRET` in prod |

#### 2.5 Design and Implementation Constraints

- Shall use **Next.js App Router** (no Pages Router).
- Shall not commit secrets — use Vercel/CI secrets; `SESSION_SECRET` must be 32 random bytes base64 (`openssl rand -base64 32`).
- Shall keep `PG_SCHEMA` and `SQLITE_SCHEMA` in sync (drift warning via `detectSchemaDrift()`).
- Shall never store money as float — `INTEGER sen` only.
- Shall not trust client-sent amounts — server computes `bookings.price` and `quotations.total`.
- Root `loading.tsx` is **forbidden** (breaks `notFound()` 404 semantics — see AGENTS.md §11).
- Absolute imports use `@/` alias to `./src/`.

#### 2.6 Assumptions and Dependencies

See BRS §10.2/10.3. Additions:

- Assumes `jose` 6.2.8, `pg` 8.23.0, `pino` 10.3.1 remain compatible.
- Depends on Billplz collection setup (`BILLPLZ_COLLECTION_ID`) before live payments.
- Depends on Supabase project for image hosting; graceful fallback to `/images/*` placeholders if unavailable.

---

### 3. System Features (Summary)

| Feature ID | Feature | Priority | BRS Trace |
|------------|---------|----------|-----------|
| F-01 | Authentication & Session | Must | BR-06..BR-10 |
| F-02 | Catalog (Artists/Studios) | Must | BR-01..BR-05 |
| F-03 | Booking Management | Must | BR-11..BR-13, BR-15 |
| F-04 | Quotations | Must | BR-14..BR-15 |
| F-05 | Payments (Hybrid) | Must | BR-16..BR-19, BR-22 |
| F-06 | Payouts & Commission | Must | BR-20..BR-21 |
| F-07 | Reviews & Ratings | Must | BR-04..BR-05 |
| F-08 | Messaging (Chat) | Must | BR-23 |
| F-09 | Artist/Studio Profile Claim | Must | BRL-11 |
| F-10 | Admin Panel & Audit | Must | BR-26..BR-29 |
| F-11 | Email & Notifications | Must | BR-24..BR-25 |
| F-12 | Observability & Analytics | Should | BR-30..BR-32 |
| F-13 | Compliance (PDPA) | Must | BR-10, BRL-13 |

---

### 4. External Interface Requirements

#### 4.1 User Interfaces

- **Design system**: Tailwind 4, CSS variables `--leish-header-from/to` (`#c9284b` family), `ThemeProvider` dark-by-default with inline anti-CLS script in `layout.tsx`.
- **Pages** (`src/app/`): `/`, `/artists`, `/artists/[slug]`, `/artists/[slug]/book`, `/studios`, `/studios/[slug]`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/onboarding`, `/dashboard`, `/booking`, `/contact`, `/help`, `/privacy`, `/terms`, `/dev/emails` (dev only), `/admin/*`.
- **Components** (`src/components/`): `Navbar`, `Footer`, `Button`, `ArtistCard`, `StudioCard`, `RatingStars`, `Logo`, `AdminShell`, `StatCard`, `Badge`, `TurnstileWidget`.
- **Accessibility**: Keyboard navigation, focus-visible outlines, aria labels on filters/search, color contrast ≥4.5:1, `prefer-reduced-motion` respected.
- **Constraints**: No root `loading.tsx`; Suspense boundaries scoped to segments that don't call `notFound()`.

#### 4.2 Hardware Interfaces

None beyond standard web client/server. Server requires PG or local disk for SQLite (`data/leish.db`, WAL mode, `foreign_keys=ON`).

#### 4.3 Software Interfaces

| Interface | Protocol | Module | Env Vars |
|-----------|----------|--------|----------|
| **PostgreSQL** | `pg` Pool over TLS | `src/server/db.ts` | `DATABASE_URL`, `PG_MAX`, `PG_CONNECTION_TIMEOUT_MS`, `PG_IDLE_TIMEOUT_MS` |
| **SQLite** | `node:sqlite` DatabaseSync | `src/server/db.ts` | `LEISH_DB_PATH` |
| **Billplz API v3** | HTTPS POST `application/x-www-form-urlencoded`, Basic Auth | `src/server/payments.ts`, `src/lib/payments/billplz.ts` | `BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, `BILLPLZ_BASE_URL`, `BILLPLZ_X_SIGNATURE_KEY`, `BILLPLZ_CALLBACK_URL` |
| **Billplz Webhook** | HTTPS POST raw body, `X-Billplz-Signature` HMAC-SHA256 hex | `src/app/api/payments/webhook/route.ts` | same |
| **Email — Resend** | HTTPS JSON | `src/server/email.ts` | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` |
| **Email — Postmark** | HTTPS JSON | `src/server/email.ts` | `EMAIL_PROVIDER=postmark`, `POSTMARK_SERVER_TOKEN` |
| **Email — Brevo** | HTTPS JSON | `src/server/email.ts` | `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY` |
| **Supabase Storage** | HTTPS (images) | `src/lib/supabase/*`, `next.config.ts images.remotePatterns` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Upstash Redis** | REST | `src/server/rate-limit.ts` | `UPSTASH_REST_URL`, `UPSTASH_REST_TOKEN` |
| **Turnstile** | Widget + server verify | `src/components/TurnstileWidget`, `src/lib/turnstile-token.ts` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| **Agnost AI** | SDK + client track | `src/server/agnost.ts`, `src/lib/agnost-client.ts`, `src/instrumentation.ts` | `AGNOST_ORG_ID`, `NEXT_PUBLIC_AGNOST_ORG_ID` |
| **Vercel Blob / S3** | HTTPS | `src/app/api/upload/*` | `BLOB_READ_WRITE_TOKEN`, AWS S3 vars |

#### 4.4 Communications Interfaces

- **HTTP** only (HTTPS in prod). `Strict-Transport-Security` set via `next.config.ts`.
- **Security headers** (`next.config.ts`): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP with per-request nonce (no `unsafe-inline` for scripts except theme toggle).
- **Email**: via provider abstraction; outbox at `email_outbox` when `EMAIL_PROVIDER=dev`.
- **Chat SSE**: `GET /api/bookings/[id]/messages/stream` — `text/event-stream`, replay + live.
- **Health**: `GET /api/health` → 200 JSON.

---

### 5. System Features — Detailed (SRS-F)

*Each feature lists its SRS requirements. Full functional decomposition with acceptance criteria lives in FRS (`03`).*

#### 5.1 SRS-F-01 — Authentication & Session

| ID | Requirement (shall) | Verification |
|----|---------------------|--------------|
| SRS-F-01-01 | Provide registration with fields `name` (2–80 chars), `email` (RFC), `password` (8–128 chars, scrypt + optional `PEPPER_SECRET` HMAC), `role` in (`customer`,`artist`,`studio`), `consent` boolean + timestamp. | Unit (`src/server/validation.ts` `registerSchema`); e2e `register→login` |
| SRS-F-01-02 | Hash passwords with `scrypt` (salted, timing-safe compare); support `PEPPER_SECRET` pepper rotation via `PEPPER_VERSION`. | Auth tests; `src/server/auth.ts` |
| SRS-F-01-03 | Issue HS256 JWT via `jose`, secret `SESSION_SECRET` (32-byte base64), payload includes `sub`, `role`, `jti`, `exp = now+7d`; set `leish_session` cookie httpOnly, `SameSite=lax`, `Secure` in prod. | `src/server/session.ts` `createSessionToken` |
| SRS-F-01-04 | Validate JWT on every authed route; check `sessions` table: `revoked=1` wins; missing JTI falls back to signature+expiry (fail-open, logged). | `verifySessionToken` tests |
| SRS-F-01-05 | Revoke JTI on logout (`UPDATE sessions SET revoked=1 WHERE jti=?`). | `revokeSession` tests |
| SRS-F-01-06 | Send single-use email verification link (token hashed sha256 at rest, configurable TTL), banner until `email_verified`; gate payments until verified. | `src/server/email-verification.ts`; `GET /api/auth/verify-email` |
| SRS-F-01-07 | Provide forgot/reset password: single-use `password_resets` rows (hashed token, 1h expiry), rate-limited, no user enumeration (always 200-ish). | `src/app/api/auth/forgot-password/*` |
| SRS-F-01-08 | Rate-limit auth endpoints (register/login/forgot/verify) with sliding window (Upstash or in-memory). Return 429 + `Retry-After`. | `src/server/rate-limit.ts` |

#### 5.2 SRS-F-02 — Catalog

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-02-01 | Store artists/studios in DB tables `artists`/`studios` (seeded from `src/lib/data.ts` via `src/server/catalog-seed.ts` idempotently; slugs == legacy ids). | `ensureCatalogSeeded()`; `npm run db:seed-catalog` |
| SRS-F-02-02 | Provide repository `listArtists(filters)`: SQL pre-filter `state/area/budget` (indexed), then `filterArtists()` for `query`/tags/date; `listAllArtists({limit,offset})` capped 500. | `src/server/catalog.ts` |
| SRS-F-02-03 | Provide `getArtistById`, `getArtistBySlug`, `resolveArtist(idOrSlug)` (slug-first), same for studios. | Catalog tests |
| SRS-F-02-04 | Validate discovery query via `artistsQuerySchema` (`MALAYSIA_STATES`, `BRIDAL_EVENTS`, `NON_BRIDAL_EVENTS`); support `state → area` cascading ( `AREAS_BY_STATE`). | `src/server/validation.ts` |
| SRS-F-02-05 | Allow admin direct column edits and artist self-service `PATCH /api/artist-profiles` (whitelisted fields only). | `updateArtist`/`updateStudio` field maps |
| SRS-F-02-06 | Public catalog routes set `s-maxage=300`; catalog pages are `force-dynamic` so edits surface without redeploy. | `src/app/artists/page.tsx` dynamic flag |

#### 5.3 SRS-F-03 — Booking Management

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-03-01 | Create booking via `POST /api/bookings` — zod `bookingSchema`; server resolves `price` from `artist.services.find(name)` — client price ignored. | Booking tests; `src/app/api/bookings/route.ts` |
| SRS-F-03-02 | Record `event_type`, `venue`, `guest_count`, `notes`, `date` (ISO ≥ today), `time` string; initial `status='requested'`. | Schema + `bookings` table |
| SRS-F-03-03 | Enforce slot uniqueness: partial unique index `uq_bookings_slot ON (artist_id,date,time) WHERE status IN (requested,accepted,confirmed)`; friendly 409 on conflict (pre-check + race guard). | DB schema + booking route catch `UNIQUE` |
| SRS-F-03-04 | Implement state machine `applyBookingTransition(current, action, {isOwner,role})` with rules per `src/server/bookings.ts:1`. Payment-only transition `confirmOnFeePaid`. | State machine unit tests |
| SRS-F-03-05 | Expose `PATCH /api/bookings/[id]` for `accept/reject/complete/cancel`; authz: `accept/reject/complete` requires claimed `artist`/`studio`; `cancel` requires `isOwner` or artist. | Route tests |
| SRS-F-03-06 | Serialize bookings with derived `quotation`, `totalPrice`, `balanceDueDate` (T-3d), `balanceAmount = total - bookingFeeSen`, `payment` + `balancePayment`. | `serializeBooking()` |

#### 5.4 SRS-F-04 — Quotations

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-04-01 | Allow claimed artist to `POST /api/bookings/[id]/quotation` with `baseFee, travelFee, earlyCallFee, accommodationFee, extras[≤10], artistNote` validated via `quotationSchema`. | `src/server/validation.ts` |
| SRS-F-04-02 | Compute total server-side: `quotationTotal()` = sum of all line items (sen). | Unit test |
| SRS-F-04-03 | Set `status='pending'`, `expires_at = now + 24h` (`QUOTATION_TTL_MS`); supersede previous pending (`superseded`). | `createQuotation()` |
| SRS-F-04-04 | Lazily expire on read and via sweep: `isQuotationExpired()`, `findExpiredQuotations()`, `markQuotationExpired()`. | `src/server/quotations.ts` |
| SRS-F-04-05 | Return 404 for already-expired quotations in booking serialization (`totalPrice → null` when expired). | `serializeBooking()` |

#### 5.5 SRS-F-05 — Payments

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-05-01 | Provide hybrid payments: `payments.type IN ('deposit','balance')`, `UNIQUE(booking_id,type)`, `payments.status IN (required,paid,failed,refunded)`. | Schema + `src/server/payments.ts` |
| SRS-F-05-02 | Create Billplz bill when `BILLPLZ_API_KEY`+`COLLECTION_ID` set, else `dev` payment row; body uses `amount` sen, `collection_id`, payer name/email from booking owner, `callback_url`, `redirect_url`, `reference_1=bookingId`. | `createBookingPayment()` |
| SRS-F-05-03 | Expose `POST /api/bookings/[id]/pay-fee` (deposit, `getBookingFeeSen()`) and `POST /api/bookings/[id]/pay-balance` (quotation total − deposit); both authed, verified-email gated, dev auto-settles synchronously for e2e. | `pay-fee`/`pay-balance` routes |
| SRS-F-05-04 | Handle webhook `POST /api/payments/webhook` — verify `X-Billplz-Signature` HMAC-SHA256 of raw body with `BILLPLZ_API_KEY` (timing-safe, hex64 check) before any state change. | `verifyBillplzSignature()` |
| SRS-F-05-05 | Route settlement by type: `deposit → confirmOnFeePaid` then `UPDATE bookings SET status='confirmed'`; `balance → UPDATE quotations SET status='paid'` + `createPayoutForBooking`; idempotent. | `handlePaymentPaid()` |
| SRS-F-05-06 | Allow refund of **balance only** on cancelled bookings when `status='paid'`; `dev` marks refunded, `billplz` calls `POST /bills/{id}/refund`; deposit never refunded. | `refundBalancePayment()` |

#### 5.6 SRS-F-06 — Payouts & Commission

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-06-01 | Store platform settings `platform_settings(key,value)` for `booking_fee_sen`, `commission_rate_bps` (0–5000 clamp), `commission_waiver_sen`; cached 30s. | `src/server/settings.ts` |
| SRS-F-06-02 | Compute commission via `computeCommission(totalSen, rateBps, waiverSen)` — waived when `total < waiver`; `commission = round(total*rate/10000)`. | Unit tests |
| SRS-F-06-03 | On balance paid, create `payouts` row: `gross=total`, `commission`, `net = max(0, (total - commission) - deposit)`, `settleable_at = eventDate+24h`, `status='pending'`; idempotent per `booking_id`. | `createPayoutForBooking()` |
| SRS-F-06-04 | Provide `listPayouts(status?)` joined with bookings, and `updatePayoutStatus(id, settled|failed, notes)` with `settled_at` when applicable; admin-only. | `src/server/payouts.ts` + `GET/PATCH /api/admin/payouts` |

#### 5.7 SRS-F-07 — Reviews & Ratings

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-07-01 | Allow adding review via `addEntityReview({entityType,entityId,bookingId,userId,authorName,rating 1-5,event,text})`; guard `ALREADY_REVIEWED` when `booking_id` duplicate. | `src/server/catalog.ts` reviews section |
| SRS-F-07-02 | Gate eligibility: `findReviewableBooking(userId, artistId)` returns most recent `status='completed'` booking left-joined against `reviews` (null → not yet reviewed). Studios not yet reviewable (returns null). | Query test |
| SRS-F-07-03 | Blend rating atomically: `UPDATE artists SET review_count=review_count+1, rating=ROUND(((rating*review_count)+:rating)/(review_count+1),2)` — single statement, no read-modify-write. | `blendAggregate()` |

#### 5.8 SRS-F-08 — Messaging

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-08-01 | Store `messages(id, booking_id FK, sender_id FK, body, created_at)` per-booking. | Schema |
| SRS-F-08-02 | Expose `GET/POST /api/bookings/[id]/messages` (participants only) and `GET .../messages/stream` SSE (replay history then live via `src/server/chat-bus.ts`). | Route + e2e |

#### 5.9 SRS-F-09 — Profile Claim

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-09-01 | Provide `artist_profiles(user_id PK, artist_id UNIQUE, claimed_at)` and `studio_profiles` — one claim per account. | Schema + `uq_*_profiles_*` indexes |
| SRS-F-09-02 | Expose `GET /api/artist-profiles` (own profile or null), `POST /api/artist-profiles {artistId}` (scopes bookings), `PATCH /api/artist-profiles` (whitelisted self-edits). | `src/server/artist-profiles.ts` |

#### 5.10 SRS-F-10 — Admin Panel & Audit

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-10-01 | Guard all `src/app/api/admin/*` via `requireAdmin(request)` (401 anonymous, 403 non-admin). | `src/server/admin-auth.ts` |
| SRS-F-10-02 | Guard `/admin/*` layout server-side redirect for non-admins. | `src/app/admin/layout.tsx` |
| SRS-F-10-03 | Provide admin APIs: `GET /api/admin` dashboard aggregates, `/api/admin/users` CRUD, `/api/admin/artists`, `/api/admin/studios`, `/api/admin/bookings`, `/api/admin/payments`, `/api/admin/payouts`, `/api/admin/quotations`, `/api/admin/messages`, `/api/admin/emails`, `/api/admin/audit`, `/api/admin/settings`, `/api/admin/analytics`. | `src/app/api/admin/route.ts` listing test |
| SRS-F-10-04 | Log every admin mutation to `admin_audit_log(id, admin_user_id FK, action, target_table, target_id, details JSON, created_at)` via `logAdminAction()`. | Audit table + tests |
| SRS-F-10-05 | Allow seeding first admin idempotently: `ADMIN_EMAIL/ADMIN_PASSWORD npx tsx scripts/seed-admin.ts` upgrades existing users. | `scripts/seed-admin.ts` |

#### 5.11 SRS-F-11 — Email & Notifications

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-11-01 | Abstract `sendEmail()` over `EMAIL_PROVIDER=dev|resend|postmark|brevo`; missing creds fall back to dev outbox with warning (never silent). | `src/server/email.ts` |
| SRS-F-11-02 | Compose booking emails in `src/server/booking-emails.ts` (created, quotation, balance reminder, status). | Module |
| SRS-F-11-03 | Store `email_outbox` (dev), `email_preferences` per user (flags per event), `email_retries` (attempts ≤3, `next_retry`). | Schema |
| SRS-F-11-04 | Expose `/dev/emails` viewer (dev only) and `/api/email/preferences` toggle. | Routes |

#### 5.12 SRS-F-12 — Observability & Analytics

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-12-01 | Log with `pino` (`src/server/logger.ts`): JSON in prod, pretty in dev; `LOG_LEVEL` override; forward batches (20 lines / 50ms debounce) to `LOG_WEBHOOK_URL`. | Logger tests |
| SRS-F-12-02 | Report errors via `reportError(err, context)` → pino + Sentry envelope if `SENTRY_DSN` else `ERROR_WEBHOOK_URL`. | `src/server/errors.ts` |
| SRS-F-12-03 | Instrument with Agnost AI (`src/instrumentation.ts` `agnostai` init): `agnost.begin({userId, agentName, input}) → interaction.end(output, success)` on register/login/booking/quotation/payment/profile-edit. Client: `trackEvent/trackArtistView/trackSearch/trackBookingForm` (`src/lib/agnost-client.ts`). | Agnost dashboard `3e27e121-654d-4746-ba55-7996f21bb351` |

#### 5.13 SRS-F-13 — Compliance

| ID | Requirement | Verification |
|----|-------------|--------------|
| SRS-F-13-01 | Implement `GET /api/me/export` (own data JSON) and `DELETE /api/me?confirm=1` (cascade delete via FKs). | `src/app/api/me/*` |
| SRS-F-13-02 | Serve `/privacy` and `/terms` with templates from `docs/legal/*`. | Pages |
| SRS-F-13-03 | Health check `GET /api/health` returns DB + env status. | `src/app/api/health/*` + Docker `HEALTHCHECK` |

---

### 6. Data Requirements

#### 6.1 Logical Data Model (Summary)

See dedicated `docs/06-Data-Model-and-ERD.md` for full DDL, ER diagram, and field dictionaries. Summary here:

| Entity Group | Tables | PK/FK | Notes |
|--------------|--------|-------|-------|
| **Users** | `users` | PK `id` | role CHECK `customer|artist|studio|admin`; `consent+consent_timestamp`; scrypt password |
| **Catalog** | `artists`, `studios`, `reviews`, `referrals` | PK `id`, `slug` UNIQUE for catalog | `rating` float, `review_count`, JSON arrays (`specialties`, `services`, etc.) |
| **Claims** | `artist_profiles`, `studio_profiles` | PK `user_id`→`users`, UNIQUE on `artist_id`/`studio_id` | Scopes bookings per actor |
| **Booking** | `bookings` | PK `id`, FK `user_id`→users, partial UNIQUE slot index | `uq_bookings_slot` WHERE active statuses |
| **Quotation** | `quotations` | PK `id`, FK `booking_id`→bookings ON DELETE CASCADE | Fee columns sen, `extras` JSON |
| **Payments** | `payments`, `payouts`, `platform_settings` | `UNIQUE(booking_id,type)` for payments | `status` CHECKs; `computeCommission` drives payouts |
| **Comms** | `messages`, `email_outbox`, `email_preferences`, `email_retries`, `email_verifications`, `password_resets` | FKs to users/bookings | Preference flags per event |
| **Ops** | `sessions`, `admin_audit_log`, `catalog_overrides` (legacy), `platform_settings` | FKs | Audit FK to `users(id)`; tests must seed user row first |

All tables include `created_at` (ISO string); `updated_at` where mutation is expected. Money columns are `INTEGER` sen.

#### 6.2 Data Retention

Per `docs/PDPA_RETENTION_GUIDELINES.md`: users/bookings retained for audit period after account deletion where legal hold exists; otherwise cascade delete. Quotations/payments retained ≥7 years for financial audit (configurable).

#### 6.3 Data Integrity

- Foreign keys enforced (`PRAGMA foreign_keys=ON` for SQLite, real FKs for PG).
- Placeholder translation `?/@name → $n` tested in `src/server/db.ts` (`compilePlaceholders`, `resolveParams`).
- Drift detection warns when `PG_SCHEMA` and `SQLITE_SCHEMA` diverge.

---

### 7. Other Requirements

#### 7.1 Performance (Targets — see NFR doc for detail)

| Metric | Target |
|--------|--------|
| Catalog list (p50) | <250 ms (p95 <600 ms) via SQL pre-filter + index |
| Booking creation (p95) | <400 ms excluding email send (async) |
| Webhook handling (p95) | <300 ms |
| Image delivery | Next.js optimized, `*.supabase.co` via proxy, CDN |

#### 7.2 Safety & Security (Summary)

- Passwords: scrypt + pepper, never logged.
- Sessions: httpOnly, secure in prod, JTI revocation.
- Inputs: zod on every API boundary.
- Headers: CSP nonce, `DENY`, `nosniff`, `strict-origin-when-cross-origin`.
- Rate limiting: sliding window, 429.
- Audit: every admin mutation logged.

#### 7.3 Software System Attributes — Summary

Quality attributes are elaborated in `docs/04-NFR-Non-Functional-Requirements.md` (availability, maintainability, portability, etc.).

---

### 8. Verification & Validation

#### 8.1 Test Strategy

| Level | Tool | Location | Gate |
|-------|------|----------|------|
| **Unit** | Vitest (jsdom) | `src/**/*.test.{ts,tsx}` (exclude `src/lib/data.ts`) | All green |
| **Component** | Testing Library | `src/components/**/*.test.tsx` | Green |
| **Integration** | Vitest with `LEISH_DB_PATH=:memory:` SQLite | `src/server/**/*.test.ts`, API route tests | Green |
| **E2E** | Playwright (`chromium`) | `e2e/` | Green; browser installed via `playwright install --with-deps chromium` |
| **Contract** | Zod validation tests | `src/server/validation.test.ts` | Green |
| **Security** | ESLint, `npm audit`, rate-limit tests | CI | 0 warnings |
| **Quality Gate** | `quality-gate.yml`: lint, typecheck, test, coverage ≥80%, format | CI | Required per PR |
| **DB Dual Path** | `vitest.pg.config.mts` when `DATABASE_URL` set | CI `database.yml` when `db.ts|migrate.ts` changes | Green |

#### 8.2 Acceptance Tests (Trace to SRS)

| SRS-F | E2E / Test Scenario |
|-------|---------------------|
| F-01 | Register with role → receive verification banner → resend → verify → login → 7d session persists across refresh |
| F-02 | Browse `/artists` unauthenticated → filter state→area, bridal tag, budget, query → detail page resolves by slug |
| F-03 | Customer creates booking for future date → second concurrent request to same slot returns 409 → artist accepts |
| F-04 | Artist sends quotation → customer sees 24h countdown → expiry auto-marks + re-quote flow |
| F-05 | Customer pays deposit (dev → auto-confirm) → status `confirmed` → pays balance → payout created |
| F-07 | After `completed`, customer leaves review → second review for same booking rejected → rating rounded 2dp |
| F-08 | Chat SSE receives history + live messages; only participants can post |
| F-10 | Non-admin blocked from `/admin` + `/api/admin/*`; admin actions audited |
| F-11 | Verification email lands in `/dev/emails` when provider=dev |
| F-13 | Export returns owned data; delete removes account and cascades bookings |

---

### 9. Appendices

#### 9.1 Feasibility

Technical feasibility confirmed on Node 22 + pg 8.23 + jose 6.2.8 + pino 10.3. Tested locally via SQLite and in CI via PG. Billplz sandbox tested manually. No blocking unknowns.

#### 9.2 Future Enhancements (Backlog)

- Studio-native `studio_id` booking path (Option B already scaffolded in `bookings` table) with distinct commission tiers.
- Product catalog (`products` type/table `src/lib/types.ts:89`) with cart/checkout.
- Referral rewards (`referrals` table) activation and commission share.
- WhatsApp notifications, advanced search (Vectorize), promotions engine.

#### 9.3 Document Change History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-08-15 | Initial SRS — booking→fee single-path |
| 2.0 | 2026-08-29 | Hybrid deposit/balance, payouts, messaging, admin audit, Agnost |

---

*Next: `03-FRS-Functional-Requirements-Specification.md` details every FR with actor, pre/post conditions, flow, and acceptance criteria.*
