# Traceability Matrix — Leish! v2

| Field           | Value                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Document ID** | LEISH-RTM-v2.0                                                                                                                                  |
| **Version**     | 2.0.0                                                                                                                                           |
| **Date**        | 2026-08-29                                                                                                                                      |
| **Purpose**     | Bidirectional trace: Business Requirement → SRS → FRS → API/UI → Data → Verification. Ensures no orphan requirement and no unvalidated feature. |

---

### 1. End-to-End Trace (BR → FRS → Implementation → Test)

| BR                                                   | BRS §      | SRS-F           | FRS IDs                | APIs / Pages                                                                                                                                       | Tables / Logic                                                                              | Verification                           |
| ---------------------------------------------------- | ---------- | --------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| **BR-01** Public catalog discovery                   | 6.1        | F-02            | FR-CAT-01              | `GET /api/artists`, `GET /api/catalog/artists`, `GET /artists`, `/studios`, `/`                                                                    | `artists,studios` + `listArtists` / `AREAS_BY_STATE`                                        | Vitest catalog + e2e browse            |
| **BR-02** Filtered artists                           | 6.1        | F-02            | FR-CAT-01, FR-CAT-03   | `GET /api/artists?state&area&bridal&nonBridal&budget&query`                                                                                        | `artistsQuerySchema`, `idx_artists_state_area`                                              | Filter tests                           |
| **BR-03** Detail view                                | 6.1        | F-02            | FR-CAT-02              | `GET /artists/[slug]`, `GET /studios/[slug]` (RSC `resolveArtist`)                                                                                 | `artists,studios,reviews` via `listEntityReviews`                                           | RSC rendering test                     |
| **BR-04** Gated reviews                              | 6.1        | F-07            | FR-REV-01, FR-REV-02   | `POST /api/artists/[slug]/reviews`                                                                                                                 | `reviews.booking_id UNIQUE` + `findReviewableBooking`                                       | Review gate test                       |
| **BR-05** Atomic rating blend                        | 6.1        | F-07            | FR-REV-03              | (internal)                                                                                                                                         | `blendAggregate()` single UPDATE `ROUND(...,2)`                                             | Concurrency test                       |
| **BR-06** Registration                               | 6.2        | F-01            | FR-AUTH-01, FR-AUTH-07 | `POST /api/auth/register`, `/register`                                                                                                             | `users`, `registerSchema`, scrypt+pepper                                                    | Register tests                         |
| **BR-07** Email verification gate                    | 6.2        | F-01            | FR-AUTH-05, FR-AUTH-02 | `GET /api/auth/verify-email`, `POST /api/auth/resend-verification`, `/verify-email`                                                                | `email_verifications` hashed token, `users.email_verified`, banner in `/dashboard`          | Verify flow tests                      |
| **BR-08** Password reset                             | 6.2        | F-01            | FR-AUTH-06             | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `/forgot-password`, `/reset-password`                                           | `password_resets` hashed 1h single-use                                                      | Reset tests + enumeration check        |
| **BR-09** Session 7d + revocation                    | 6.2        | F-01            | FR-AUTH-03, FR-AUTH-04 | `POST /api/auth/login`, `POST /api/auth/logout`, `Cookie leish_session`                                                                            | `sessions` JTI, `SESSION_TTL_SECONDS`, `verifySessionToken`                                 | Session/JWT tests                      |
| **BR-10** Export / delete (PDPA)                     | 6.2        | F-13            | FR-COMP-01, FR-COMP-02 | `GET /api/me/export`, `DELETE /api/me?confirm=1`, `/dashboard` buttons                                                                             | FK `CASCADE`/`SET NULL`                                                                     | PDPA tests                             |
| **BR-11** Booking request with event details         | 6.3        | F-03            | FR-BOOK-01             | `POST /api/bookings`, `/artists/[slug]/book`                                                                                                       | `bookingSchema`, `bookings` + server-derived `price`, `notifyBookingCreated`                | Booking create tests                   |
| **BR-12** Slot uniqueness                            | 6.3        | F-03            | FR-BOOK-01             | `POST /api/bookings` 409 path                                                                                                                      | `uq_bookings_slot` partial index + pre-check + race catch                                   | Concurrency race test                  |
| **BR-13** Accept/reject/complete                     | 6.3        | F-03            | FR-BOOK-03             | `PATCH /api/bookings/[id] {accept\|reject\|complete\|cancel}`                                                                                      | `applyBookingTransition` state machine                                                      | State machine unit tests               |
| **BR-14** Quotation 24h + re-quote                   | 6.3        | F-04            | FR-QUO-01, FR-QUO-02   | `POST /api/bookings/[id]/quotation`, `/dashboard` quote block                                                                                      | `quotations` `status pending/superseded/expired/paid`, `quotationTotal`, `QUOTATION_TTL_MS` | Quotation TTB tests                    |
| **BR-15** Quotation display + balance due            | 6.3        | F-03, F-04      | FR-BOOK-04             | `GET /api/bookings` `serializeBooking` (quotation,totalPrice,balanceDueDate,balanceAmount)                                                         | `getBookingFeeSen()`, `balanceDueDate = date -3d`                                           | Serialization tests                    |
| **BR-16** Pay deposit                                | 6.4        | F-05            | FR-PAY-02              | `POST /api/bookings/[id]/pay-fee`                                                                                                                  | `payments(type=deposit)`, `createBookingPayment`, Billplz `POST /bills`                     | Pay-fee tests + Billplz sandbox manual |
| **BR-17** Pay balance T-3d                           | 6.4        | F-05            | FR-PAY-03              | `POST /api/bookings/[id]/pay-balance`                                                                                                              | `payments(type=balance)`, `amount=total-fee`                                                | Pay-balance tests                      |
| **BR-18** Webhook HMAC verified                      | 6.4        | F-05            | FR-PAY-04              | `POST /api/payments/webhook` + `X-Billplz-Signature`                                                                                               | `verifyBillplzSignature` timingSafe, `markBillPaid`, `handlePaymentPaid`                    | Signature contract tests               |
| **BR-19** Webhook routes + confirms / creates payout | 6.4        | F-05, F-06      | FR-PAY-04, FR-PAYO-02  | same webhook                                                                                                                                       | `confirmOnFeePaid` vs `createPayoutForBooking` routed by `type`                             | Webhook flow tests                     |
| **BR-20** Commission computed                        | 6.4        | F-06            | FR-PAYO-01             | (internal, admin settings)                                                                                                                         | `platform_settings`, `computeCommission`, rate clamp 0..5000                                | Commission unit tests                  |
| **BR-21** Payout settle/fail                         | 6.4        | F-06            | FR-PAYO-03             | `GET/PATCH /api/admin/payouts` + `/admin/payouts`                                                                                                  | `payouts.status pending→settled/failed`, `settleable_at = event+24h`                        | Payout tests + admin UAT               |
| **BR-22** Refund balance only                        | 6.4        | F-05            | FR-PAY-05              | `POST /api/bookings/[id]/refund`                                                                                                                   | `refundBalancePayment` guard `type=balance` + `status=paid`                                 | Refund tests                           |
| **BR-23** Chat live                                  | 6.5        | F-08            | FR-MSG-01, FR-MSG-02   | `GET/POST /api/bookings/[id]/messages`, `GET …/messages/stream` SSE                                                                                | `messages` + `chat-bus` pub/sub                                                             | Messaging e2e                          |
| **BR-24** Email preferences                          | 6.5        | F-11            | FR-MAIL-03             | `GET/PATCH /api/email/preferences`                                                                                                                 | `email_preferences` flags                                                                   | Preference tests                       |
| **BR-25** Email retries + outbox                     | 6.5        | F-11            | FR-MAIL-01, FR-MAIL-02 | `POST /api/bookings/*` email side-effects, `/dev/emails`                                                                                           | `email_outbox`, `email_retries`, `sendEmail` fallback                                       | Outbox tests                           |
| **BR-26** Admin CRUD                                 | 6.6        | F-10            | FR-ADM-02              | `GET/POST/PATCH/DELETE /api/admin/users`, `…/artists`, `…/studios`, `GET/PATCH …/bookings`, `GET …/payments`, `GET …/quotations`, `GET …/messages` | `artists,studios,bookings,…` via `updateArtist`                                             | Admin API tests                        |
| **BR-27** Audit trail                                | 6.6        | F-10            | FR-ADM-03              | all admin mutators                                                                                                                                 | `admin_audit_log` + `logAdminAction()` + `idx_audit_log_*`                                  | Audit log tests                        |
| **BR-28** Tunable settings                           | 6.6        | F-10, F-15      | FR-ADM-04, FR-OPS-01   | `GET/PATCH /api/admin/settings`, `/admin/settings`                                                                                                 | `platform_settings`, `getBookingFeeSen()` etc + 30s cache                                   | Settings tests                         |
| **BR-29** Dashboard metrics                          | 6.6        | F-10            | FR-ADM-02 (dashboard)  | `GET /api/admin`                                                                                                                                   | Aggregated counts `users by role`, `bookings by status`, `payments revenue`                 | Dashboard tests                        |
| **BR-30** Structured logs + forwarding               | 6.7        | F-12            | FR-OPS-01 (NFR)        | `src/server/logger.ts`                                                                                                                             | `pino` + `LOG_WEBHOOK_URL` batch 20/50ms                                                    | Logger config test                     |
| **BR-31** Error reporting                            | 6.7        | F-12            | (NFR-S)                | `src/server/errors.ts`                                                                                                                             | `reportError` → Sentry / `ERROR_WEBHOOK_URL`                                                | Error path test                        |
| **BR-32** Analytics events                           | 6.7        | F-12            | FR-OPS-03              | `src/server/agnost.ts`, `src/lib/agnost-client.ts`, `src/instrumentation.ts`                                                                       | `agnost.begin/end`, `trackEvent`                                                            | Agnost dashboard spot check            |
| BRL-*                                                | BRS §7     | SRS §6–7        | —                      | —                                                                                                                                                  | Enforced by DB CHECK + code guards                                                          | BRL→test map below                     |
| NFR-P/R/S/U/M/O                                      | BRS §10–12 | SRS §7, NFR doc | —                      | Headers, CSP, rate-limit, `next.config.ts`                                                                                                         | —                                                                                           | NFR gate matrix (§3)                   |

