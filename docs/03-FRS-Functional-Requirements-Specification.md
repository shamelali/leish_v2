# FRS — Functional Requirements Specification
## Leish! v2 — Beauty Booking Marketplace

| Field | Value |
|-------|-------|
| **Document ID** | LEISH-FRS-v2.0 |
| **Version** | 2.0.0 |
| **Date** | 2026-08-29 |
| **Status** | Baseline |
| **Predecessor** | SRS (02), BRS (01) |
| **Method** | Use-case driven, MoSCoW prioritized |
| **Notation** | `FR-XXX` shall; pre/post conditions; primary/alternate flows |

---

### Table of Contents
1. [Conventions](#1-conventions)
2. [Actor Definitions](#2-actor-definitions)
3. [Functional Decomposition Map](#3-functional-decomposition-map)
4. [FR-01 Authentication & Session](#4-fr-01-authentication--session)
5. [FR-02 Catalog & Discovery](#5-fr-02-catalog--discovery)
6. [FR-03 Booking Lifecycle](#6-fr-03-booking-lifecycle)
7. [FR-04 Quotations](#7-fr-04-quotations)
8. [FR-05 Payments (Hybrid Deposit/Balance)](#8-fr-05-payments-hybrid-depositbalance)
9. [FR-06 Payouts & Commission](#9-fr-06-payouts--commission)
10. [FR-07 Reviews & Ratings](#10-fr-07-reviews--ratings)
11. [FR-08 Messaging & Chat](#11-fr-08-messaging--chat)
12. [FR-09 Profile Claim & Self-Service](#12-fr-09-profile-claim--self-service)
13. [FR-10 Admin Panel & Audit](#13-fr-10-admin-panel--audit)
14. [FR-11 Email & Notifications](#14-fr-11-email--notifications)
15. [FR-12 Dashboard & UX](#15-fr-12-dashboard--ux)
16. [FR-13 Invoicing & Documents](#16-fr-13-invoicing--documents)
17. [FR-14 Compliance & Data Rights](#17-fr-14-compliance--data-rights)
18. [FR-15 Platform Settings & Ops](#18-fr-15-platform-settings--ops)
19. [Summary Table & MoSCoW](#19-summary-table--moscow)
20. [Appendix — State Machines & Flows](#20-appendix--state-machines--flows)

---

### 1. Conventions

- **ID**: `FR-<module>-<seq>` e.g. `FR-AUTH-01`.
- **Priority**: **M**ust / **S**hould / **C**ould / **W**on't (MoSCoW).
- **Shall** = verifiable requirement; **Preconditions** must hold before execution; **Postconditions** hold after.
- **Source file** cites the authoritative implementation; tests must exercise it.
- **Acceptance criteria** written as Given/When/Then or checklist.

---

### 2. Actor Definitions

| Actor | Auth | Route Example | Details |
|-------|------|---------------|---------|
| **Guest** | None | `/artists`, `/studios` | Can browse, search, view detail. Redirected to `/login?redirect=/dashboard` on gated actions. |
| **Customer** | JWT `customer` | `POST /api/bookings` | Books, pays, chats, reviews. |
| **Artist** | JWT `artist` | `PATCH /api/bookings/[id]` | Claims `artists.id`, manages bookings for claimed profiles. |
| **Studio** | JWT `studio` | same | Studio variant; scopes by `studio_id` when claimed. |
| **Admin** | JWT `admin` | `/api/admin/*` | Full ops; all mutations audited. |
| **System** | `CRON_SECRET` / internal | `POST /api/payments/webhook` | Billplz, cron, Agnost. |

Role source: `src/lib/types.ts:1` (`Role`), DB `users.role CHECK (customer|artist|studio|admin)` `src/server/db.ts:212`.

---

### 3. Functional Decomposition Map

```
Leish v2
├── FR-01 Auth & Session
│   ├── Registration (role, consent, scrypt+pepper)
│   ├── Login / Logout / Session (JWT+JTI)
│   ├── Email verification (single-use, banner)
│   └── Password reset (forgot/reset, no enumeration)
├── FR-02 Catalog
│   ├── List/filter artists & studios
│   ├── Detail (slug→id resolution)
│   └── Admin + self-service edits
├── FR-03 Booking
│   ├── Create (price server-derived, slot-lock)
│   ├── List (scoped: owner vs claimed-artist)
│   └── Transitions (accept/reject/complete/cancel)
├── FR-04 Quotation (line-items, 24h TTL, re-quote)
├── FR-05 Payments (deposit, balance, webhook, refund)
├── FR-06 Payouts & Commission (compute, create, settle/fail)
├── FR-07 Reviews (gated, once-per-booking, atomic blend)
├── FR-08 Messaging (persist + SSE stream)
├── FR-09 Profile Claim (artist/studio scoping)
├── FR-10 Admin & Audit
├── FR-11 Email (provider abstraction, preferences, retries)
├── FR-12 Dashboard
├── FR-13 Invoicing (HTML + PDF)
├── FR-14 Compliance (export/delete)
└── FR-15 Settings & Ops (platform_settings, health, agnost)
```

---

### 4. FR-01 Authentication & Session

#### FR-AUTH-01 — Registration

| Field | Detail |
|-------|--------|
| **Pre** | Guest, no active session for same email; `SESSION_SECRET` set in prod; `PEPPER_SECRET` optional |
| **Input** | `registerSchema` `src/server/validation.ts:5` — `name` 2–80, `email` lowercased RFC, `password` 8–128, `role` ∈ {customer,artist,studio}, `consent` bool, `consentTimestamp` ISO |
| **Processing** | Normalize email lower/triM; check `users.email` UNIQUE; hash with `scrypt` (salt 32B, keyLen 64, N=16384, r=8, p=1) + optional `PEPPER_SECRET` HMAC before hashing; `INSERT users (id, email, name, role, password, consent, consent_timestamp, created_at)`; create `email_verifications` token (random, sha256 hash at rest); set `leish_session` cookie (see FR-AUTH-03); emit `agnost.begin(agentName="register")` |
| **Post** | User row created; `201` with `{user: toPublicUser, devVerifyUrl}` (dev); session cookie set; verification email queued (or outbox in dev) |
| **Priority** | Must |
| **Source** | `src/app/api/auth/register/route.ts`, `src/server/validation.ts`, `src/server/session.ts` |
| **Acceptance** | ✓ Zod rejects weak/short name, invalid email, short password, invalid role.<br>✓ Duplicate email returns 409 without leaking enumeration (generic message).<br>✓ Password stored is not plaintext; `timingSafeEqual` used on verify.<br>✓ Response includes `devVerifyUrl` when `EMAIL_PROVIDER=dev`.<br>✓ Agnost `register` event emitted when `AGNOST_ORG_ID` set. |

#### FR-AUTH-02 — Login

| Field | Detail |
|-------|--------|
| **Input** | `loginSchema` `src/server/validation.ts:14` — email + password (1–128) |
| **Processing** | Lookup `users` by lowercased email; scrypt verify with pepper if set; on success rotate JTI: `INSERT sessions(jti,user_id,expires_at,created_at)`; sign HS256 JWT `{sub,role,emailVerified, jti, iat, exp=iat+7d}` via `jose`; set cookie; `agnost.begin(agentName="login")` end(true/false) |
| **Post** | `200 {user,}` + cookie; failed → `401` generic "Invalid credentials" (no enumeration) |
| **Priority** | Must |
| **Source** | `src/app/api/auth/login/route.ts` |
| **Acceptance** | ✓ Correct creds → cookie present with `httpOnly; Path=/; SameSite=lax; Secure@prod`.<br>✓ Wrong password → 401 with no hint which field failed.<br>✓ Rate-limited after N attempts → 429 + `Retry-After`. |

#### FR-AUTH-03 — Session Cookie & Verification

| Field | Detail |
|-------|--------|
| **Shall** | The system shall issue and verify the `leish_session` cookie as HS256 JWT per `src/server/session.ts`. |
| **Processing** | `createSessionToken({sub,role,...})` signs with `SESSION_SECRET` (must be ≥32 bytes in prod or throw). `verifySessionToken(token)` verifies signature via `jose.jwtVerify`, checks `exp`, then looks up `sessions WHERE jti=?`: if `revoked=1` → reject; if row missing → accept if sig+expiry pass (fail-open with warning); if `expires_at < now` → reject. |
| **Priority** | Must |
| **Acceptance** | ✓ Token valid for 7 days (`SESSION_TTL_SECONDS = 604800`).<br>✓ Tampered payload → verification fails.<br>✓ Revoked JTI → rejected even if not expired.<br>✓ Missing JTI row → accepted on sig+expiry (infra degraded case). |

#### FR-AUTH-04 — Logout / Revocation

| Field | Detail |
|-------|--------|
| **Endpoint** | `POST /api/auth/logout` |
| **Processing** | Extract `leish_session` from `Cookie`; decode JTI without failing closed; `revokeSession(jti)` → `UPDATE sessions SET revoked=1 WHERE jti=?`; clear cookie (`Max-Age=0`). |
| **Priority** | Must |
| **Acceptance** | ✓ After logout, same token is rejected (revoked wins).<br>✓ Logout without session still clears cookie and returns 200. |

#### FR-AUTH-05 — Email Verification

| Field | Detail |
|-------|--------|
| **Endpoints** | `GET /api/auth/verify-email?token=…` (redirect flow), `POST /api/auth/resend-verification` (authed, rate-limited) |
| **Processing** | On register: `email_verifications(id,user_id,token_hash=sha256(token),expires_at~24h, used_at null)`; link `{NEXT_PUBLIC_SITE_URL}/verify-email?token=raw`. On verify: hash lookup, check `used_at IS NULL && expires_at>now`, then `UPDATE users SET email_verified=1` + `UPDATE email_verifications SET used_at=now`. Unverified banner shown in `/dashboard` until verified with resend button (states idle/sending/sent). |
| **Priority** | Must |
| **Acceptance** | ✓ Verification link single-use (second use fails).<br>✓ Expired token returns friendly error (not stack).<br>✓ Resend is rate-limited per user.<br>✓ Banner disappears immediately after verification.<br>✓ Payment routes can enforce `email_verified` when strict mode enabled (see FR-PAY-02). |

#### FR-AUTH-06 — Forgot / Reset Password

| Field | Detail |
|-------|--------|
| **Endpoints** | `POST /api/auth/forgot-password {email, turnstileToken?}`, `POST /api/auth/reset-password {token,newPassword}` |
| **Processing** | `password_resets(id,user_id,token_hash,expires_at~1h,used_at,created_at)`. On forgot: rate-limit by IP; lookup user (always return 200-ish to avoid enumeration); if exists generate token, hash+store, send email (outbox in dev). On reset: verify hash, single-use, expiry, then scrypt new password and mark used. `PEPPER_SECRET` applied if set. |
| **Priority** | Must |
| **Acceptance** | ✓ Non-existent email returns success-shaped envelope (no enumeration).<br>✓ Token is single-use and 1h expiry.<br>✓ New password must meet 8–128 length.<br>✓ After reset, old password rejected.<br>✓ Dev response includes `devResetUrl` when provider is dev. |

#### FR-AUTH-07 — Role Handling & Guards

| Field | Detail |
|-------|--------|
| **Shall** | Every authed route shall resolve `user` from verified JWT + DB row; admin routes additionally call `requireAdmin(request)` (401 if unauthenticated, 403 if `role !== admin`) `src/server/admin-auth.ts`. Client `AuthProvider` (`src/lib/auth.tsx`) mirrors `ROLE_LABELS` for UX. |
| **Acceptance** | ✓ `/dashboard` and `/onboarding` middleware redirect unauthenticated to `/login`.<br>✓ `artist` cannot hit `/api/admin/*` (403).<br>✓ `requireAdmin` is called first in every admin handler before any DB read. |

---

### 5. FR-02 Catalog & Discovery

#### FR-CAT-01 — Public Artist Listing

| Field | Detail |
|-------|--------|
| **Endpoint** | `GET /api/artists?query=&state=&area=&bridal=&nonBridal=&budget=` (plus `/api/catalog/artists` wrapper for client components) |
| **Processing** | `artistsQuerySchema` `src/server/validation.ts:52` validates; `listArtists(filters)` `src/server/catalog.ts:198` does SQL `WHERE state=? AND area=? AND price_from<=?` (indexed `idx_artists_state_area`), then `filterArtists()` for `query` (name/tagline/bio/specialties), `bridal`/`nonBridal !== "any"`, and `date` available. `listAllArtists({limit,offset})` caps at 500. |
| **Priority** | Must |
| **Acceptance** | ✓ Filter by Selangor returns only Selangor artists.<br>✓ Budget filters `price_from <= budget` when `budget>0`.<br>✓ Empty result set returns `[]` not error.<br>✓ Pagination `{limit,offset}` respected and clamped (1–500). |

#### FR-CAT-02 — Artist/Studio Detail Resolution

| Field | Detail |
|-------|--------|
| **Shall** | The system shall resolve an artist by slug first then by id: `resolveArtist(idOrSlug) = getArtistBySlug || getArtistById` (`src/server/catalog.ts:256`). Same for studios (`resolveStudio`). `slug` equals legacy id for seeded rows (e.g. `aisha-azman`) so old links keep working. |
| **Routing** | `src/app/artists/[slug]/page.tsx` and `src/app/studios/[slug]/page.tsx` are `force-dynamic` (no stale static). |
| **Acceptance** | ✓ `/artists/aisha-azman` resolves seeded artist.<br>✓ Unknown slug returns 404 via `notFound()` (not 200 shell — no root loading boundary).<br>✓ Admin-created artists with UUID `id` resolve by `slug` and `id`. |

#### FR-CAT-03 — State→Area Cascading & Validation

| Field | Detail |
|-------|--------|
| **Constants** | `MALAYSIA_STATES` (16 entries), `AREAS_BY_STATE` mapping `src/lib/data.ts:3`, `BRIDAL_EVENTS` (5), `NON_BRIDAL_EVENTS` (6). |
| **Processing** | Client (`ArtistsBrowser`) cascades area list when state selected; server validates `state ∈ MALAYSIA_STATES` and `area` string ≤80; `bridal ∈ BRIDAL_EVENTS.id`, `nonBridal ∈ NON_BRIDAL_EVENTS.id`. |
| **Priority** | Must |
| **Acceptance** | ✓ Invalid `state` returns 400 zod error; area not required when state absent. |

#### FR-CAT-04 — Catalog Mutations (Admin & Self-Service)

| Field | Detail |
|-------|--------|
| **Admin** | `PATCH/POST /api/admin/artists` and `/api/admin/studios` via `updateArtist()/updateStudio()` with whitelists `ARTIST_UPDATE_FIELDS`/`STUDIO_UPDATE_FIELDS` `src/server/catalog.ts:305`; JSON fields stringified; `updated_at=now`. `createArtist()/createStudio()` derive de-duplicated `slug` via `slugifyName()`, assign referral code, optionally link `referralCode`. |
| **Self-service** | `PATCH /api/artist-profiles` for claimed artists — same field whitelist minus `verified`/`referralEarnings` (audit). |
| **Acceptance** | ✓ Unauthorized field names are ignored (not error, not written).<br>✓ Empty src uses `/images/hero.jpg` placeholder (prevents next/image crash).<br>✓ Mutations appear immediately due to `force-dynamic` (no CDN stale). |

---

### 6. FR-03 Booking Lifecycle

#### FR-BOOK-01 — Create Booking

| Field | Detail |
|-------|--------|
| **Endpoint** | `POST /api/bookings` — auth required |
| **Input** | `bookingSchema` `src/server/validation.ts:19` — `artistId` (min1), `service` (min1), `date` `YYYY-MM-DD` regex, `date >= today`, `time` min1, `notes` ≤2000, `eventType` 1–80, `venue` ≤200, `guestCount` 0–1000 |
| **Processing** | Resolve `artist` via `getArtistById(artistId)` else 404; verify `service ∈ artist.services[].name` else 400; construct `BookingRow` with `artist_name=artist.name`, `price=serviceDef.price` (server-derived), `status='requested'`; pre-check `SELECT id FROM bookings WHERE artist_id=? AND date=? AND time=? AND status IN (requested,accepted,confirmed)` → 409 if exists; then `INSERT` with race guard catching `UNIQUE`/`duplicate key` → 409; `notifyBookingCreated()` emails; Agnost `booking-create` begin/end; return `serializeBooking()` |
| **Pre** | User authed; if `!email_verified`, log info but allow (gate moved to payment); `artistId` exists; slot free |
| **Post** | Row `bookings.id=randomUUID()` created; response `201 {booking,user}` |
| **Priority** | Must |
| **Acceptance** | ✓ Client-sent price/duration ignored; server resolves from catalog.<br>✓ Past date rejected (zod refine).<br>✓ Concurrent double-book race returns 409 (never 500) — unique partial index is hard guarantee.<br>✓ Cancelled/completed slots don't block (`WHERE status IN (...)`). |

#### FR-BOOK-02 — List Bookings (Scoped)

| Field | Detail |
|-------|--------|
| **Endpoint** | `GET /api/bookings?limit=&offset=` — auth required |
| **Processing** | If `role ∈ (artist,studio)`: fetch `getClaimedArtistIds(user.id)` + `getClaimedStudioIds(user.id)`; `claimed = studioIds.length>0 ? studioIds : artistIds` when `role=studio`; `column = studioIds.length>0?"studio_id":"artist_id"`; if `claimed.length==0` → `bookings=[]`; else `SELECT * FROM bookings WHERE ${column} IN (?) ORDER BY date DESC,time DESC LIMIT ? OFFSET ?` plus count query. If customer: `WHERE user_id=?`. Serialize each via `serializeBooking()` (fetch deposit/balance payments, active quotation, balanceDueDate/balanceAmount). Pagination envelope `{bookings, pagination:{total,limit,offset,hasMore}}`. `limit` default 20 max 100. |
| **Acceptance** | ✓ Artist sees only bookings for profiles they claimed (empty when none claimed).<br>✓ Customer sees only own `user_id` bookings.<br>✓ Studio with `studio_id` claim sees studio bookings; fallback to `artist_id` for legacy claims. |

#### FR-BOOK-03 — Booking State Transitions

| Field | Detail |
|-------|--------|
| **Endpoint** | `PATCH /api/bookings/[id] {action: "accept"|"reject"|"complete"|"cancel"}` — auth required |
| **State Machine** | `applyBookingTransition(current, action, {isOwner, role})` `src/server/bookings.ts:40`:<br>• `accept`: only artists, only from `requested` → `accepted`<br>• `reject`: only artists, only from `requested` → `cancelled`<br>• `complete`: only artists, only from `confirmed` → `completed`<br>• `cancel`: from non-terminal (`!completed && !cancelled`), requires `isOwner || artist` → `cancelled`<br>`confirmOnFeePaid(current)`: only from `accepted` → `confirmed` (webhook only; not exposed via this PATCH). |
| **Acceptance** | ✓ Artist `reject` on `accepted` returns error "Only requested…".<br>✓ Customer `accept` returns "Only artists…".<br>✓ Double `cancel` on `cancelled` returns "no longer be cancelled".<br>✓ Admin cannot bypass machine (admin uses separate `/api/admin/bookings` override). |

#### FR-BOOK-04 — Booking Serialization & Derived Fields

| Field | Detail |
|-------|--------|
| **Shall** | Every booking read shall be serialized via `serializeBooking(b: BookingRow)` `src/app/api/bookings/route.ts:32`: fetch `getPaymentForBooking(b.id,'deposit')` + `'balance'`, `getActiveQuotation(b.id)`, `getBookingFeeSen()`, `balanceDueDate = eventDate - 3d` (ISO), `totalPrice = quotation?.status==='expired'?null:quotation.total`, `balanceAmount = max(0,total - fee)`. Return `{id,artistId,studioId,artistName,service,price,date,time,notes,status,eventType,venue,guestCount,quotation,totalPrice,balanceDueDate,balanceAmount,payment,balancePayment}`. |
| **Acceptance** | ✓ `balanceAmount` never negative.<br>✓ Expired quotation yields `totalPrice=null` (not stale total).<br>✓ When no quotation, `totalPrice=null`. |

---

### 7. FR-04 Quotations

#### FR-QUO-01 — Create / Re-quote

| Field | Detail |
|-------|--------|
| **Endpoint** | `POST /api/bookings/[id]/quotation` — claimed artist only; booking must be `accepted` |
| **Input** | `quotationSchema` `src/server/validation.ts:34` — `baseFee` 0–10M sen int, `travelFee/earlyCallFee/accommodationFee` optional 0–10M, `extras` ≤10 items `{label 1–80, amount 0–10M}`, `artistNote` ≤1000 |
| **Processing** | Validate ownership via claimed ids; check booking `status==='accepted'`; `quotationTotal(input)` sums all line items; supersede: `UPDATE quotations SET status='superseded' WHERE booking_id=? AND status='pending'`; create row `id=randomUUID(), status='pending', created_at=now, expires_at=now+24h`; `bind(row)` insert; notify `notifyQuotationSent` email; Agnost `quotation` event. |
| **Post** | `201 {quotation: serializeQuotation(row)}` |
| **Acceptance** | ✓ Amounts outside 0–10M rejected.<br>✓ 11th extra rejected (max 10).<br>✓ Previous `pending` becomes `superseded` atomically before insert.<br>✓ Unknown booking 404; not-claimed 403; wrong status 400. |

#### FR-QUO-02 — Expiry Semantics

| Field | Detail |
|-------|--------|
| **Shall** | Per `src/server/quotations.ts:13`, `QUOTATION_TTL_MS=24h`. `isQuotationExpired(row)` checks `status==='pending' && expires_at < now`. `getActiveQuotation(bookingId)` lazily marks expired to `'expired'` on read; `findExpiredQuotations()` + `markQuotationExpired()` support cron sweep. Client shows countdown from `createdAt/expiresAt`; `totalPrice` nulled when expired; artist sees "Send new quotation" when `accepted && expired`. |
| **Acceptance** | ✓ Quotation older than 24h reads as `expired` and stays `expired`.<br>✓ Re-quote after expiry succeeds (supersede not needed when previous is `expired`). |

---

### 8. FR-05 Payments (Hybrid Deposit/Balance)

#### FR-PAY-01 — Payment Types & Schema

| Field | Detail |
|-------|--------|
| **Schema** | `payments(id TEXT PK, booking_id FK ON DELETE CASCADE, type TEXT CHECK(deposit,balance) DEFAULT deposit, amount INTEGER, currency MYR, provider dev|billplz, status required|paid|failed|refunded, provider_ref, provider_url, created_at, updated_at)` with `UNIQUE(booking_id,type)` `uq_payments_booking_type` and `CASCADE` semantics `src/server/db.ts:318`. `PaymentRecord` type `src/server/payments.ts:32`. |
| **Invariants** | One deposit and at most one balance per booking, never two of same type (DB unique). `amount` stored in sen. `provider_url` is Billplz hosted page URL (nullable). |
| **Acceptance** | ✓ Duplicate `INSERT (booking_id,type)` violates unique index.<br>✓ Deleting booking cascades delete payments. |

#### FR-PAY-02 — Create Deposit Payment (pay-fee)

| Field | Detail |
|-------|--------|
| **Endpoint** | `POST /api/bookings/[id]/pay-fee {turnstileToken?}` — customer who owns booking; booking `status==='accepted'`; quotation `pending` or already expired? (re-quote path). |
| **Processing** | Verify ownership + `email_verified` (gate at payment, see `src/app/api/bookings/route.ts:161` comment — unverified allowed at request but **blocked or warned** at fee); `getBookingFeeSen()` default 5000 sen; check no existing `payments(type=deposit,status IN (required,paid))` already; call `createBookingPayment(bookingId,'deposit',amountSen)` which branches on `activePaymentProvider()` (`BILLPLZ_API_KEY && COLLECTION_ID ? billplz:dev`). `billplzPayment`: fetch owner name/email, POST `${BILLPLZ_API}/bills` with Basic auth, fields `collection_id,name,email,mobile,amount,description,callback_url,redirect_url,reference_1=bookingId`; parse `{id,url}`; `insertPayment({...status='required',provider='billplz',provider_ref=id,provider_url=url})`; return `{id,amount,provider,reference,url}`. `devPayment`: synthesize `provider_ref=dev_…`, insert `status='required'`. For dev/e2e, immediately `markBillPaid(billId)` + `handlePaymentPaid` to auto-confirm. Rate-limit + optional Turnstile verify. |
| **Responses** | `200 {payment:{amount,type,status,provider,reference,url}}` plus `booking:{status}` after dev auto-settlement (`confirmed`). |
| **Acceptance** | ✓ Amount equals `getBookingFeeSen()` (not client-provided).<br>✓ Billplz failure (`!res.ok || !body.id`) throws "Failed to create payment" and logs (`pino.error`).<br>✓ Dev path is synchronous await (row durable before webhook reads).<br>✓ Second `pay-fee` on same booking returns 409 ("deposit already required/paid"). |

#### FR-PAY-03 — Create Balance Payment (pay-balance)

| Field | Detail |
|-------|--------|
| **Endpoint** | `POST /api/bookings/[id]/pay-balance` — owner, booking `status==='confirmed'`, active quotation `total` exists and not `expired`. |
| **Processing** | Mirror `pay-fee` but `type='balance'` and `amount = max(0, quotation.total - bookingFeeSen)`. If `balanceAmount==0` → return informative error or treat as no-op paid. Create `payments(type=balance)` via `createBookingPayment`. Dev auto-settles similarly and triggers `handlePaymentPaid` → `createPayoutForBooking`. |
| **Acceptance** | ✓ Amount derived `(quotation.total - deposit)` never client-supplied.<br>✓ No active quotation or expired → 400.<br>✓ 0 balance edge case handled (commission + fee covers total). |

#### FR-PAY-04 — Billplz Webhook

| Field | Detail |
|-------|--------|
| **Endpoint** | `POST /api/payments/webhook` — public, but HMAC-protected |
| **Processing** | Read raw body string (NOT parsed JSON) for `verifyBillplzSignature(rawBody, X-Billplz-Signature, API_KEY)` `src/server/payments.ts:381`: check header present, hex64 regex, `HMAC-SHA256(apiKey, rawBody).hex`, `timingSafeEqual` buffers; if false → `401` and no state change. On pass: parse JSON fields, `billId = body.id`, `getPaymentForBill(billId)` else 404; `markBillPaid(billId)` (`UPDATE payments SET status='paid'` where `provider_ref=billId`); `handlePaymentPaid(payment)`: if `deposit` → `confirmOnFeePaid(booking.status)` → `UPDATE bookings SET status='confirmed'` if ok; if `balance` → `UPDATE quotations SET status='paid'` + `createPayoutForBooking(...)`. Idempotent (re-delIVERY no-op). Log via `pino`. |
| **Acceptance** | ✓ Missing/bad signature → 401; no DB write.<br>✓ Forged `paid:true` without valid HMAC is ignored.<br>✓ Replay of same bill id is idempotent (second `markBillPaid` still true but status stays paid).<br>✓ Signature over raw body (not pretty-printed JSON) — test with exact byte string. |

#### FR-PAY-05 — Refund (Balance Only)

| Field | Detail |
|-------|--------|
| **Endpoint** | `POST /api/bookings/[id]/refund` — customer who owns booking, or admin; booking `status==='cancelled'` |
| **Processing** | `getPaymentForBooking(bookingId,'balance')`; guard `type==='balance'` else "Only balance…"; guard `status==='paid'` else "Only paid balances…"; `amountSen=payment.amount`; if `provider==='billplz' && BILLPLZ_API_KEY && provider_ref` → `POST ${BILLPLZ_API}/bills/{provider_ref}/refund {amount, reason:"Booking cancelled"}` — on failure throw; then `UPDATE payments SET status='refunded'`. `provider='dev'` just marks refunded. Return updated payment. |
| **Acceptance** | ✓ Deposit row never refunded (guard).<br>✓ Unpaid balance → error.<br>✓ Billplz refund failure rolls back (not marked refunded). |

---

### 9. FR-06 Payouts & Commission

#### FR-PAYO-01 — Commission Computation

| Field | Detail |
|-------|--------|
| **Pure Function** | `computeCommission(totalSen, rateBps, waiverSen) → {totalSen, waived, commissionSen, artistNetSen}` `src/server/settings.ts:100` — `total=max(0,round(totalSen))`, `waived=total<waiver`, `commission=waived?0:round(total*rate/10000)`, `artistNetSen=total-commission`. |
| **Settings** | `getCommissionRateBps()` clamped 0–5000; `getCommissionWaiverSen()` ≥0; `DEFAULT_COMMISSION_RATE_BPS=1000`, `DEFAULT_COMMISSION_WAIVER_SEN=10000` `src/server/settings.ts:21`; 30s cache `src/server/settings.ts:25`. |
| **Acceptance** | ✓ `computeCommission(50_00,1000,10000)` → waived true, commission 0.<br>✓ `computeCommission(100000,1000,10000)` → 10000 commission.<br>✓ Negative inputs clamped to 0.<br>✓ Rate 6000 clamped to 5000. |

#### FR-PAYO-02 — Payout Creation

| Field | Detail |
|-------|--------|
| **Function** | `createPayoutForBooking(bookingId, {artistId,eventDate,quoteTotalSen})` `src/server/payouts.ts:56` — idempotent: if `SELECT * FROM payouts WHERE booking_id=?` exists return it; else fetch `rateBps,waiverSen,depositSen` in parallel; `breakdown=computeCommission(...)`; `artistReceives=max(0, breakdown.artistNetSen - depositSen)`; `settleableAt = eventDate? eventDateT00:00+24h ISO : null`; `artistUserId = SELECT user_id FROM artist_profiles WHERE artist_id=?` else null; `INSERT payouts(id,artist_user_id,booking_id,gross,commission,net,status=pending,settleable_at,settled_at null, notes=waived?"Commission waived":null, created_at)`; `pino.info`. |
| **Trigger** | Called only from `handlePaymentPaid` when `type==='balance'` is paid (never from deposit). |
| **Acceptance** | ✓ Second call with same bookingId returns existing row (no duplicate).<br>✓ `net = gross - commission - deposit` (e.g. 100k-10k-5k=85k).<br>✓ Unclaimed artist → `artist_user_id=null` still creates payout.<br>✓ `settleable_at` exactly 24h after event date midnight UTC. |

#### FR-PAYO-03 — Payout Administration

| Field | Detail |
|-------|--------|
| **Endpoints** | `GET /api/admin/payouts?status=` (optional filter), `PATCH /api/admin/payouts {payoutId, status:'settled'|'failed', notes?}` — admin only |
| **Processing** | `listPayouts(status?)` joins `payouts JOIN bookings` for display; `updatePayoutStatus(id, status, notes)` does `UPDATE payouts SET status=?, settled_at=(settled?now:null), notes=COALESCE(?,notes) WHERE id=?`; returns row or 404. Caller (`/api/admin/payouts` route) calls `logAdminAction` after. |
| **Acceptance** | ✓ Non-admin → 403.<br>✓ Missing payout → 404.<br>✓ Settled row gets `settled_at` ISO; `failed` gets `settled_at null`. |

---

### 10. FR-07 Reviews & Ratings

#### FR-REV-01 — Add Review

| Field | Detail |
|-------|--------|
| **Endpoint** | `POST /api/artists/[slug]/reviews {rating 1-5, text, event?}` — auth required? (customer) |
| **Types** | `Review` `src/lib/types.ts:15` `{id,author,rating,date,text,event}`; `NewReviewInput` `src/server/catalog.ts:580` adds `entityType,entityId,bookingId,userId` |
| **Processing** | `addEntityReview(input)` `src/server/catalog.ts:633`: if `bookingId` provided, guard `SELECT id FROM reviews WHERE booking_id=?` → throw `ALREADY_REVIEWED` if exists; `INSERT reviews(id,entity_type,entity_id,booking_id,user_id,author_name,rating,event,text,created_at)` with `rating=round(rating)`; then `blendAggregate(entityType,entityId,rating)`; fetch back and map via `rowToPublicReview`. |
| **Acceptance** | ✓ Duplicate `bookingId` review → error `ALREADY_REVIEWED` (409).<br>✓ Rating rounded to int server-side.<br>✓ Review appears via `listEntityReviews(entityType,entityId)` ordered `created_at DESC`. |

#### FR-REV-02 — Gate Review Eligibility

| Field | Detail |
|-------|--------|
| **Function** | `findReviewableBooking(userId, entityType, entityId)` `src/server/catalog.ts:678`: currently only `entityType==='artist'` supported (studio returns null). Query: `SELECT b.id FROM bookings b LEFT JOIN reviews r ON r.booking_id=b.id WHERE b.user_id=? AND b.artist_id=? AND b.status='completed' AND r.id IS NULL ORDER BY b.date DESC LIMIT 1`. |
| **Acceptance** | ✓ Completed booking without review → row returned.<br>✓ Pending/accepted/confirmed booking → null.<br>✓ Already-reviewed booking → null (JOIN finds r.id).<br>✓ Studio entity → null (explicit). |

#### FR-REV-03 — Atomic Rating Blend

| Field | Detail |
|-------|--------|
| **Function** | `blendAggregate(entityType,entityId,rating)` `src/server/catalog.ts:615`: `UPDATE artists|studios SET review_count=review_count+1, rating=ROUND(((rating*review_count)+?)/(review_count+1),2), updated_at=now WHERE id=?` — single statement. |
| **Acceptance** | ✓ Concurrent reviews don't lose updates (no read-modify-write).<br>✓ Rating rounded 2dp via `ROUND(...,2)` (both PG + SQLite).<br>✓ New `review_count` is old+1, new rating correctly weighted. |

---

### 11. FR-08 Messaging & Chat

#### FR-MSG-01 — Persist Messages

| Field | Detail |
|-------|--------|
| **Table** | `messages(id TEXT PK, booking_id FK CASCADE, sender_id FK CASCADE, body TEXT, created_at TEXT)` |
| **Endpoints** | `GET /api/bookings/[id]/messages` (participants only) and `POST /api/bookings/[id]/messages {body}` |
| **Processing** | Authz: `user_id===booking.user_id` OR `artist_id ∈ claimedArtists/user`; if not participant → 403. POST sanitizes `body` trim, non-empty, ≤2000?; `INSERT messages(randomUUID, booking_id, sender_id=user.id, body, created_at=now)`; publish to `chat-bus` for SSE. GET returns ordered `created_at ASC`. |
| **Acceptance** | ✓ Third user who is neither owner nor claimed artist is blocked (403).<br>✓ Empty body rejected 400.<br>✓ Message appears immediately on GET. |

#### FR-MSG-02 — Live Streaming (SSE)

| Field | Detail |
|-------|--------|
| **Endpoint** | `GET /api/bookings/[id]/messages/stream` — `text/event-stream` |
| **Processing** | Authz same as FR-MSG-01; handler replays history (`SELECT * FROM messages WHERE booking_id=? ORDER BY created_at ASC`) as `data: JSON{ id,senderName,body,createdAt }` events, then subscribes to `src/server/chat-bus.ts` in-memory pub/sub for new messages on that booking channel; keepalive every 30s. |
| **Acceptance** | ✓ New browser joining stream receives history then live frames.<br>✓ Disconnect + reconnect replays full history (no lost messages).<br>✓ Connection is authenticated (cookie same as HTTP routes). |

---

### 12. FR-09 Profile Claim & Self-Service

#### FR-CLAIM-01 — Claim a Catalog Profile

| Field | Detail |
|-------|--------|
| **Endpoint** | `POST /api/artist-profiles {artistId}` — role must be `artist|studio`; one claim per `user_id`. |
| **Table** | `artist_profiles(user_id PK FK users, artist_id UNIQUE, claimed_at)` + parallel `studio_profiles` |
| **Processing** | Check `role ∈ (artist,studio)` else 403; validate `artistId` exists in `artists` (or studios for studio role); check not already claimed globally (`uq_artist_profiles_artist_id`); then `INSERT` and return `profile`. Emits claim event for admin. |
| **Acceptance** | ✓ Customer role cannot claim (403).<br>✓ Already claimed `artist_id` returns 409.<br>✓ Second claim by same `user_id` violates PK → 409 (one profile per account). |

#### FR-CLAIM-02 — Fetch Claimed Profile

| Field | Detail |
|-------|--------|
| **Endpoint** | `GET /api/artist-profiles` — authed |
| **Processing** | `SELECT artist_id FROM artist_profiles WHERE user_id=?` (and studio equivalent); if studio role prefer `studio_profiles` fallback to `artist_profiles` (shared table history). Return `profile:null` when none claimed; else `{artistId, artistName}`. |
| **Acceptance** | ✓ Customer with no claim → `{profile:null}` (not 404).<br>✓ Claimed artist sees own name. |

#### FR-CLAIM-03 — Self-Service Profile Edits

| Field | Detail |
|-------|--------|
| **Endpoint** | `PATCH /api/artist-profiles {updates}` — claimed artist only |
| **Processing** | Load claimed `artistId` for caller; apply via `updateArtist(artistId, updates)` with whitelisted `ARTIST_UPDATE_FIELDS` subset for self-service (exclude `verified`/`referralEarnings`). Validate fields server-side (e.g. `priceFrom` 0–10M). Update `updated_at`. |
| **Acceptance** | ✓ Unclaimed artist → 403.<br>✓ Field `verified` silently ignored (cannot self-verify).<br>✓ Admin edits via `/api/admin/artists` can set all fields including `verified`. |

---

### 13. FR-10 Admin Panel & Audit

#### FR-ADM-01 — Guard

| Field | Detail |
|-------|--------|
| **Server guard** | `requireAdmin(request)` `src/server/admin-auth.ts` — extracts `leish_session`, `verifySessionToken`, loads `users` row, checks `role==='admin'`; returns `401 jsonError("Not authenticated")` or `403 jsonError("Forbidden")`. |
| **Layout guard** | `src/app/admin/layout.tsx` does same server-side before render and redirects non-admins; `AdminShell` provides sidebar + drawer. |
| **Seed** | `scripts/seed-admin.ts` idempotent: `ADMIN_EMAIL/ADMIN_PASSWORD` creates user with `role='admin'` or upgrades existing `users.role` to admin. |
| **Acceptance** | ✓ Non-admin direct API call blocked (not just UI hidden).<br>✓ Audit of failed admin attempt not required but recommendation logged. |

#### FR-ADM-02 — Admin CRUD (Overview)

| Resource | Endpoints (under `src/app/api/admin/*`) | Allowed Operations | Audit |
|----------|------------------------------------------|-------------------|-------|
| **Dashboard** | `GET /api/admin` | Read aggregates: users by role, bookings by status, payments total/paid/required/revenue, `artistProfiles` count, recentBookings (10), recentAudit (10) | No |
| **Users** | `GET/POST /api/admin/users`, `PATCH/DELETE /api/admin/users/[id]` | Full CRUD (never expose password hash) | Yes — every mutation |
| **Artists** | `GET/POST /api/admin/artists`, `PATCH /api/admin/artists/[id]` | Create via `createArtist`, update via `updateArtist` (all whitelisted fields + `verified`) | Yes |
| **Studios** | Mirrors Artists | Same via `createStudio`/`updateStudio` | Yes |
| **Bookings** | `GET /api/admin/bookings`, `PATCH /api/admin/bookings/[id]` | Admin status override + notes | Yes |
| **Payments** | `GET /api/admin/payments` | List + filter by booking/user | No |
| **Payouts** | `GET/PATCH /api/admin/payouts` | See FR-PAYO-03 | Yes |
| **Quotations** | `GET /api/admin/quotations` | List + expire sweep trigger | No |
| **Messages** | `GET /api/admin/messages` | Read all booking threads | No |
| **Emails** | `GET /api/admin/emails` | View `email_outbox` + retries | No |
| **Audit** | `GET /api/admin/audit` | List `admin_audit_log` ordered desc | No |
| **Settings** | `GET/PATCH /api/admin/settings` | `platform_settings` CRUD | Yes |
| **Analytics** | `GET /api/admin/analytics` | Agnost rollups if configured | No |

**Conventions** — Admin pages (`src/app/admin/*`) are `"use client"` and fetch from `/api/admin/*` via `.then()` chains (never synchronous `setState` in effect body per `react-hooks/set-state-in-effect` rule).

#### FR-ADM-03 — Audit Log

| Field | Detail |
|-------|--------|
| **Table** | `admin_audit_log(id TEXT PK, admin_user_id FK users ON DELETE SET NULL, action TEXT, target_table TEXT, target_id TEXT, details TEXT JSON default '{}', created_at TEXT)` with indexes `idx_audit_log_admin`, `idx_audit_log_created`. |
| **Helper** | `logAdminAction({adminUserId, action, targetTable, targetId, details})` — called after every successful admin mutation; failure to log shall not roll back the mutation but shall emit `pino.error`. |
| **FK Note** | `admin_user_id` has real FK to `users(id)` — integration tests must seed a user row before writing audit entries; otherwise foreign key violation. |
| **Acceptance** | ✓ Admin `PATCH /api/admin/artists/[id]` creates audit row with `action='update'` + `target_table='artists'`.<br>✓ Deleting the admin user sets `admin_user_id` to null (`SET NULL`) not cascade delete. |

#### FR-ADM-04 — Settings Administration

| Field | Detail |
|-------|--------|
| **Keys** | `booking_fee_sen`, `commission_rate_bps`, `commission_waiver_sen` (+ extensible others like `platform_name`, `support_email` may be added). |
| **Endpoint** | `PATCH /api/admin/settings {key,value}` — validate `value` is numeric within allowed ranges; write `platform_settings(value, updated_by=adminUserId, updated_at=now)` with `INSERT … ON CONFLICT(key) DO UPDATE`. Invalidate cache `clearSettingsCache()` effect via next read (30s TTL expiry). |
| **Acceptance** | ✓ Invalid key/value returns 400 validation error.<br>✓ Changes take effect within 30s (cache TTL) without redeploy.<br>✓ Setting read failure always falls back to default (never breaks payments). |

---

### 14. FR-11 Email & Notifications

#### FR-MAIL-01 — Provider Abstraction

| Field | Detail |
|-------|--------|
| **Module** | `src/server/email.ts` `sendEmail({to, subject, text, html})` — selects `EMAIL_PROVIDER` env (default `dev`):<br>• `dev`: `INSERT email_outbox(id,to_email,subject,text,html,created_at)` and return dev link.<br>• `resend`: POST Resend API with `RESEND_API_KEY`, `EMAIL_FROM`.<br>• `postmark`: POST Postmark with `POSTMARK_SERVER_TOKEN`.<br>• `brevo`: POST Brevo with `BREVO_API_KEY`.<br>Missing creds for selected provider → fallback to dev outbox + `pino.warn` (never silent). |
| **Acceptance** | ✓ Unknown `EMAIL_PROVIDER` falls back to dev.<br>✓ `EMAIL_FROM` default is `Leish! <no-reply@leish.my>`.<br>✓ Dev outbox viewable at `/dev/emails` (only non-production). |

#### FR-MAIL-02 — Booking Emails

| Field | Detail |
|-------|--------|
| **Module** | `src/server/booking-emails.ts` composes all transactional copy: `notifyBookingCreated`, `notifyQuotationSent`, `notifyInvoiceSent`, `notifyQuotationExpiry`, `notifyBalanceReminder`, `notifyStatusChanged`. |
| **Acceptance** | ✓ New booking triggers `booking_created` email to relevant party.<br>✓ Quotation triggers `quotation_sent`.<br>✓ Balance reminder (`POST /api/bookings/[id]/remind` from confirmed bookings) respects `email_preferences.balance_reminder`. |

#### FR-MAIL-03 — Preferences & Retries

| Field | Detail |
|-------|--------|
| **Preferences** | `email_preferences(user_id PK FK, booking_created, quotation_sent, invoice_sent, quotation_expiry, balance_reminder, status_changed INTEGER 0/1, updated_at)` default `1` for each; `PATCH /api/email/preferences` upserts. |
| **Retries** | `email_retries(id,to_email,subject,text,html,attempts,max_attempts=3,next_retry,last_error,created_at)` — on send failure, row inserted with `next_retry = now + backoff`; cron retries via `src/app/api/cron/*` guarded by `CRON_SECRET`. |
| **Acceptance** | ✓ User can toggle each preference off and stop receiving that class.<br>✓ Retry attempts capped at 3, then dropped with logged error. |

---

### 15. FR-12 Dashboard & UX

#### FR-DASH-01 — Client Dashboard

| Field | Detail |
|-------|--------|
| **Route** | `/dashboard` — client-only (`"use client"`), requires auth else CTA "Please sign in". |
| **Data** | Fetches `GET /api/bookings` + `GET /api/catalog/artists` + `GET /api/artist-profiles` in effects with `.then()` chains; shows banners (verify email), stats (customer stats hidden; MUA stats: requests count, quotations open, confirmed, earnings paid/pending). |
| **Views** | For each booking card: avatar, service · price · eventType, status badges (`requested` amber, `accepted` sky, `confirmed` emerald, `completed` stone, `cancelled` red), payment badge, fee `fee {status}`, quotation block (lines + totals + 24h expiry), chat thread, actions: cancel / pay-fee / pay-balance / refund / invoice / send-reminder (role-aware). Invoices link to HTML + PDF. |
| **Acceptance** | ✓ Unverified customer sees amber banner with resend (idle/sending/sent).<br>✓ `GET /api/bookings` failure shows empty state with correct CTA per role.<br>✓ Stats compute correctly from `bookings + payments + quotations`. |

#### FR-DASH-02 — Artist Claim UI

| Field | Detail |
|-------|--------|
| **Block** | Visible when `role ∈ (artist,studio)`; reads `GET /api/artist-profiles`; if null shows `<select>` populated from `/api/catalog/artists` and `POST /api/artist-profiles` on submit; after claim shows "You are managing “…“." + refresh. |
| **Acceptance** | ✓ Claimed profile id shown correctly.<br>✓ Select disabled until catalog loaded.<br>✓ Claim error surfaced as `role="alert"`. |

---

### 16. FR-13 Invoicing & Documents

#### FR-INV-01 — Printable Invoice (HTML) & PDF

| Field | Detail |
|-------|--------|
| **Endpoints** | `GET /api/bookings/[id]/invoice` (HTML) and `GET /api/bookings/[id]/invoice.pdf` (PDF via `pdf-lib`) |
| **Authz** | Owner or claimed artist/studio only; same guard as messaging. |
| **Content** | Header (Leish! branding), billing to client, artist + service + date/time + venue, quotation line items (base/travel/early-call/accommodation + extras), `booking_fee_sen` line, total, payment status per type, commission note when relevant. PDF rendered server-side (no browser print-sim needed). |
| **Acceptance** | ✓ Unauthorized returns 403.<br>✓ Invoice reflects server-computed `quotation.total`, not cached client price.<br>✓ PDF downloads with correct `Content-Disposition`. |

---

### 17. FR-14 Compliance & Data Rights

#### FR-COMP-01 — Data Export

| Field | Detail |
|-------|--------|
| **Endpoint** | `GET /api/me/export` — authed |
| **Processing** | Aggregates `users` public fields, `bookings`, `messages`, `payments`, `reviews`, `artist_profiles`, `email_preferences`; returns `application/json` blob with `Content-Disposition: attachment` named `leish-data-<id>.json`; used by `/dashboard` Export button. |
| **Acceptance** | ✓ Result is valid JSON containing all owned records.<br>✓ No other users' data leaked. |

#### FR-COMP-02 — Account Deletion

| Field | Detail |
|-------|--------|
| **Endpoint** | `DELETE /api/me?confirm=1` — authed, `confirm` required to avoid accidental hit |
| **Processing** | Confirm `confirm==1`; cascade delete via FK `ON DELETE CASCADE` for bookings/payments/quotations/messages/sessions; `ON DELETE SET NULL` for audit entries; remove user row; clear cookie; return 200. Dashboard confirm dialog requires explicit user confirmation. |
| **Acceptance** | ✓ Without `confirm=1` returns 400.<br>✓ After delete, login with same email fails (user gone).<br>✓ Audit log retains entry with `admin_user_id=null` (not lost). |

---

### 18. FR-15 Platform Settings & Ops

#### FR-OPS-01 — Settings Runtime

| Field | Detail |
|-------|--------|
| **Table** | `platform_settings(key TEXT PK, value TEXT, updated_by FK, updated_at TEXT)` |
| **Accessors** | `getSetting/getNumberSetting/getBookingFeeSen/getCommissionRateBps/getCommissionWaiverSen/clearSettingsCache` `src/server/settings.ts`. Cache 30s process-local. |
| **Acceptance** | ✓ Cache clears after `clearSettingsCache()` (used in tests).<br>✓ Read failure never throws — falls back to default and warns. |

#### FR-OPS-02 — Health & Cron

| Field | Detail |
|-------|--------|
| **Health** | `GET /api/health` → `{ok:true, db: "postgres"|"sqlite", env: "production"|…}`; Docker `HEALTHCHECK http://localhost:3000/api/health`. |
| **Cron** | `GET/POST /api/cron/*` (e.g. `expire-quotations`, `retry-emails`) guarded by `CRON_SECRET` bearer; Vercel Cron or external scheduler calls them. |
| **Acceptance** | ✓ Health returns 200 even when `DATABASE_URL` unset (sqlite mode).<br>✓ Cron without valid secret returns 401. |

#### FR-OPS-03 — Analytics (Agnost AI)

| Field | Detail |
|-------|--------|
| **Server** | `src/instrumentation.ts` initializes `agnostai` SDK with `AGNOST_ORG_ID`; every key route wraps with `agnost.begin({userId, agentName, input})` → `interaction.end(output, success)`: register, login, booking-create, booking-status update, quotation, payment webhook, profile edit. |
| **Client** | `src/lib/agnost-client.ts` `trackEvent`, `trackArtistView`, `trackSearch`, `trackBookingForm` called from `ArtistsBrowser` and booking/calendar components when `NEXT_PUBLIC_AGNOST_ORG_ID` set. |
| **Dashboard** | `https://app.agnost.ai/projects/3e27e121-654d-4746-ba55-7996f21bb351` |
| **Acceptance** | ✓ When `AGNOST_ORG_ID` missing, instrumentation is no-op (no crash).<br>✓ Tracking never leaks PII beyond userId/bookingId (hashed where needed). |

---

### 19. Summary Table & MoSCoW

| Module | FR IDs | Count | Must | Should | Could |
|--------|--------|-------|------|--------|-------|
| Auth | FR-AUTH-01..07 | 7 | 7 | — | — |
| Catalog | FR-CAT-01..04 | 4 | 4 | — | — |
| Booking | FR-BOOK-01..04 | 4 | 4 | — | — |
| Quotation | FR-QUO-01..02 | 2 | 2 | — | — |
| Payments | FR-PAY-01..05 | 5 | 5 | — | — |
| Payouts | FR-PAYO-01..03 | 3 | 3 | — | — |
| Reviews | FR-REV-01..03 | 3 | 3 | — | — |
| Messaging | FR-MSG-01..02 | 2 | 2 | — | — |
| Profile Claim | FR-CLAIM-01..03 | 3 | 3 | — | — |
| Admin | FR-ADM-01..04 | 4 | 4 | — | — |
| Email | FR-MAIL-01..03 | 3 | 2 | 1 | — |
| Dashboard | FR-DASH-01..02 | 2 | 1 | 1 | — |
| Invoicing | FR-INV-01 | 1 | — | 1 | — |
| Compliance | FR-COMP-01..02 | 2 | 2 | — | — |
| Ops | FR-OPS-01..03 | 3 | 2 | 1 | — |
| **Total** | | **48** | **42** | **4** | **—** |

All **Must** items constitute the launch gate. **Should** items are highly desired for launch but may slip to v2.1 without blocking.

---

### 20. Appendix — State Machines & Flows

#### 20.1 Booking Status State Machine (from `src/server/bookings.ts:1`)

```
                             applyBookingTransition()
                             ────────────────────────
   ┌──────────┐  accept (artist)   ┌──────────┐  confirmOnFeePaid (webhook)  ┌───────────┐  complete (artist)  ┌──────────┐
   │ requested│────────────────────▶│ accepted │─────────────────────────────▶│ confirmed │────────────────────▶│completed │
   └────┬─────┘                    └────┬─────┘                              └─────┬─────┘                     └──────────┘
        │ reject (artist)               │                                           │ cancel (owner|artist)
        │                               │ cancel (owner|artist)                     │
        ▼                               ▼                                           ▼
   ┌──────────┐                    ┌──────────┐                               ┌──────────┐
   │cancelled │◀───────────────────│cancelled │◀──────────────────────────────│cancelled │
   └──────────┘                    └──────────┘                               └──────────┘
 Terminal states: completed, cancelled (no further transitions)
 Only webhook can reach confirmed (client PATCH cannot).
```

#### 20.2 Quotation States

```
pending (24h TTL) ──supersede──▶ superseded
     │
     ├─expire (lazy or sweep)────────▶ expired ──(artist re-quote)──▶ new pending
     └─pay(balance)──▶ paid  (also moves booking toward payout)
```

#### 20.3 Payment Status

```
required ──(webhook paid / dev auto-settle)──▶ paid ──(cancel+refund)──▶ refunded
     │
     └─(webhook failed)──▶ failed
```

#### 20.4 Payout Status

```
pending (settleable_at = eventDate+24h) ──(admin settle)──▶ settled (settled_at=now)
                                     └─(admin fail)──▶ failed
```

---

*Next: `04-NFR-Non-Functional-Requirements.md` for measurable quality attributes, and `05-Use-Cases-and-User-Stories.md` for scenario-level acceptance.*
