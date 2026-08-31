# Use Cases & User Stories — Leish! v2

| Field | Value |
|-------|-------|
| **Document ID** | LEISH-UCS-v2.0 |
| **Version** | 2.0.0 |
| **Date** | 2026-08-29 |
| **Predecessor** | BRS (01), SRS (02), FRS (03) |
| **Notation** | UC-XX use cases (Cockburn), US-XX stories (INVEST) |

---

### 1. Use-Case Summary (Umbrella)

```
Actors: Guest ──▶ Customer ──▶ Artist ──▶ Studio ──▶ Admin ──▶ System/Cron
        │          │          │          │          │           │
        │          │          │          │          │           └─▶ Expire quotations
        │          │          │          │          │               Retry emails
        │          │          │          │          └─▶ Manage all + audit
        │          │          │          └─▶ Claim studio, same as Artist but studio_id
        │          │          └─▶ Claim artist, quote, complete
        │          └─▶ Book, pay, chat, review, export/delete
        └─▶ Browse, search, register
```

| ID | Use Case | Primary Actor | Priority |
|----|----------|---------------|----------|
| UC-01 | Register & Verify Email | Guest | Must |
| UC-02 | Login & Manage Session | Guest/Customer/Artist/Admin | Must |
| UC-03 | Reset Forgotten Password | Guest | Must |
| UC-04 | Discover Artists / Studios | Guest/Customer | Must |
| UC-05 | View Artist/Studio Detail & Reviews | Guest | Must |
| UC-06 | Submit Booking Request | Customer | Must |
| UC-07 | Accept / Reject Booking | Artist | Must |
| UC-08 | Build & Send Quotation | Artist | Must |
| UC-09 | Pay Deposit (Booking Fee) & Confirm | Customer | Must |
| UC-10 | Pay Balance (T-3d) & Trigger Payout | Customer | Must |
| UC-11 | Cancel Booking / Request Refund | Customer / Artist | Must |
| UC-12 | Complete Booking & Review | Customer / Artist | Must |
| UC-13 | Chat Per-Booking (Live SSE) | Customer / Artist | Must |
| UC-14 | Claim Artist/Studio Profile | Artist / Studio | Must |
| UC-15 | Manage Own Artist Profile (Self-Service) | Artist / Studio | Should |
| UC-16 | Admin Dashboard & User Management | Admin | Must |
| UC-17 | Admin Catalog & Booking Overrides | Admin | Must |
| UC-18 | Admin Payout Settlement | Admin | Must |
| UC-19 | Export Data & Delete Account (PDPA) | Customer | Must |
| UC-20 | Manage Email Preferences / View Outbox | Customer / Admin | Should |

---

### 2. Detailed Use Cases

#### UC-01 — Register & Verify Email

**Primary actor**: Guest
**Preconditions**: No active session; `LEISH_DB_PATH` reachable or PG available.
**Success guarantee**: Account created with role, `email_verified=0`, verification token stored hashed.

| Step | Actor | Action |
|------|-------|--------|
| 1 | Guest | Opens `/register`, chooses role (Client/Artist/Studio toggles), enters name/email/password, checks PDPA consent, optionally solves Turnstile. |
| 2 | Guest | Submits; client validates inline via `registerSchema`. |
| 3 | System | Validates zod, lowercases email, checks uniqueness, hashes with scrypt+pepper, inserts `users` + `email_verifications` (hashed token), sets `leish_session` JWT cookie, enqueues verification email (or writes `email_outbox`). |
| 4 | System | Redirects to `/dashboard`; banner "Verify your email" with resend button. |
| 5 | Guest | Opens email, clicks `/verify-email?token=…` |
| 6 | System | Validates single-use, non-expired; sets `email_verified=1`, marks `used_at`, redirects with success. |

**Alternate flows**:
- 1a Duplicate email → 409 generic error (no enumeration).
- 3a Email provider down → dev outbox + warn log; dashboard still shows `devVerifyUrl`.
- 5a Expired token → friendly "Link expired, request a new one."