---

### 2. Business Rule → Test Matrix (BRL → Enforcement → Test)

| BRL    | Rule                     | Enforcement (DB/Code)                                                                                         | Test Location / Spec                                     |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| BRL-01 | Slot atomic              | `uq_bookings_slot` partial index `src/server/db.ts:470`; service guard `POST /api/bookings`                   | Booking concurrency test (cohort 2 par requests → 1 409) |
| BRL-02 | Price authority          | `serviceDef.price` server derive `src/app/api/bookings/route.ts:183`; `quotationTotal()` server-only          | Booking create test asserts custom price ignored         |
| BRL-03 | Sen integers             | `INTEGER` columns + `Math.round` in `quotations.ts`/`settings.ts`/`payouts.ts`                                | Lint + payment math tests                                |
| BRL-04 | Deposit non-refundable   | `refundBalancePayment()` guard `type!==balance → throw` `src/server/payments.ts:322`                          | Refund test attempts deposit → error                     |
| BRL-05 | Confirm only via webhook | `confirmOnFeePaid` called only in `handlePaymentPaid` `src/server/payments.ts:246`; PATCH rejects `confirmed` | Webhook vs PATCH tests                                   |
| BRL-06 | 24h quotation TTL        | `QUOTATION_TTL_MS=86400000` `src/server/quotations.ts:13`; `isQuotationExpired` lazy + sweep                  | Expiry test (mock now+25h → expired)                     |
| BRL-07 | Review gated             | `reviews.booking_id UNIQUE` + `findReviewableBooking` `src/server/catalog.ts:678`                             | Gate test: uncompleted → null; duplicate review → 409    |
| BRL-08 | Commission waiver        | `computeCommission` waived branch `src/server/settings.ts:106`                                                | Unit test total<waiver → 0                               |
| BRL-09 | Commission cap           | Clamp `min(5000,max(0,round(v)))` `src/server/settings.ts:77`                                                 | Cap test rate 6000 → 5000                                |
| BRL-10 | Verification gate        | Payment handler checks `email_verified` (strict flag)                                                         | Pay before verified → 403 when enabled                   |
| BRL-11 | Profile claim scoping    | `artist_profiles` UNIQUE + `GET /api/bookings` claimedId filter `src/app/api/bookings/route.ts:99`            | Scoping test: artist sees only claimed                   |
| BRL-12 | Settlement 24h           | `settleable_at = eventDate+24h` `src/server/payouts.ts:81`                                                    | Payout date math test                                    |
| BRL-13 | Audit completeness       | `logAdminAction()` in every admin mutator + `src/app/api/admin/list-routes.test.ts` coverage audit            | Admin mutation test asserts audit row created            |
| BRL-14 | Rate limit               | `src/server/rate-limit.ts` sliding window + 429 header                                                        | Rate-limit contract test                                 |
| BRL-15 | 7d JTI revoke            | `src/server/session.ts` `SESSION_TTL_SECONDS=604800` + `revokeSession` wins                                   | Session revoke test                                      |

