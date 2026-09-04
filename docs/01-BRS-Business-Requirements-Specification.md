# BRS — Business Requirements Specification

## Leish! v2 — Beauty Booking Marketplace (Malaysia)

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Document ID**    | LEISH-BRS-v2.0                               |
| **Version**        | 2.0.0                                        |
| **Status**         | Baseline (Approved)                          |
| **Date**           | 2026-08-29                                   |
| **Owner**          | Product & Engineering                        |
| **Classification** | Internal / Investor-Facing                   |
| **Related Docs**   | SRS (02), FRS (03), NFR (04), Use Cases (05) |

---

### Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Vision & Objectives](#2-business-vision--objectives)
3. [Stakeholders & Actors](#3-stakeholders--actors)
4. [Scope Definition](#4-scope-definition)
5. [Business Model & Monetization](#5-business-model--monetization)
6. [Business Requirements (BR-xxx)](#6-business-requirements-br-xxx)
7. [Business Rules (BRL-xxx)](#7-business-rules-brl-xxx)
8. [Key Business Processes & Journeys](#8-key-business-processes--journeys)
9. [Success Metrics & KPIs](#9-success-metrics--kpis)
10. [Constraints, Assumptions & Dependencies](#10-constraints-assumptions--dependencies)
11. [Compliance & Legal](#11-compliance--legal)
12. [Risks & Mitigations](#12-risks--mitigations)
13. [Roadmap & Release Strategy](#13-roadmap--release-strategy)
14. [Acceptance Criteria (Business Level)](#14-acceptance-criteria-business-level)
15. [Appendix](#15-appendix)

---

### 1. Executive Summary

Leish! v2 is a next-generation, mobile-first **beauty services marketplace** that connects **Clients (customers)** with **MUA (Makeup Artists)** and **Beauty Studios** across Malaysia, starting with the Klang Valley (KL + Selangor) as the launch corridor. v1 (`leish.my`) validated demand but incurred architectural debt (dual-DB, fragmented payments, no payout ledger). v2 is a **from-scratch rebuild on Next.js 16 + PostgreSQL** that solves for:

- **Trust**: verified-email gating at payment, reviews gated on completed bookings only, admin audit trail.
- **Money correctness**: hybrid deposit/balance model with server-authoritative pricing, HMAC-verified Billplz webhook, commission/payout ledger.
- **Operations**: admin can manage the full lifecycle without DB access (users, catalog, bookings, payouts, settings).
- **Compliance**: Malaysia PDPA 2010 consent, retention, export/delete.

The platform's **north-star metric** is _Completed Bookings per Month_ — every feature must move this metric or de-risk it.

---

### 2. Business Vision & Objectives

#### 2.1 Vision

> _Book beauty anywhere in Malaysia in under 90 seconds — with guaranteed slot integrity, transparent pricing, and artist-grade economics._

#### 2.2 Strategic Objectives

| ID    | Objective                         | Measurable Outcome                                                          | Horizon    |
| ----- | --------------------------------- | --------------------------------------------------------------------------- | ---------- |
| BO-01 | Own Klang Valley bridal discovery | ≥10 active MUAs, 500 MAU within 3 months of launch                          | Q4 2026    |
| BO-02 | Payment reliability               | ≥99.5% webhook-to-confirmation success, <5 min median                       | Q4 2026    |
| BO-03 | Artist retention                  | ≥70% of onboarded MUAs receive ≥2 bookings in first 60 days                 | H1 2027    |
| BO-04 | Unit economics                    | Take-rate 8–10% net after waivers, contribution margin positive by month 6  | H1 2027    |
| BO-05 | Compliance                        | PDPA consent audit 100%, no open critical vulnerabilities (Snyk/Dependabot) | Continuous |
| BO-06 | Platform extensibility            | Studio bookings, products, referrals live without re-architecture           | 2027       |

#### 2.3 Problem Statement (Why Rebuild)

| Pain (v1)                  | Impact                                | v2 Solution                                                                     |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| Supabase + Neon dual-write | Data drift, sync cron, on-call burden | Single `DATABASE_URL` (PG) + SQLite fallback facade `src/server/db.ts`          |
| Client-trusted pricing     | Under-charge risk                     | Server-derived `price`/`quotation.total` only (`src/server/quotations.ts`)      |
| Single payment type        | Cannot charge deposit + balance       | Hybrid `payments.type IN ('deposit','balance')` with UNIQUE `(booking_id,type)` |
| No payout ledger           | Manual spreadsheets                   | `payouts` table + `/admin/payouts` settle/fail                                  |
| Reviews un-gated           | Fake/social proof risk                | `reviews.booking_id UNIQUE` + `findReviewableBooking()` (COMPLETED only)        |
| No audit trail             | Ops risk                              | `admin_audit_log` on every admin mutation                                       |

---

### 3. Stakeholders & Actors

#### 3.1 Stakeholder Map

| Stakeholder                 | Interest                                | Power  | Engagement              |
| --------------------------- | --------------------------------------- | ------ | ----------------------- |
| Founders / Investors        | Revenue, growth, cost control           | High   | Steering, KPI review    |
| Clients (Customers)         | Fast booking, fair price, reliability   | High   | Discovery research, NPS |
| MUAs / Studios              | Lead flow, fair take-rate, payout speed | High   | Onboarding interviews   |
| Platform Ops / Admin        | Efficiency, fraud prevention            | Medium | Workflow design         |
| Billplz (payment processor) | Volume, compliance                      | Medium | Integration & SLA       |
| Regulators (PDPA, KPDN)     | Consumer protection                     | Medium | Legal review            |
| Engineering                 | Maintainability, velocity               | Medium | Architecture decisions  |

#### 3.2 System Actors (from `src/lib/types.ts:1`)

| Actor           | System Role                                                | Auth Requirement                         |
| --------------- | ---------------------------------------------------------- | ---------------------------------------- |
| **Guest**       | Unauthenticated visitor                                    | None                                     |
| **Customer**    | `customer` — books services                                | Email + verified for payment             |
| **Artist**      | `artist` — services a booking, claims `artist_profiles`    | Verified; must claim profile to see jobs |
| **Studio**      | `studio` — studio branch of artist (shares `artist` flows) | Same as artist                           |
| **Admin**       | `admin` — platform operator                                | `requireAdmin()` guard + audit log       |
| **System/Cron** | Internal                                                   | `CRON_SECRET`                            |

---

### 4. Scope Definition

#### 4.1 In Scope (v2 Launch)

1. **Catalog**: Artist & Studio discovery — search, filters (state→area, bridal/non-bridal, budget, date), detail pages, portfolio, reviews.
2. **Identity**: Register/Login/Logout, JWT session (`leish_session`, 7-day TTL, `src/server/session.ts`), email verification (single-use token), forgot/reset password, consent capture.
3. **Booking lifecycle**: `requested → accepted → confirmed → completed | cancelled` via `src/server/bookings.ts` state machine; slot uniqueness (`uq_bookings_slot` partial index).
4. **Quotations**: Line-item breakdown (base/travel/early-call/accommodation + up to 10 extras), 24h review window, re-quote supersede.
5. **Hybrid Payments**: Deposit (configurable `booking_fee_sen`, default RM 50) to accept; Balance (`total - deposit`) due 3 days before event; Billplz + `dev` fallback; HMAC webhook; refund (balance only, deposit non-refundable).
6. **Payouts & Commission**: `computeCommission()` (basis points + waiver threshold, e.g. 10% above RM100); payout `net = gross - commission - deposit`; settleable 24h post-event; admin settle/fail.
7. **Messaging**: Per-booking chat (`messages` table) + SSE live stream (`/api/bookings/[id]/messages/stream`).
8. **Reviews**: Post-completion, one per booking, atomic `blendAggregate` to rating.
9. **Admin Panel** (`/admin/*`): Users CRUD, Artists/Studios direct edits, Bookings override, Payments, Payouts, Quotations, Messages, Email Outbox, Audit Log, Settings (`platform_settings`).
10. **Notifications/Email**: `sendEmail()` abstraction (`dev|resend|postmark|brevo`), preferences per user, retry queue.
11. **Observability**: pino structured logs, `LOG_WEBHOOK_URL` forwarding, `reportError()` → Sentry/webhook.
12. **Compliance**: PDPA consent, data export (`/api/me/export`), account deletion (`DELETE /api/me`), retention guidelines.

#### 4.2 Out of Scope (v2 Launch) — Deferred

| Item                                                      | Rationale                                     | Target Release |
| --------------------------------------------------------- | --------------------------------------------- | -------------- |
| Studio as distinct provider with separate commission tier | Complexity; not needed for 10-MUA launch gate | v2.1           |
| Product/e-commerce (`products` table already scaffolded)  | Separate fulfillment flow                     | v2.2           |
| Loyalty / coupons                                         | Defer until repeat booking rate proven        | v2.2           |
| Mobile native apps                                        | PWA/mobile-web first                          | v2.3           |
| Multi-currency / i18n (BM)                                | MYR + English only at launch                  | Backlog        |

#### 4.3 Scope Boundaries (Explicit Non-Goals)

- The platform **does not** handle physical fulfillment, inventory, or shipping.
- The platform **does not** guarantee artist availability — it guarantees slot atomicity (unique partial index + friendly 409).
- Client-sent amounts are **never** trusted — all money math is server-authoritative.

---

### 5. Business Model & Monetization

#### 5.1 Revenue Model

```
Client pays:   quotation.total (e.g. RM 1,000)
               ├─ deposit  RM 50  (non-refundable, platform-kept, default booking_fee_sen)
               └─ balance  RM 950 (due T-3d)

Platform keeps: deposit + commission
                commission = total * rateBps / 10_000  unless total < waiverSen → 0
                e.g. total 100,000 sen * 1,000 bps / 10,000 = 10,000 sen (RM100)
                Platform keeps 5,000 + 10,000 = 15,000 sen

Artist receives: total - commission - deposit = 100,000 - 10,000 - 5,000 = 85,000 sen
                 settleable_at = eventDate + 24h  (dispute window)
```

- **Settings** are runtime-configurable via `platform_settings` (`booking_fee_sen`, `commission_rate_bps`, `commission_waiver_sen`) — see `src/server/settings.ts:1`.
- **Waiver** protects small bookings (< RM100 by default) from being economically non-viable for artists.

#### 5.2 Pricing Rules

- All amounts stored in **sen** (integer MYR cents) — no floating point for money.
- Quotations are the **sole** pricing authority; `bookings.price` is informational (catalog price of selected service at booking time).
- Client always pays **exactly** the quoted `total`; commission is artist-side.

#### 5.3 Take-Rate Guardrails

| Knob                    | Default        | Clamp           | Purpose                                           |
| ----------------------- | -------------- | --------------- | ------------------------------------------------- |
| `booking_fee_sen`       | 5,000 (RM50)   | ≥0              | Non-refundable slot commitment                    |
| `commission_rate_bps`   | 1,000 (10%)    | 0–5,000 (0–50%) | Typo-protection clamp in `getCommissionRateBps()` |
| `commission_waiver_sen` | 10,000 (RM100) | ≥0              | Small-booking protection                          |

#### 5.4 Cost Structure

| Cost                          | Driver                | Mitigation                                                  |
| ----------------------------- | --------------------- | ----------------------------------------------------------- |
| Billplz fees                  | Per-transaction       | Passed through or absorbed via commission                   |
| Email (Resend/Postmark/Brevo) | Per-send              | `dev` fallback, outbox batching                             |
| Hosting (Vercel + PG)         | Traffic + connections | `PG_MAX`, pool thresholds, `s-maxage=300` on public catalog |
| Support                       | Bookings volume       | Self-serve dashboard + chat reduces tickets                 |

---

### 6. Business Requirements (BR-xxx)

#### 6.1 Customer & Discovery

| ID    | Requirement                                                                                                    | Priority | Acceptance Hook                                          |
| ----- | -------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------- |
| BR-01 | As a Guest, I can discover artists/studios without logging in.                                                 | Must     | Catalog loads unauthenticated; CDN `s-maxage=300`.       |
| BR-02 | As a Customer, I can filter artists by state, area, bridal/non-bridal tags, budget, date, and free-text query. | Must     | `listArtists(filters)` + `artistsQuerySchema`.           |
| BR-03 | As a Visitor, I can view artist/studio detail (bio, services, portfolio, reviews, availability).               | Must     | `getArtistBySlug()` resolves both slug and legacy id.    |
| BR-04 | As a Customer, I can leave a review only after my booking is completed, once per booking.                      | Must     | `findReviewableBooking()` + `reviews.booking_id UNIQUE`. |
| BR-05 | As a Platform, ratings are blended atomically to prevent lost-update races.                                    | Must     | `blendAggregate()` single-statement UPDATE.              |

#### 6.2 Identity & Trust

| ID    | Requirement                                                                                  | Priority | Acceptance Hook                                                         |
| ----- | -------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| BR-06 | As a User, I can register with role choice (customer/artist/studio) and PDPA consent.        | Must     | `registerSchema`, `users.consent`.                                      |
| BR-07 | As a User, I must verify my email before payments become effective (trust gate).             | Must     | Verification token single-use, expiry; gate at `pay-fee`/`pay-balance`. |
| BR-08 | As a User, I can reset my password via a single-use, expiring link with no user enumeration. | Must     | `password_resets.token_hash` sha256, 1h expiry.                         |
| BR-09 | As a User, my session lasts 7 days and is revocable on logout.                               | Must     | `SESSION_TTL_SECONDS = 604800`, JTI `sessions.revoked`.                 |
| BR-10 | As a User, I can export my data and delete my account (PDPA).                                | Must     | `GET /api/me/export`, `DELETE /api/me?confirm=1`.                       |

#### 6.3 Booking & Quotations

| ID    | Requirement                                                                                                             | Priority | Acceptance Hook                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| BR-11 | As a Customer, I can submit a booking request with event details (type, venue, guests, notes).                          | Must     | `bookingSchema` with `eventType/venue/guestCount`.                |
| BR-12 | As a System, a slot (artist+date+time) can have only one active booking.                                                | Must     | `uq_bookings_slot` partial index + 409 friendly error.            |
| BR-13 | As an Artist, I can accept/reject a `requested` booking, or complete a `confirmed` one.                                 | Must     | `applyBookingTransition()` state machine.                         |
| BR-14 | As an Artist, I can build and send a line-item quotation (24h review window); re-quote supersedes.                      | Must     | `createQuotation()` + `quotationTotal()` + `status='superseded'`. |
| BR-15 | As a Customer, I can see the quotation breakdown, total, expiry countdown, balance due date (T-3d), and balance amount. | Must     | `serializeBooking()` computes `balanceDueDate/balanceAmount`.     |

#### 6.4 Payments & Payouts

| ID    | Requirement                                                                                                          | Priority | Acceptance Hook                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| BR-16 | As a Customer, I can pay a flat non-refundable deposit to confirm my accepted booking.                               | Must     | `POST /pay-fee` → `type='deposit'` Billplz bill.              |
| BR-17 | As a Customer, I can pay the remaining balance after confirmation (due T-3d).                                        | Must     | `POST /pay-balance` → `type='balance'`.                       |
| BR-18 | As a System, Billplz webhook signature (HMAC-SHA256 of raw body) must be verified timing-safe before mutating state. | Must     | `verifyBillplzSignature()` + `POST /api/payments/webhook`.    |
| BR-19 | As a System, a deposit-paid webhook auto-confirms an `accepted` booking; balance-paid creates the artist payout.     | Must     | `handlePaymentPaid()` routed by `payment.type`.               |
| BR-20 | As a Platform, commission is computed artist-side from `platform_settings`; waived below threshold.                  | Must     | `computeCommission()` + `getCommissionRateBps()` clamp 0–50%. |
| BR-21 | As an Admin, I can settle or fail a payout (24h post-event dispute window tracked).                                  | Must     | `updatePayoutStatus()` + `payouts.settleable_at`.             |
| BR-22 | As a Customer, I can request refund of the balance on a cancelled confirmed booking (deposit never refunded).        | Should   | `refundBalancePayment()` — deposit non-refundable.            |

#### 6.5 Communications

| ID    | Requirement                                                                                       | Priority | Acceptance Hook                                 |
| ----- | ------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------- |
| BR-23 | As a Participant, I can chat per-booking with the counterparty; messages stream live.             | Must     | `messages` table + `/messages/stream` SSE.      |
| BR-24 | As a User, I control email preferences (booking_created, quotation_sent, balance_reminder, etc.). | Must     | `email_preferences` + `/api/email/preferences`. |
| BR-25 | As a System, emails are retried (up to 3 attempts) and viewable in `/dev/emails` in dev.          | Must     | `email_outbox` + `email_retries`.               |

#### 6.6 Administration & Ops

| ID    | Requirement                                                                                                                                            | Priority | Acceptance Hook                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------- |
| BR-26 | As an Admin, I can manage users, artists/studios (direct DB edits), bookings (status override), payments, payouts, quotations, messages, and settings. | Must     | `/admin/*` pages + `/api/admin/*` under `requireAdmin()`. |
| BR-27 | As an Admin, every mutation is audit-logged with admin identity, target, and details.                                                                  | Must     | `admin_audit_log` with FK to `users(id)`.                 |
| BR-28 | As an Admin, I can tune booking fee / commission / waiver at runtime without deploy.                                                                   | Must     | `platform_settings` + `/admin/settings`.                  |
| BR-29 | As an Admin, I can see dashboard metrics (users, bookings by status, revenue, recent activity).                                                        | Should   | `GET /api/admin` aggregated stats.                        |

#### 6.7 Platform & Compliance

| ID    | Requirement                                                                                                         | Priority | Acceptance Hook                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| BR-30 | As a System, logs are structured (pino) and forwardable to a webhook (LOG_WEBHOOK_URL).                             | Should   | `src/server/logger.ts` batch 20 lines / 50ms debounce.               |
| BR-31 | As a System, runtime errors are reported to Sentry (if configured) or ERROR_WEBHOOK_URL.                            | Should   | `reportError()` envelope.                                            |
| BR-32 | As a System, analytics events (register, login, booking, quotation, payment) are emitted when Agnost is configured. | Could    | `src/server/agnost.ts` + `src/lib/agnost-client.ts` client tracking. |

---

### 7. Business Rules (BRL-xxx)

| ID     | Rule                          | Expression                                                                                          | Enforcement                                                         |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| BRL-01 | Booking slot atomicity        | `UNIQUE (artist_id,date,time) WHERE status IN ('requested','accepted','confirmed')`                 | DB partial index + pre-check 409                                    |
| BRL-02 | Price authority               | `bookings.price` and `quotations.total` computed server-side from catalog/inputs only               | `getArtistById()` → `serviceDef.price`; `quotationTotal()`          |
| BRL-03 | Amounts in sen                | All monetary columns `INTEGER` (sen), never float                                                   | Schema + `Math.round()` in settings/quotations                      |
| BRL-04 | Deposit non-refundable        | On `cancelled`, only `payments.type='balance' AND status='paid'` is refundable                      | `refundBalancePayment()` guard                                      |
| BRL-05 | Confirmation only via payment | `requested → accepted` (artist) → `accepted → confirmed` (webhook only)                             | `confirmOnFeePaid()` called only from `handlePaymentPaid()`/webhook |
| BRL-06 | Quotation TTL                 | `expires_at = created_at + 24h`; lazy-checked on read + cron sweep                                  | `isQuotationExpired()` + `findExpiredQuotations()`                  |
| BRL-07 | Review gating                 | `reviews` requires `bookings.status='completed' AND reviews.booking_id IS NULL`                     | `findReviewableBooking()` + UNIQUE `booking_id`                     |
| BRL-08 | Commission waiver             | `if total < waiverSen → commission=0 else round(total*rateBps/10000)`                               | `computeCommission()`                                               |
| BRL-09 | Commission cap                | `0 ≤ rateBps ≤ 5,000`                                                                               | Clamp in `getCommissionRateBps()`                                   |
| BRL-10 | Email verification gate       | Payment creation requires `users.email_verified=1` (configurable strictness)                        | `pay-fee` / `pay-balance` handler                                   |
| BRL-11 | Profile claim scoping         | `artist`/`studio` only see bookings for `artist_profiles/studio_profiles` they claimed              | `getClaimedArtistIds()` filter in `GET /api/bookings`               |
| BRL-12 | Settlement window             | `payouts.settleable_at = eventDate + 24h`                                                           | `createPayoutForBooking()`                                          |
| BRL-13 | Audit completeness            | Every `PATCH/POST/DELETE /api/admin/*` writes `admin_audit_log`                                     | `logAdminAction()` wrapper                                          |
| BRL-14 | Rate limiting                 | Auth + booking + webhook routes use sliding window (Upstash if configured, in-memory fallback)      | `src/server/rate-limit.ts`                                          |
| BRL-15 | Session TTL                   | JWT expires in 7 days; JTI revocation respected; revoked=1 always wins; lookup failure is fail-open | `src/server/session.ts`                                             |

---

### 8. Key Business Processes & Journeys

#### 8.1 Client Booking Journey (Primary Flow)

```
[Discover] ─→ [View Artist] ─→ [Select Service + Date/Time + Event Details] ─→ [Submit Request]
   │                    │                        │                                   │
   │              Filters: state/area/              Notes optional                  status=requested
   │              bridal/nonBridal/                                          email to MUA
   │              query/budget                                                 (notifyBookingCreated)
   │
   └─→ Guest can browse; auth required at booking submit ────────────────────────────────┘
```

```
[requested] ──(MUA accept)──→ [accepted] ──(MUA quotes)──→ quotation:pending (24h)
                                   │                            │
                                   │                            ├─(client pays deposit RM50)→ webhook paid → status:confirmed
                                   │                            └─(24h lapse)→ quotation:expired → MUA may re-quote (superseded)
                                   │
                                   └─(MUA reject)──→ cancelled (terminal)
```

```
[confirmed] ──(T-3d reminder)──→ [balance due] ──(pay-balance)→ webhook paid → payouts row (pending)
     │                                │
     ├─(MUA complete)──→ completed ─→ client may review (once per booking)
     └─(either cancel)──→ cancelled ─→ balance refundable, deposit not
```

#### 8.2 Artist Journey

1. Register as `artist` → verify email → `/onboarding` → **claim** catalog profile (`POST /api/artist-profiles {artistId}`) — scopes bookings.
2. Dashboard: `GET /api/bookings` filtered to claimed `artist_id`(s) → act: `accept|reject|complete|cancel`.
3. On `accepted`: `POST /api/bookings/[id]/quotation` (base/travel/early-call/accommodation + extras ≤10, total computed server-side, `expires_at = now+24h`, supersedes previous `pending`).
4. On `confirmed`: `POST /api/bookings/[id]/remind` (balance reminder), chat, invoice (`/invoice` + `/invoice.pdf`).
5. After balance paid: payout appears `pending` (settleable 24h post-event) → admin settles via `/admin/payouts`.

#### 8.3 Payment & Webhook Flow

```
POST /pay-fee  ─→ createBookingPayment('deposit', bookingFeeSen)
              ├─ billplz: POST /bills (auth Basic API_KEY:) → {id, url} → INSERT payments(type=deposit,status=required)
              └─ dev:     INSERT payments(type=deposit,status=required, provider_ref=dev_*)
                     │
                     └─ (dev) auto-settlement: markBillPaid + handlePaymentPaid → booking confirmed

Billplz ─POST─→ /api/payments/webhook  (raw body + X-Billplz-Signature)
              → verifyBillplzSignature(rawBody, sig, API_KEY)  [timingSafeEqual]
              → markBillPaid(billId) → handlePaymentPaid(payment)  [routes by type]
                   ├─ deposit: confirmOnFeePaid(status) → UPDATE bookings SET status='confirmed'
                   └─ balance: UPDATE quotations SET status='paid', createPayoutForBooking(...)
```

---

### 9. Success Metrics & KPIs

| Category    | Metric                                         | Target (Launch + 90d) | Source                                 |
| ----------- | ---------------------------------------------- | --------------------- | -------------------------------------- |
| Acquisition | Visitors → Artist view CTR                     | ≥25%                  | Web analytics / Agnost                 |
| Conversion  | Request → Accepted                             | ≥60%                  | `bookings` status counts               |
| Conversion  | Accepted → Confirmed (deposit paid within 24h) | ≥50%                  | `payments` deposit `paid`              |
| Completion  | Confirmed → Completed                          | ≥85%                  | `bookings` lifecycle                   |
| Revenue     | Gross booking value (GBV)                      | RM 50k cumulative     | `quotations.total` sum                 |
| Take-rate   | Net / GBV                                      | 8–10%                 | `payouts.commission_sen` / GBV         |
| NPS         | Post-completion survey                         | ≥45                   | Reviews + survey                       |
| Ops         | Webhook failure rate                           | <0.5%                 | `payments.status='failed'` + Sentry    |
| Ops         | Review fraud rate                              | ~0%                   | Audit: `reviews` without valid booking |
| Engineering | Build + typecheck + lint clean                 | 100% of merges        | CI `quality-gate.yml`                  |

Leading indicators tracked via `src/server/agnost.ts` + `src/lib/agnost-client.ts`: `trackArtistView`, `trackSearch`, `trackBookingForm`, bookings, payments.

---

### 10. Constraints, Assumptions & Dependencies

#### 10.1 Constraints

| ID   | Constraint                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Must run on Vercel (serverless); no long-running processes — crons via `VERCEL_CRON` or external scheduler.                                  |
| C-02 | `DATABASE_URL` (PostgreSQL) in production; `node:sqlite` fallback for local/tests only — never in prod (`SKIP_DB_GUARD` only for debugging). |
| C-03 | Billplz is the sole gateway at launch; no multi-PSP abstraction needed beyond `provider='billplz'                                            | 'dev'`. |
| C-04 | Single deployable (Next.js); `output:"standalone"` for Docker parity.                                                                        |
| C-05 | Node ≥22 required (for `node:sqlite` DatabaseSync).                                                                                          |

#### 10.2 Assumptions

| ID   | Assumption                                                   | Validation Plan                              |
| ---- | ------------------------------------------------------------ | -------------------------------------------- |
| A-01 | RM50 flat deposit is acceptable to clients                   | A/B price sensitivity after 100 bookings     |
| A-02 | 10% commission + waiver is acceptable to artists             | Artist interviews + churn watch              |
| A-03 | 24h quotation window balances urgency vs deliberation        | Funnel analysis (expiry vs payment)          |
| A-04 | T-3d balance due date is enforceable (reminder only for now) | Add dunning cron in v2.1 if delinquency >10% |
| A-05 | Email is sufficient for transactional comms at launch        | Add WhatsApp in v2.1 if open rate <40%       |

#### 10.3 Dependencies

| Dependency                                     | Type                      | Risk if Unavailable                                                                    |
| ---------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| Billplz API + Collection ID                    | External                  | `activePaymentProvider()` falls back to `dev` (no real money); feature-flagged warning |
| `NEXT_PUBLIC_SUPABASE_URL` + anon/service keys | External (storage/images) | Catalog images degrade to placeholder; admin Supabase pages gated                      |
| RESEND/POSTMARK/BREVO                          | External                  | Falls back to `email_outbox` (no real send, `dev` provider) — flagged in logs          |
| Upstash Redis                                  | Optional                  | In-memory rate limiting (single-instance degradation)                                  |
| Vercel Blob / S3                               | Optional                  | Image uploads degrade; local fallback                                                  |

---

### 11. Compliance & Legal

| Area                           | Requirement                                                                | Implementation                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **PDPA 2010 (Malaysia)**       | Consent captured; purpose limitation; access & correction; retention limit | `registerSchema.consent`, `users.consent+consent_timestamp`, `GET /api/me/export`, `DELETE /api/me`, `docs/PDPA_RETENTION_GUIDELINES.md` |
| **Consumer Protection (KPDN)** | Price transparency; refund policy disclosed                                | Quotation breakdown, invoice HTML/PDF, non-refundable deposit disclosed at pay-fee                                                       |
| **Data Retention**             | Bookings/payouts retained for audit; PII deletable on request              | Retention guideline doc; `DELETE /api/me` cascades `ON DELETE CASCADE`                                                                   |
| **Security disclosures**       | Headers, CSP, password handling                                            | `next.config.ts` headers (`X-Frame-Options:DENY`, `X-Content-Type-Options:nosniff`, CSP with nonce), scrypt + pepper, httpOnly cookies   |
| **Financial**                  | Settlement auditability                                                    | `payouts` + `admin_audit_log` immutable log                                                                                              |

---

### 12. Risks & Mitigations

| ID   | Risk                              | Likelihood | Impact   | Mitigation                                                                                                  |
| ---- | --------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| R-01 | Double-booking same slot (race)   | Medium     | High     | Partial unique index `uq_bookings_slot` + optimistic 409; never trust client price                          |
| R-02 | Webhook forgery (fake paid)       | Medium     | Critical | `verifyBillplzSignature()` timing-safe before state change; apiKey as HMAC secret                           |
| R-03 | Lost-update on rating             | Low        | Medium   | `blendAggregate()` single SQL (no read-modify-write) + ROUND(...,2)                                         |
| R-04 | SQLite used in prod by misconfig  | Low        | Critical | `getDb()` throws in prod when `DATABASE_URL` missing (unless `SKIP_DB_GUARD`)                               |
| R-05 | Email provider downtime           | Medium     | Medium   | Fallback to dev outbox; retry queue `email_retries` max 3, `next_retry` backoff                             |
| R-06 | Artist churn (take-rate too high) | Medium     | High     | Waiver threshold; configurable `platform_settings`; artist dashboard transparency                           |
| R-07 | Low conversion accepted→confirmed | Medium     | Medium   | 24h expiry urgency + re-quote; analytics on funnel                                                          |
| R-08 | PG pool exhaustion                | Low        | High     | `PG_MAX`, `PG_CONNECTION_TIMEOUT_MS`, `PG_IDLE_TIMEOUT_MS` tunable; `idleTimeoutMillis` for Neon/serverless |

---

### 13. Roadmap & Release Strategy

| Phase                   | Milestone                                | Scope                                                    | Gate                                    |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| **0 — Foundation**      | DB facade, auth, catalog                 | Tables, session, seeding, filters                        | Typecheck + tests pass                  |
| **1 — Booking Loop**    | Request → accept → quote → fee → confirm | Bookings, quotations, payments (dev)                     | E2E (register→book→dashboard) green     |
| **2 — Money Hardening** | Billplz, webhook, payouts, invoices      | `verifyBillplzSignature`, `handlePaymentPaid`, `payouts` | Manual Billplz sandbox test + audit     |
| **3 — Comms**           | Chat, emails, preferences                | SSE stream, `booking-emails`, `email_preferences`        | Mail trap + load test                   |
| **4 — Admin**           | Ops panel + audit                        | `/admin/*`, `admin_audit_log`, `platform_settings`       | Admin UAT + seed-admin                  |
| **5 — Launch**          | KL+Selangor, 10 MUAs                     | Seed catalog, health check, deploy                       | `npm run env:check` + `db:migrate/seed` |

Post-launch (v2.1+): studio-native bookings, balance dunning cron, WhatsApp, product e-commerce, native loyalty.

---

### 14. Acceptance Criteria (Business Level)

- [ ] A guest can browse artists/studios and filter without authentication.
- [ ] A customer can register (with PDPA consent), verify email, and log in; sessions last 7 days.
- [ ] An artist can claim a profile and see only their bookings; `GET /api/bookings` is scoped.
- [ ] Double-booking a live slot returns a friendly 409 (never 500) and the unique index prevents the anomaly.
- [ ] Quotations are 24h expiry, re-quotable, and total is server-computed; expired ones are auto-marked.
- [ ] Deposits confirm bookings only via verified webhook (Billplz) or dev auto-settlement (test).
- [ ] Commission math matches `computeCommission()` spec with waivers and clamped rate.
- [ ] Payouts become settleable 24h after event date and are admin-settleable with audit.
- [ ] Reviews are possible only after `completed`, once per booking, with atomic rating update.
- [ ] Per-booking chat works live (SSE) and persists.
- [ ] Admin actions are audit-logged; non-admin cannot access `/admin` or `/api/admin/*`.
- [ ] PDPA export/delete work as documented; retention guidelines are followed.
- [ ] Build, lint, typecheck, tests (Vitest + Playwright), and coverage ≥80% all pass in CI.

---

### 15. Appendix

#### 15.1 References

- `AGENTS.md` — project overview, architecture patterns, security considerations.
- `docs/ARCHITECTURE.md` — single-backend data flow, money logic ownership.
- `docs/CODEBASE-AUDIT-FINAL.md` — enterprise-readiness gaps closed.
- `src/lib/data.ts` — constants (`MALAYSIA_STATES`, `BRIDAL_EVENTS`, `NON_BRIDAL_EVENTS`, `SEED_ARTISTS/STUDIOS`).
- `src/server/db.ts` — `PG_SCHEMA` / `SQLITE_SCHEMA`, `DbFacade`, migration logic.

#### 15.2 Glossary (Short)

See `docs/09-Glossary.md` for full glossary. Key terms: **Deposit**, **Balance**, **Quotation**, **Payout**, **Settlement**, **Claim**, **Slot**.

#### 15.3 Document Control

| Version | Date       | Author      | Change                                                              |
| ------- | ---------- | ----------- | ------------------------------------------------------------------- |
| 1.0     | 2026-08-10 | Product     | Initial BRS covering booking→fee                                    |
| 2.0     | 2026-08-29 | Product+Eng | Added hybrid deposit/balance, payouts/commission, admin, compliance |

---

_End of BRS — see `02-SRS-Software-Requirements-Specification.md` for system decomposition and `03-FRS-Functional-Requirements-Specification.md` for per-feature functional detail._