**Acceptance**: See FRS FR-AUTH-01/05.

---

#### UC-02 — Login & Session

**Primary actor**: Any authed role
**Includes**: login, session refresh via middleware `proxy.ts`, logout/revocation.

| Step | Action |
|------|--------|
| 1 | User opens `/login` (or redirected from gated route with `?redirect=/dashboard`). |
| 2 | Enters email/password (+ Turnstile when configured). |
| 3 | System verifies scrypt+pepper, creates `sessions(jti,…)`, signs JWT, sets cookie. `agnost.begin(login)` ends success=true. |
| 4 | Redirect to `redirect` or `/dashboard` with role label. |
| 5 | Later: visits any route — `verifySessionToken` checks sig+expiry+revoked; protected routes (`/dashboard`,`/onboarding`,`/admin/*`) enforce via middleware layout. |
| 6 | Click Log out → `POST /api/auth/logout` → `UPDATE sessions SET revoked=1` + clear cookie → redirect `/`. |

**Alternate**: Wrong creds → 401 generic; rate-limited → 429 with Retry-After; revoked JTI → redirect to login.

---

#### UC-03 — Reset Forgotten Password

| Step | Action |
|------|--------|
| 1 | Guest on `/forgot-password` enters email (+ Turnstile). |
| 2 | System: rate-limit by IP, lookup user (always reply success-ish), if exists generate `password_resets` hashed token 1h, send email. |
| 3 | Guest clicks `/reset-password?token=…`, enters new password (8–128). |
| 4 | System verifies single-use + expiry, scrypt new hash, marks `used_at`, invalidates other reset tokens. Can now log in. |

**Alternate**: Expired token → error; reused token → `used_at` blocks.

---

#### UC-04 — Discover Artists / Studios

**Actors**: Guest / Customer
**Entry**: `/`, `/artists`, `/studios`

| Step | Action |
|------|--------|
| 1 | Page server-fetches `listAllArtists()` (DB-backed, `force-dynamic`) and renders `ArtistsBrowser`. |
| 2 | User interacts: type query (name/tagline/specialties), pick `state` (cascades `area` list from `AREAS_BY_STATE`), pick `bridal`/`nonBridal` tag, set `budget`, pick `date`. `trackSearch/trackArtistView` fire via `agnost-client` when configured. |
| 3 | System: `artistsQuerySchema` validates → `listArtists(filters)` SQL pre-filters `state/area/budget` then `filterArtists` for remaining predicates — returns ranked by `rating DESC`. |
| 4 | User sees filtered cards (`ArtistCard`) with image, rating, priceFrom, area; clicks → `/artists/[slug]`. |
| 5 | Empty result → friendly "No artists found, try adjusting filters." |

---

#### UC-05 — View Artist/Studio Detail

| Step | Action |
|------|--------|
| 1 | User opens `/artists/aisha-azman` (slug==legacy id). Server resolves `resolveArtist(slug)` → `rowToArtist` + `listEntityReviews`. |
| 2 | Page shows bio, specialties tags, services table (name/price/duration), portfolio carousel, availability slots, reviews (`RatingStars`), "Book Now" CTA. |
| 3 | "Book Now" requires auth → if guest → redirect `/login?redirect=/artists/[slug]/book`. |

**Alternate**: Unknown slug → `notFound()` true 404 (no shell 200).

---

#### UC-06 — Submit Booking Request

**Primary actor**: Customer (verified for next step, but request allowed even if unverified per FRS FR-BOOK-01)
**Entry**: `/artists/[slug]/book` or booking modal on detail page.

| Step | Action |
|------|--------|
| 1 | Customer picks `service` (from artist.services), `date` (≥today, datepicker), `time` (slot), enters `eventType` (select—bridal/nonBridal taxonomy), `venue`, `guestCount`, `notes`. |
| 2 | Validates `bookingSchema`; client price hidden (server resolves). |
| 3 | Submits `POST /api/bookings`; system pre-checks slot, inserts `bookings(status=requested)`, emails artist, Agnost `booking-create`. |
| 4 | Redirect to `/dashboard` where booking appears `requested` amber badge. |