---

### 3. NFR → Gate Matrix

| NFR ID                             | Gate Type                                        | Blocking PR?                               | Measurement               |
| ---------------------------------- | ------------------------------------------------ | ------------------------------------------ | ------------------------- |
| NFR-P-01 (latency p95)             | Bench on preview deploy; warn if > target        | No (advisory for launch, blocking by v2.1) | k6 / Vercel p95           |
| NFR-P-04 (pool, WAL)               | Code review required fields present              | Yes                                        | Review checklist          |
| NFR-R-02 (degradation)             | Test: kill email/Billplz mock → still 200        | Yes                                        | Unit with mocked provider |
| NFR-S-03.03 (webhook sig)          | Unit suite includes forged sig → 401             | Yes (CI fails if missing)                  | Vitest                    |
| NFR-S-04 (headers)                 | `curl -I` assertions on `next.config.ts` headers | Yes                                        | ZAP / curl                |
| NFR-U-01 (a11y ≥90)                | Lighthouse CI step `assert: a11y≥90`             | Advisory pre-launch, blocking post-launch  | Lighthouse CI             |
| NFR-M-01 (lint/typecheck/coverage) | `quality-gate.yml` all green, coverage ≥80%      | Yes                                        | GHA required              |
| NFR-O-02 (health)                  | `GET /api/health` 200 on PR deploy               | Yes                                        | Smoke fetch               |