**Alternates**:
- 3a Slot taken (unique index race) → 409 "just been taken, pick another time".
- 3b Past date → 400 "Date cannot be in the past".
- 3c Invalid service → 400 "Service not available for this artist".

---

#### UC-07 — Accept / Reject Booking

**Primary actor**: Artist (claimed)

| Step | Action |
|------|--------|
| 1 | Artist sees `requested` bookings in dashboard filtered to claimedIds. |
| 2 | Clicks **Accept** → `PATCH /api/bookings/[id] {action:"accept"}` → `applyBookingTransition(requested,accept,{role:artist})` checks `isArtist` true and `current===requested` → `accepted`; or **Reject** → `cancelled` (terminal). |
| 3 | System updates row, optionally emails customer, shows new badge (sky `accepted` or red `cancelled`). |

**Alternates**: Customer trying accept → "Only artists…"; accept on non-requested → error.

---

#### UC-08 — Build & Send Quotation

**Primary actor**: Artist (claimed), booking must be `accepted` and not already pending quote (re-quote supersedes).

| Step | Action |
|------|--------|
| 1 | Artist on booking card `accepted` without quotation sees "Build & send quotation"; clicks opens form. |
| 2 | Enters `baseFee` (required), optional `travelFee/earlyCallFee/accommodationFee`, adds ≤10 extras (label+amount), optional `artistNote`. Preview total auto-summed. |
| 3 | POST `/api/bookings/[id]/quotation` → system computes `quotationTotal()`, supersedes prior `pending`, inserts with `expires_at=now+24h`. |
| 4 | Customer dashboard now shows quotation breakdown, total, expiry countdown; server computed `balanceAmount = total - fee` and `balanceDueDate = eventDate - 3d`. |

**Alternate**: Re-quote while `pending` → new row replaces, old becomes `superseded`; quote after expiry (status `expired`) → new `pending` again allowed.

---

#### UC-09 — Pay Deposit (Booking Fee) & Confirm

**Primary actor**: Customer

| Step | Action |
|------|--------|
| 1 | Customer sees `accepted` + `quotation pending` + `Deposit status required` + "Pay RM 200 booking fee →" (+ Turnstile). |
| 2 | Click `Pay` → `POST /api/bookings/[id]/pay-fee` → `createBookingPayment('deposit', getBookingFeeSen())`; system creates `payments(type=deposit, status=required)`; if Billplz, returns `provider_url` Billplz hosted page. |
| 3a | **Dev**: auto `markBillPaid` + `handlePaymentPaid` → `UPDATE bookings SET status='confirmed'` immediately; dashboard reloads → emerald `confirmed` + "✓ Booking fee paid". |
| 3b | **Billplz**: open `provider_url` in new tab; after Billplz checkout, webhook `POST /api/payments/webhook` verified → same state change. Redirect landing ` /dashboard` or `/booking/success` reads real status. |
| 4 | Fee is disclosed non-refundable throughout. |

**Alternate**: Quotation expired → totalPrice null; pay-fee blocked until re-quoted.

---

#### UC-10 — Pay Balance (T-3d) & Trigger Payout

| Step | Action |
|------|--------|
| 1 | On `confirmed` booking, dashboard shows "Balance RM X due by <date (eventDate-3d)>" and "Pay balance" (when `balancePayment.status !== paid`). |
| 2 | Click `Pay balance (RM …)` → `POST /api/bookings/[id]/pay-balance` → `amount = quotation.total - deposit`; creates `payments(type=balance, status=required)`; same Billplz/dev branching. |
| 3 | Dev auto-settle → `handlePaymentPaid(balance)` does `UPDATE quotations SET status='paid'` + `createPayoutForBooking`; payouts row appears `pending` in admin. |
| 4 | Billplz webhook same logic; then payout `settleable_at = eventDate + 24h`. |

**Alternate**: Zero balance (tiny quotation) → no payment needed / informative state.

---

#### UC-11 — Cancel Booking / Request Refund

| Actor | Action |
|-------|--------|
| Customer | On `requested|accepted|confirmed` sees **Cancel** → `PATCH {action:"cancel"}` → if `completed/cancelled` already → "no longer be cancelled"; else → `cancelled`. |
| Artist | Same; either side may cancel non-terminal; `isOwner` or `isArtist` suffices. |
| Refund | After `cancelled` that was `confirmed` and had `balance paid`: Customer sees **Request refund** → `POST /api/bookings/[id]/refund` → system refunds `balance` only; deposit stays. `dev` marks `refunded` directly; `billplz` calls refund API. |

---

#### UC-12 — Complete Booking & Review

| Step | Action |
|------|--------|
| 1 | Artist on `confirmed` clicks **Complete** → `PATCH {action:"complete"}` → `applyBookingTransition(confirmed,complete)` → `completed` (terminal). |
| 2 | Customer sees booking `completed`; eligible for review: `findReviewableBooking` returns it (most recent completed without review). |
| 3 | Customer posts `POST /api/artists/[slug]/reviews {rating 1-5, text, event}` → `addEntityReview` guards duplicate, `INSERT reviews`, `blendAggregate` atomically updates artist `rating/review_count`. |
| 4 | New review appears on artist detail via `listEntityReviews` ordered desc. |

**Alternate**: Studio bookings currently not reviewable (returns null). Second review for same booking → `ALREADY_REVIEWED` 409.

---

#### UC-13 — Chat Per-Booking (Live SSE)

| Step | Action |
|------|--------|
| 1 | On booking card, either party clicks "Chat" → collapsible `ChatThread` opens. |
| 2 | Component mounts SSE: `new EventSource(/api/bookings/[id]/messages/stream)`; server replays history ordered ASC, then streams live via `chat-bus` pub/sub. |
| 3 | User types draft, POST `/api/bookings/[id]/messages {body}` → persisted + published → other participant receives event without refresh. |
| 4 | Authz: non-participant GET/POST returns 403. |

---

#### UC-14 — Claim Artist/Studio Profile

| Step | Action |
|------|--------|
| 1 | Artist/Studio registers → sees dashboard block "Your artist profile" + `<select>` of all artists from `/api/catalog/artists` + **Claim profile** button. |
| 2 | POST `/api/artist-profiles {artistId}` → checks role, uniqueness, inserts `artist_profiles(user_id,artist_id)`. |
| 3 | Future `GET /api/bookings` for that user is scoped to claimed ids; bookings for unclaimed artists remain invisible. |

**Alternate**: Same `artist_id` already claimed by another user → 409; same `user_id` tries second profile → PK violation 409.

---

#### UC-16 — Admin Dashboard & User Management

**Actor**: Admin
**Entry**: `/admin` (layout guard redirects non-admins).

| Step | Action |
|------|--------|
| 1 | Admin logs in (`role=admin` — seeded via `ADMIN_EMAIL/ADMIN_PASSWORD npx tsx scripts/seed-admin.ts`). |
| 2 | `/admin` fetch `GET /api/admin` → stats (users by role, bookings by status, payments revenue, recent lists) render `StatCard`s + tables. |
| 3 | `/admin/users` → list, create, `PATCH /api/admin/users/[id]` role/status edit, `DELETE` — every mutation audited (`admin_audit_log`). |
| 4 | Non-admin direct API call blocked 403 even without UI. |

---

#### UC-18 — Admin Payout Settlement

| Step | Action |
|------|--------|
| 1 | Admin opens `/admin/payouts`; `GET /api/admin/payouts?status=pending` lists payouts joined with booking+artist name. |
| 2 | Click **Settle** or **Fail** → `PATCH /api/admin/payouts {payoutId, status, notes}` → `updatePayoutStatus` sets `settled_at` when settled, logs audit. |
| 3 | Payout starts `pending` with `settleable_at = eventDate+24h` dispute window; settling before window shows warning but is allowed. |