---

### 4. Reverse Trace — Code → Requirement (Orphan Check)

| Implementation                              | Requirement(s)                                                                                                        | Orphan?                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| All `src/server/*` modules                  | See §1 rows                                                                                                           | No — mapped                                                                  |
| `src/components/*`                          | FRS §12 Dashboard, SRS §4.1 UI                                                                                        | Covered                                                                      |
| `referrals` table + `referral_code` columns | BRS §4.2 deferred (referral MVP scaffold only) — no business rule yet; code is _pre-requirement scaffolding_ for v2.2 | **Deferred — flag red if exposed before BR**; tests exist but feature hidden |
| `products` type `src/lib/types.ts:89`       | BRS §4.2 deferred e-commerce                                                                                          | **Scaffold, not traced — ok if unused; must not gate launch**                |
| `src/lib/agnost-client.ts` client tracking  | BR-32                                                                                                                 | Traced                                                                       |
| `src/server/referral.ts` helpers            | BRS deferred                                                                                                          | Scaffold — see above; require BR before enabling rewards                     |

**Action**: no undocumented production feature that bypasses a BR; scaffolds above are gated behind `referredBy` writes that only run when `referralCode` supplied (optional) — safe.

---

### 5. Change History Linkage

| Doc Version     | RTM Change                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| v1 (2026-08-15) | BR-01..BR-16 only (single payment, no payouts)                                                        |
| v2 (2026-08-29) | Added BR-17..BR-25, BR-27..BR-32; added payments.type hybrid, payouts, messaging, admin audit, Agnost |

---

### 6. Usage Notes

- **Before adding code**: add row to FRS → map to BR or create new BR (with product consent); never code from Jira alone.
- **Before shipping**: `git diff --stat` against this RTM — every changed table/endpoint must have a row or be scaffolding.
- **Before audit**: `npm run typecheck && npm run lint && npm test` + `src/app/api/admin/list-routes.test.ts` proves admin guard coverage.

---

_This RTM is the single reference for reviewers (security, QA, compliance) to confirm every promised capability is implemented and tested._