---

#### UC-19 — Export Data & Delete Account (PDPA)

| Step | Action |
|------|--------|
| 1 | Any authed user on `/dashboard` "Your data" section clicks **Export my data** → `GET /api/me/export` downloads `leish-data-…json` (bookings+messages+payments+profile+preferences). |
| 2 | Click **Delete my account** → confirm dialog → `DELETE /api/me?confirm=1` → cascade via FK deletes owned data; anchor audit rows kept with `admin_user_id=null`; cookie cleared; redirect `/`. |

---

### 3. User Stories (INVEST) — Backlog Format

Stories complement use cases for sprint planning. Acceptance is Given/When/Then.

#### Epic 1: Discovery

| ID | Story | Points | Priority | Acceptance |
|----|-------|--------|----------|------------|
| US-01 | As a **Guest**, I want to browse featured artists on the home page, so I can quickly see top MUAs. | 3 | Must | Given `/` loads, when page renders, then top 3 by rating shown with hero/category/how-it-works/CTA. |
| US-02 | As a **Customer**, I want to filter artists by **state/area/budget/event**, so I can find local affordable options. | 5 | Must | G/W filter state Selangor Then `listArtists(state=Selangor)` returns only Selangor; area dropdown cascades. |
| US-03 | As a **Customer**, I want to search artists by name/tagline/specialty text, so I can find known MUAs. | 2 | Must | G/W query "Aisha" Then results include Aisha Azman. |

#### Epic 2: Account

| ID | Story | Points | Acceptance |
|----|-------|--------|------------|
| US-04 | As a **Guest**, I want to **register** as customer/artist/studio with PDPA consent, so I can transact. | 3 | See UC-01; zod errors inline; scrypt hashed. |
| US-05 | As a **User**, I want to **verify my email** via link and have a resend button, so I can trust my account. | 3 | See UC-01 steps 5–6; links single-use hashed. |
| US-06 | As a **User**, I want to **log in/out** and stay signed in 7 days across tabs, so I'm not re-authing constantly. | 2 | JWT cookie httpOnly; revoked JTI rejected. |
| US-07 | As a **User**, I want to **reset forgotten password** without leaking which emails exist. | 5 | Forgot always 200-ish + 1h single-use token. |
| US-08 | As an **Artist**, I want to **claim my profile** to receive relevant bookings only. | 3 | See UC-14; scoped `GET /api/bookings`. |

#### Epic 3: Booking & Money

| ID | Story | Points | Acceptance |
|----|-------|--------|------------|
| US-09 | As a **Customer**, I want to **request a booking** with service/date/time/event details and have the **slot locked**, so I don't lose it. | 5 | Slot unique index + 409; price derived server-side. |
| US-10 | As an **Artist**, I want to **accept/reject** requests for my claimed profile. | 2 | `applyBookingTransition` enforced. |
| US-11 | As an **Artist**, I want to **quote** (base/travel/early/accommodation+extras) with **24h window** and **re-quote** if needed. | 8 | `quotationTotal` sum; `expires_at=now+24h`; superseded. |
| US-12 | As a **Customer**, I want to **pay deposit (RM50)** via Billplz/dev and see booking **confirmed** immediately (webhook). | 8 | `pay-fee` creates Billplz bill; webhook verified timing-safe. |
| US-13 | As a **Customer**, I want to **pay balance (total−deposit)** due **3 days before** the event. | 5 | `balanceDueDate` = eventDate−3d; payout created on paid. |
| US-14 | As a **Customer**, I want to **cancel** and get **balance refunded** (deposit non-refundable) if needed. | 3 | `refundBalancePayment` guards balance-only. |
| US-15 | As an **Artist**, I want my **payout** computed correctly (waiver, commission) and **settleable after 24h**. | 5 | `computeCommission` + `net = total−commission−deposit`. |

#### Epic 4: Social & Comms

| ID | Story | Points | Acceptance |
|----|-------|--------|------------|
| US-16 | As a **Customer/Artist**, I want **per-booking chat** that **updates live** without refresh. | 5 | SSE stream replay+live; 403 for outsiders. |
| US-17 | As a **Customer** touching `confirmed→completed`, I want to **review** (once) and see rating update. | 3 | Gated on completed+unreviewed; atomic blend 2dp. |
| US-18 | As a **User**, I want to **control email prefs** (toggle types) and not be spammed. | 2 | `email_preferences` toggles honored. |
| US-19 | As a **Customer**, I want **invoice HTML + PDF** for completed/confirmed bookings. | 3 | `GET /invoice` + `/invoice.pdf` for owner/claimed only. |

#### Epic 5: Admin

| ID | Story | Points | Acceptance |
|----|-------|--------|------------|
| US-20 | As an **Admin**, I want a **dashboard** with user/booking/payment stats + recent activity. | 3 | `GET /api/admin` aggregates. |
| US-21 | As an **Admin**, I want to **CRUD users/artists/studios/bookings** with all changes **audited**. | 5 | `admin_audit_log` on every mutation. |
| US-22 | As an **Admin**, I want to **settle/fail payouts** after the dispute window. | 3 | `PATCH /api/admin/payouts`. |
| US-23 | As an **Admin**, I want to **tune platform settings** (fee/commission/waiver) without redeploying. | 2 | `PATCH /api/admin/settings` + 30s cache. |

#### Epic 6: Compliance

| ID | Story | Points | Acceptance |
|----|-------|--------|------------|
| US-24 | As a **Customer**, I want to **export** my data as JSON and **delete** my account fully. | 3 | PDPA; cascade semantics. |

---

### 4. Non-Functional Stories (Supplementary)

| ID | Story | Acceptance |
|----|-------|------------|
| NFR-US-01 | As **Engineering**, I want CI to gate every PR on lint/typecheck/test/coverage≥80%/format, so debt doesn't ship. | `quality-gate.yml` required. |
| NFR-US-02 | As **Ops**, I want logs structured then forwarded to webhook in batches, so I can pipe to ELK/Datadog. | `LOG_WEBHOOK_URL` 20/50ms batch. |
| NFR-US-03 | As **Security**, I want security headers + CSP nonce + HMAC webhook, so attacks are rejected early. | `next.config.ts` headers + `verifyBillplzSignature` timing-safe. |

---

### 5. Trace to FRS

| UC | FRS IDs |
|----|---------|
| UC-01 | FR-AUTH-01, FR-AUTH-05 |
| UC-02 | FR-AUTH-02, FR-AUTH-03, FR-AUTH-04, FR-AUTH-07 |
| UC-03 | FR-AUTH-06 |
| UC-04 | FR-CAT-01, FR-CAT-03 |
| UC-05 | FR-CAT-02 |
| UC-06 | FR-BOOK-01, FR-DASH-01 |
| UC-07 | FR-BOOK-03 |
| UC-08 | FR-QUO-01, FR-QUO-02 |
| UC-09 | FR-PAY-02, FR-PAY-04 |
| UC-10 | FR-PAY-03, FR-PAY-04, FR-PAYO-02 |
| UC-11 | FR-BOOK-03, FR-PAY-05 |
| UC-12 | FR-BOOK-03, FR-REV-01..03 |
| UC-13 | FR-MSG-01, FR-MSG-02 |
| UC-14 | FR-CLAIM-01, FR-CLAIM-02 |
| UC-16..18 | FR-ADM-01..04, FR-PAYO-03 |
| UC-19 | FR-COMP-01, FR-COMP-02 |
| UC-20 | FR-MAIL-03, FR-ADM-02 (emails) |

Full traceability lives in `docs/08-Traceability-Matrix.md`.

---

*Next: `docs/06-Data-Model-and-ERD.md` specifies the storage for every entity referenced above.*
