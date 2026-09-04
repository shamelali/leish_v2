# API Specification — Leish! v2

| Field            | Value                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Document ID**  | LEISH-API-v2.0                                                                                                                              |
| **Version**      | 2.0.0                                                                                                                                       |
| **Date**         | 2026-08-29                                                                                                                                  |
| **Base URL**     | `https://leish.my` (prod) / `http://localhost:3000` (dev) — `NEXT_PUBLIC_SITE_URL`                                                          |
| **Auth**         | `Cookie: leish_session=<JWT>` (httpOnly, SameSite=lax); no Bearer header                                                                    |
| **Content-Type** | `application/json` unless noted (`text/event-stream`, `application/pdf`, `text/html`)                                                       |
| **Errors**       | JSON envelope `{error: string}` with appropriate HTTP status; zod validation returns first issue message                                    |
| **Helpers**      | `src/server/http.ts` — `jsonError(message,status)`, `readJson(req)`, `tryRoute`/`statefulRoute` wrappers that log `pino` + normalize errors |

---

### 1. Conventions

| Item             | Rule                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status codes** | 200 OK, 201 Created, 400 Bad Request (validation), 401 Unauthorized (missing/bad session), 403 Forbidden (role mismatch), 404 Not Found, 409 Conflict (duplicate/slot), 429 Too Many Requests, 500 Internal |
| **Timestamps**   | ISO-8601 strings `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC)                                                                                                                                                           |
| **Money**        | Integer **sen** (cents). Presented as `formatRM(sen) → "RM X.XX"` client-side                                                                                                                               |
| **Pagination**   | `?limit=1..100 default 20, ?offset=0.. default 0` → response `{pagination:{total,limit,offset,hasMore}}` + array                                                                                            |
| **Rate limit**   | `429` + `Retry-After: <seconds>` when exceeded; Sliding window via Upstash or in-memory fallback                                                                                                            |
| **CSR**          | `ALLOWED_ORIGINS` checked for state-changing (`POST/PATCH/DELETE`) cross-origin; otherwise standard `SRS-F-12`                                                                                              |
| **Validation**   | Zod schemas in `src/server/validation.ts` enforce on every mutating endpoint                                                                                                                                |

---

### 2. Endpoint Index

| Group                          | Method                | Path                                                    | Auth                         | Route handler                                                                         |
| ------------------------------ | --------------------- | ------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| **Health**                     | GET                   | `/api/health`                                           | No                           | `src/app/api/health/route.ts`                                                         |
| **Auth — Register**            | POST                  | `/api/auth/register`                                    | No                           | `src/app/api/auth/register/route.ts`                                                  |
| **Auth — Login**               | POST                  | `/api/auth/login`                                       | No                           | `src/app/api/auth/login/route.ts`                                                     |
| **Auth — Logout**              | POST                  | `/api/auth/logout`                                      | Cookie                       | `src/app/api/auth/logout/route.ts`                                                    |
| **Auth — Me**                  | GET                   | `/api/auth/me`                                          | Cookie (soft)                | `src/app/api/auth/me/route.ts` or `GET /api/me` variant                               |
| **Auth — Verify Email**        | GET                   | `/api/auth/verify-email?token=`                         | No                           | `src/app/api/auth/verify-email/route.ts`                                              |
| **Auth — Resend Verify**       | POST                  | `/api/auth/resend-verification`                         | Cookie                       | `src/app/api/auth/resend-verification/route.ts`                                       |
| **Auth — Forgot**              | POST                  | `/api/auth/forgot-password`                             | No (rate-limited)            | `src/app/api/auth/forgot-password/route.ts`                                           |
| **Auth — Reset**               | POST                  | `/api/auth/reset-password`                              | No                           | `src/app/api/auth/reset-password/route.ts`                                            |
| **Auth — Errors**              | POST                  | `/api/errors`                                           | No (rate-limited)            | `src/app/api/errors/route.ts`                                                         |
| **Catalog — Artists**          | GET                   | `/api/artists?query&state&area&bridal&nonBridal&budget` | No                           | `src/app/api/artists/route.ts`                                                        |
| **Catalog — Artists (client)** | GET                   | `/api/catalog/artists`                                  | No                           | `src/app/api/catalog/artists/route.ts`                                                |
| **Catalog — Studios**          | GET                   | `/api/catalog/studios` (or `/api/studios`)              | No                           | `src/app/api/catalog/studios/route.ts`                                                |
| **Catalog — Artist by slug**   | GET                   | `/artists/[slug]` (RSC, not API)                        | No                           | `src/app/artists/[slug]/page.tsx` (`resolveArtist`)                                   |
| **Bookings — List**            | GET                   | `/api/bookings?limit&offset`                            | Cookie                       | `src/app/api/bookings/route.ts:86`                                                    |
| **Bookings — Create**          | POST                  | `/api/bookings`                                         | Cookie                       | `src/app/api/bookings/route.ts:151`                                                   |
| **Bookings — Transition**      | PATCH                 | `/api/bookings/[id]`                                    | Cookie                       | `src/app/api/bookings/[id]/route.ts`                                                  |
| **Bookings — Quotation**       | POST                  | `/api/bookings/[id]/quotation`                          | Cookie (claimed artist)      | `src/app/api/bookings/[id]/quotation/route.ts`                                        |
| **Bookings — Pay Fee**         | POST                  | `/api/bookings/[id]/pay-fee`                            | Cookie (owner)               | `src/app/api/bookings/[id]/pay-fee/route.ts`                                          |
| **Bookings — Pay Balance**     | POST                  | `/api/bookings/[id]/pay-balance`                        | Cookie (owner)               | `src/app/api/bookings/[id]/pay-balance/route.ts`                                      |
| **Bookings — Remind**          | POST                  | `/api/bookings/[id]/remind`                             | Cookie (claimed artist)      | `src/app/api/bookings/[id]/remind/route.ts`                                           |
| **Bookings — Refund**          | POST                  | `/api/bookings/[id]/refund`                             | Cookie (owner)               | `src/app/api/bookings/[id]/refund/route.ts`                                           |
| **Bookings — Invoice HTML**    | GET                   | `/api/bookings/[id]/invoice`                            | Cookie (owner                | artist)                                                                               | `src/app/api/bookings/[id]/invoice/route.ts`     |
| **Bookings — Invoice PDF**     | GET                   | `/api/bookings/[id]/invoice.pdf`                        | Cookie (owner                | artist)                                                                               | `src/app/api/bookings/[id]/invoice.pdf/route.ts` |
| **Messages — List**            | GET                   | `/api/bookings/[id]/messages`                           | Cookie (participant)         | `src/app/api/bookings/[id]/messages/route.ts`                                         |
| **Messages — Create**          | POST                  | `/api/bookings/[id]/messages`                           | Cookie (participant)         | `src/app/api/bookings/[id]/messages/route.ts`                                         |
| **Messages — Stream**          | GET                   | `/api/bookings/[id]/messages/stream`                    | Cookie (participant)         | `src/app/api/bookings/[id]/messages/stream/route.ts` (SSE)                            |
| **Payments — Webhook**         | POST                  | `/api/payments/webhook`                                 | HMAC (`X-Billplz-Signature`) | `src/app/api/payments/webhook/route.ts`                                               |
| **Artists — Claimed**          | GET                   | `/api/artist-profiles`                                  | Cookie                       | `src/app/api/artist-profiles/route.ts`                                                |
| **Artists — Claim**            | POST                  | `/api/artist-profiles`                                  | Cookie (artist/studio)       | `src/app/api/artist-profiles/route.ts`                                                |
| **Artists — Edit Self**        | PATCH                 | `/api/artist-profiles`                                  | Cookie (claimed)             | `src/app/api/artist-profiles/route.ts`                                                |
| **Studios — Claim**            | POST/GET/PATCH        | `/api/studio-profiles`                                  | Cookie                       | `src/app/api/studio-profiles/route.ts`                                                |
| **Reviews — Add**              | POST                  | `/api/artists/[slug]/reviews`                           | Cookie                       | `src/app/api/artists/[slug]/reviews/route.ts` (or via `src/server/catalog.ts` helper) |
| **Me — Export**                | GET                   | `/api/me/export`                                        | Cookie                       | `src/app/api/me/export/route.ts`                                                      |
| **Me — Delete**                | DELETE                | `/api/me?confirm=1`                                     | Cookie                       | `src/app/api/me/route.ts`                                                             |
| **Email — Preferences**        | GET/PATCH             | `/api/email/preferences`                                | Cookie                       | `src/app/api/email/preferences/route.ts`                                              |
| **Email — Outbox (admin)**     | GET                   | `/api/admin/emails`                                     | Cookie admin                 | `src/app/api/admin/emails/route.ts`                                                   |
| **Upload**                     | POST                  | `/api/upload`                                           | Cookie                       | `src/app/api/upload/route.ts`                                                         |
| **Cron — Expire**              | POST/GET              | `/api/cron/...`                                         | `CRON_SECRET`                | `src/app/api/cron/*`                                                                  |
| **Admin — Dashboard**          | GET                   | `/api/admin`                                            | Cookie admin                 | `src/app/api/admin/route.ts`                                                          |
| **Admin — Users**              | GET/POST/PATCH/DELETE | `/api/admin/users…`                                     | admin                        | `src/app/api/admin/users/*`                                                           |
| **Admin — Artists/Studios**    | GET/POST/PATCH        | `/api/admin/artists`, `/api/admin/studios`              | admin                        | `src/app/api/admin/artists/*`                                                         |
| **Admin — Bookings**           | GET/PATCH             | `/api/admin/bookings…`                                  | admin                        | `src/app/api/admin/bookings/*`                                                        |
| **Admin — Payments**           | GET                   | `/api/admin/payments`                                   | admin                        | `src/app/api/admin/payments/route.ts`                                                 |
| **Admin — Payouts**            | GET/PATCH             | `/api/admin/payouts`                                    | admin                        | `src/app/api/admin/payouts/route.ts`                                                  |
| **Admin — Quotations**         | GET                   | `/api/admin/quotations`                                 | admin                        | `src/app/api/admin/quotations/route.ts`                                               |
| **Admin — Messages**           | GET                   | `/api/admin/messages`                                   | admin                        | `src/app/api/admin/messages/route.ts`                                                 |
| **Admin — Audit**              | GET                   | `/api/admin/audit`                                      | admin                        | `src/app/api/admin/audit/route.ts`                                                    |
| **Admin — Settings**           | GET/PATCH             | `/api/admin/settings`                                   | admin                        | `src/app/api/admin/settings/route.ts`                                                 |
| **Admin — Analytics**          | GET                   | `/api/admin/analytics`                                  | admin                        | `src/app/api/admin/analytics/route.ts`                                                |
| **Dev — Emails**               | GET                   | `/dev/emails` (RSC page)                                | No (dev-only guard)          | `src/app/dev/emails/page.tsx`                                                         |
| **Errors ingestion**           | POST                  | `/api/errors`                                           | rate-limited                 | `src/app/api/errors/route.ts`                                                         |

> Routes shown are exhaustive for v2 baseline; exact file layout under `src/app/api/` matches table. See `src/app/api/admin/list-routes.test.ts` for automated coverage of admin surface.

---

### 3. Authentication & Sessions

#### `POST /api/auth/register`

```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "Nurul Huda",
  "email": "nurul@example.my",
  "password": "Str0ng!Pass99",
  "role": "customer",          // customer | artist | studio
  "consent": true,
  "consentTimestamp": "2026-08-29T03:00:00.000Z"
}
```

| Status | Body                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 201    | `{user:{id,email,name,role,emailVerified}, devVerifyUrl?: string}` + `Set-Cookie: leish_session=…; HttpOnly; Path=/; SameSite=Lax; Secure@prod` |
| 400    | `{error:"Name must be at least 2 characters"}` (first zod issue)                                                                                |
| 409    | `{error:"An account with this email already exists"}`                                                                                           |
| 429    | `{error:"Too many requests"}` + `Retry-After`                                                                                                   |

Validation: `registerSchema` `src/server/validation.ts:5`.

#### `POST /api/auth/login`

```http
POST /api/auth/login
{ "email":"nurul@example.my", "password":"Str0ng!Pass99" }
```

- 200 + cookie on success; 401 generic on failure; 429 when rate-limited. Agnost `login` tracked.

#### `POST /api/auth/logout`

- Reads `Cookie: leish_session=…`, revokes JTI (`UPDATE sessions SET revoked=1`), clears cookie. Always 200.

#### `GET /api/auth/me` and `GET /api/me` alias

- 200 `{user: PublicUser | null}` — null when unauthenticated (soft check, not 401).

#### `POST /api/auth/resend-verification`

- Cookie required; rate-limited per `user_id` (or IP). 200 on success (`{message:"Verification email sent"}`) + email queued; 401 when unauthenticated; 429 when rate-limited.

#### `POST /api/auth/forgot-password`

```http
POST /api/auth/forgot-password
{ "email":"nurul@example.my", "turnstileToken":"…" }
```

- Always `200 {message:"If an account exists …"}` (no enumeration). Token `password_resets` hashed sha256; 1h expiry. Dev response may include `devResetUrl`.

#### `POST /api/auth/reset-password`

```http
POST /api/auth/reset-password
{ "token":"raw-token-from-email", "newPassword":"NewStr0ng!Pass" }
```

- 200 on success; 400 on invalid/expired/used/reused; single-use (`used_at` set).

---

### 4. Catalog APIs

#### `GET /api/artists`

```
Query: ?query=string(≤100)&state=State&area=string(≤80)&bridal=BridalEvent&nonBridal=NonBridalEvent&budget=int
```

```http
GET /api/artists?state=Selangor&area=Cyberjaya&bridal=solemnization&budget=70000&query=aisha
→ 200
{
  "artists": [ Artist, … ]   // Artist {id,slug,name,tagline,bio,image,rating,reviewCount,state,area,
                             //         priceFrom,specialties,services,bridal,nonBridal,availability,portfolio,
                             //         verified,yearsExperience,reviews[]}
}
```

- Validates `artistsQuerySchema` `src/server/validation.ts:52`. Implements `listArtists(filters)` with SQL pre-filter then `filterArtists`.
- Caching: public; CDN `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` (set on route).
- Errors: 400 on invalid enum (e.g. unknown `bridal` id).

#### `GET /api/catalog/artists` & `GET /api/catalog/studios`

- Same semantics; separate route wrappers used by `ArtistsBrowser` client components that fetch with `.then()`.

#### `GET /api/artists/[slug]/reviews` (or server helper)

- `GET` returns `listEntityReviews("artist", id)` → `Review[]`.
- `POST` body `{rating:1-5, text: string, event?:string, bookingId?:string}` → `addEntityReview` + `blendAggregate`; see FRS FR-REV-01.

---

### 5. Booking APIs

#### `GET /api/bookings`

```http
GET /api/bookings?limit=20&offset=0
Cookie: leish_session=…

→ 200
{
  "bookings":[
    {
      "id":"uuid",
      "artistId":"aisha-azman",
      "studioId": null,
      "artistName":"Aisha Azman",
      "service":"Reception Makeup",
      "price":68000,                  // sen
      "date":"2026-09-10",
      "time":"10:00 AM",
      "notes":"Garden venue",
      "status":"accepted",           // requested|accepted|confirmed|cancelled|completed
      "eventType":"reception",
      "venue":"Cyber 5",
      "guestCount":80,
      "quotation": {
        "id":"q-uuid",
        "baseFee":88000,"travelFee":8000,"earlyCallFee":0,"accommodationFee":0,
        "extras":[{"label":"Hair styling","amount":5000}],
        "artistNote":"Early call included",
        "total":101000,
        "status":"pending",          // pending|paid|expired|superseded
        "createdAt":"2026-08-29T02:00:00.000Z",
        "expiresAt":"2026-08-30T02:00:00.000Z"
      } | null,
      "totalPrice":101000 | null,    // null when no/active quotation expired
      "balanceDueDate":"2026-09-07", // ISO date (event - 3d)
      "balanceAmount":96000,         // max(0, total - fee) | null
      "payment":    {"amount":5000,"type":"deposit","status":"required|paid|…","provider":"dev|billplz","reference":"dev_…","url":null} | null,
      "balancePayment":{"amount":96000,"type":"balance","status":"…","provider":"…","reference":"…","url":"…"} | null
    }
  ],
  "pagination":{"total":12,"limit":20,"offset":0,"hasMore":false}
}
```

- **Auth**: 401 when missing/bad session.
- **Scoping**: customer → `WHERE user_id=?`; artist/studio → claimed `artist_id`/`studio_id` set (empty → `[]`).
- Errors: 401 unauthenticated.

#### `POST /api/bookings`

```http
POST /api/bookings
Cookie: leish_session=…
{
  "artistId":"aisha-azman",
  "service":"Reception Makeup",
  "date":"2026-09-10",
  "time":"10:00 AM",
  "notes":"Garden venue, 30 guests",
  "eventType":"reception",
  "venue":"12-G, Jalan Teknokrat 5",
  "guestCount":30
}
```

| Status | Body                                                   |
| ------ | ------------------------------------------------------ |
| 201    | `{booking:SerializedBooking, user: PublicUser}`        |
| 400    | `{error:"Service not available for this artist"        | zod message}` |
| 401    | `{error:"Not authenticated"}`                          |
| 404    | `{error:"Artist not found"}`                           |
| 409    | `{error:"Sorry, this time slot has just been taken…"}` |
| 429    | Too many requests                                      |

See FRS FR-BOOK-01 for server-derived price, pre-check + unique index race guard.

#### `PATCH /api/bookings/[id]`

```http
PATCH /api/bookings/bk_123
Cookie: leish_session=…
{ "action":"accept" }   // accept | reject | complete | cancel
→ 200 { booking:SerializedBooking }
→ 400 {error:"Only requested bookings can be accepted"}
→ 401 | 403 | 404
```

Rules per `applyBookingTransition` + ownership checks (FRS FR-BOOK-03). Agnost tracks status updates.

#### `POST /api/bookings/[id]/quotation`

```http
POST /api/bookings/bk_123/quotation
Cookie: leish_session=… (claimed artist)
{
  "baseFee": 88000,
  "travelFee": 8000,
  "earlyCallFee": 0,
  "accommodationFee": 0,
  "extras": [{"label":"Hair styling","amount":5000}],
  "artistNote":"Early call included, travel within 30km"
}
→ 201 {quotation:SerializedQuotation}
```

- 403 when not claimed artist; 400 when booking not `accepted` or validation fails; previous pending becomes `superseded`.

#### `POST /api/bookings/[id]/pay-fee` & `POST /api/bookings/[id]/pay-balance`

```http
POST /api/bookings/bk_123/pay-fee
{ "turnstileToken":"…" }    // optional when Turnstile configured
→ 200 {payment:{amount:5000,type:"deposit",status:"required|paid",provider:"dev|billplz",reference:"…",url:"https://www.billplz.com/bills/xxx" | null},
       booking:{status:"accepted|confirmed"}}
```

- Deposit amount is `getBookingFeeSen()` (not body). Balance amount is `quotation.total - fee`.
- `provider_url` is Billplz hosted page — client opens via `window.open(url,"_blank")`.
- When `provider=dev`, route auto-settles synchronously (feasible for e2e): `markBillPaid` + `handlePaymentPaid` + status `confirmed`.

#### `POST /api/bookings/[id]/remind`

- Claimed artist only, booking must be `confirmed`. Sends `balance_reminder` email respecting `email_preferences.balance_reminder`. Rate-limited.

#### `POST /api/bookings/[id]/refund`

```http
POST /api/bookings/bk_123/refund
→ 200 {payment:{…status:"refunded"}, message:"Balance refund issued"}
→ 400 {error:"Only balance payments are refundable" | "Only paid balances…"}
→ 401/403
```

- Refund endpoints call `refundBalancePayment()`; `billplz` path `POST /bills/{id}/refund`.

#### Invoice

```
GET /api/bookings/[id]/invoice       → 200 text/html   (printable)
GET /api/bookings/[id]/invoice.pdf   → 200 application/pdf  + Content-Disposition: attachment; filename="leish-invoice-<id>.pdf"
```

- Authz: owner or claimed artist only. Content built server-side from quotation+fees.

---

### 6. Messaging APIs

#### `GET /api/bookings/[id]/messages`

```http
GET /api/bookings/bk_123/messages
→ 200 {messages:[{id, senderName, body, createdAt}]}
```

#### `POST /api/bookings/[id]/messages`

```http
POST /api/bookings/bk_123/messages
{ "body":"Hello, please confirm venue." }
→ 201 {message:{id, senderName:"…", body:"…", createdAt:"…"}}
→ 400 empty body
→ 403 not participant
```

#### `GET /api/bookings/[id]/messages/stream` (SSE)

```http
GET /api/bookings/bk_123/messages/stream
Accept: text/event-stream
Cookie: leish_session=…

→ 200 Content-Type: text/event-stream
   Cache-Control: no-cache
   Connection: keep-alive

data: {"id":"m1","senderName":"Nurul","body":"Hi","createdAt":"…"}
data: {"id":"m2","senderName":"Aisha","body":"Hello!","createdAt":"…"}

: keepalive
```

- Replays history `ORDER BY created_at ASC` then streams live via `src/server/chat-bus.ts`. Requires participant auth; drop+reconnect replays.

---

### 7. Payments Webhook

#### `POST /api/payments/webhook`

```http
POST /api/payments/webhook
Content-Type: application/json
X-Billplz-Signature: 64-hex-hmac-sha256-of-raw-body-with-API_KEY
X-Billplz-Paid: true|false   (inside body alternative field depending on Billplz version)
{
  "id":"billplz-bill-id",
  "collection_id":"…",
  "paid": true,
  "paid_amount": 5000,
  "amount": 5000,
  "state": "paid"
}
```

| Status | Body                          | Effect                                                           |
| ------ | ----------------------------- | ---------------------------------------------------------------- |
| 200    | `{ok:true}`                   | Processed: `markBillPaid` + `handlePaymentPaid` routed by `type` |
| 401    | `{error:"Invalid signature"}` | No DB write                                                      |
| 404    | Bill id not found             | No booking confirmed                                             |

**Verification** `verifyBillplzSignature(rawBody, header, apiKey)` `src/server/payments.ts:381`: hex64 regex, `createHmac("sha256",apiKey).update(rawBody).digest("hex")`, `timingSafeEqual`.

Callers must send **raw body bytes** exactly as Billplz did (not pretty-printed).

---

### 8. Profile Claim

#### `GET /api/artist-profiles`

```http
GET /api/artist-profiles
Cookie: leish_session=…
→ 200 {profile:{artistId:"aisha-azman", artistName:"Aisha Azman"} | null}
→ 401 unauthenticated
```

#### `POST /api/artist-profiles`

```http
POST /api/artist-profiles
{ "artistId":"aisha-azman" }
→ 201 {profile:{artistId, artistName}}
→ 403 customer role cannot claim
→ 409 artistId already claimed OR user already has profile (PK violation)
→ 404 artist not found
```

#### `PATCH /api/artist-profiles`

```http
PATCH /api/artist-profiles
{ "bio":"New bio…", "priceFrom": 75000, "state":"Selangor" }
→ 200 {artist: Artist}
→ 400 validation on priceFrom range
→ 403 unclaimed cannot edit
```

- Whitelisted fields only; `verified`/`referralEarnings` ignored for self-service.

#### `GET/POST/PATCH /api/studio-profiles` — mirrors artist; scopes `studio_id`.

---

### 9. Reviews

#### `POST /api/artists/[slug]/reviews` (example; some impl calls `src/server/catalog.ts` via dedicated handler)

```http
POST /api/artists/aisha-azman/reviews
Cookie: leish_session=…
{
  "rating": 5,
  "text": "Aisha made me look amazing!",
  "event": "Reception",
  "bookingId": "bk_123"   // optional; when given gates on that booking
}
→ 201 {review:{id,author,rating,date,text,event}}
→ 400 rating out of 1-5
→ 409 {error:"ALREADY_REVIEWED"} when same booking_id already has review
→ 401
```

---

### 10. Data Rights

#### `GET /api/me/export`

```http
GET /api/me/export
Cookie: leish_session=…
→ 200 Content-Type: application/json
   Content-Disposition: attachment; filename="leish-data-a1b2c3d4.json"
   { user, bookings:[], messages:[], payments:[], artistProfiles:[], …}
→ 401
```

#### `DELETE /api/me?confirm=1`

```http
DELETE /api/me?confirm=1
Cookie: leish_session=…
→ 200 {message:"Account deleted"}
→ 400 missing confirm=1
→ 401
```

---

### 11. Email Preferences

#### `GET /api/email/preferences`

→ `200 {preferences:{booking_created, quotation_sent, invoice_sent, quotation_expiry, balance_reminder, status_changed}}` all 0/1.

#### `PATCH /api/email/preferences`

```http
PATCH /api/email/preferences
{ "balance_reminder":0 }
→ 200 {preferences:{…}}
```

---

### 12. Upload

#### `POST /api/upload`

- Multipart/form-data; image only; routed to Vercel Blob or S3 (`BLOB_READ_WRITE_TOKEN` or AWS). Returns `{url}`. Auth required; size limites configurable.

---

### 13. Admin APIs (all behind `requireAdmin`)

All responses are JSON; every mutating handler calls `logAdminAction()` after success.

#### `GET /api/admin` — Dashboard aggregates

```http
GET /api/admin
→ 200 {
    stats:{
      users:{total, customers, artists, studios, admins},
      bookings:{total, requested, accepted, confirmed, completed, cancelled},
      payments:{total, paid, required, totalRevenue}, // totalRevenue in sen
      artistProfiles: number
    },
    recentBookings:[{id,artist_name,service,date,time,status,created_at}, …10],
    recentAudit:[{id,action,target_table,target_id,created_at}, …10]
  }
```

#### `GET /api/admin/users` (+ `POST /api/admin/users`, `PATCH /api/admin/users/[id]`, `DELETE`)

- `GET ?limit=&offset=&role=` paginated listing; `POST {name,email,password,role}` create; `PATCH {name,role,emailVerified}` update; `DELETE` remove (audit). Password never returned.

#### `GET /api/admin/artists` (+ `POST`, `PATCH /api/admin/artists/[id]`)

- Mirrors catalog mutability with full whitelist (including `verified`, `referralEarnings`). `POST {name,slug?,tagline,bio,state,area,priceFrom,…}` → `createArtist`.

#### `GET /api/admin/studios` — mirrors artists via `createStudio`/`updateStudio`.

#### `GET /api/admin/bookings` + `PATCH /api/admin/bookings/[id]`

- Admin status override + notes (bypass state machine for ops, but still audited).

#### `GET /api/admin/payments` — lists payments joined with bookings (filter `?status=&type=&bookingId=`).

#### `GET /api/admin/payouts` + `PATCH /api/admin/payouts`

```
GET /api/admin/payouts?status=pending
→ 200 {payouts:[{id,artist_user_id,booking_id,gross_sen,commission_sen,net_sen,status,settleable_at,settled_at,notes,created_at, artist_name, service, event_date},…]}

PATCH /api/admin/payouts
{ "payoutId":"p_…", "status":"settled", "notes":"DuitNow ref XYZ" }
→ 200 {payout: PayoutRow}
→ 404 payout not found
→ 403 non-admin
```

#### `GET /api/admin/quotations` — list quotations with booking join, filter by status.

#### `GET /api/admin/messages` — list messages with booking scope.

#### `GET /api/admin/emails` — returns `email_outbox` (dev) / retry queue status.

#### `GET /api/admin/audit` — paginated `admin_audit_log` ordered `created_at DESC`.

#### `GET /api/admin/settings` + `PATCH /api/admin/settings`

```http
GET /api/admin/settings
→ 200 {settings:{booking_fee_sen:"5000", commission_rate_bps:"1000", commission_waiver_sen:"10000"}}

PATCH /api/admin/settings
{ "key":"booking_fee_sen", "value":"7000" }   // or batch [{key,value}]
→ 200 {setting:{key,value,updated_by,updated_at}}
→ 400 invalid key/value range
```

#### `GET /api/admin/analytics` — Agnost rollups (if configured).

---

### 14. Health & Cron

#### `GET /api/health`

```http
GET /api/health
→ 200 {ok:true, db:"postgres"|"sqlite", env:"production"|"development", uptime:123.4}
→ 503 if DB unreachable
```

Docker `HEALTHCHECK` hits this.

#### `POST /api/cron/*` (e.g. `/api/cron/expire-quotations`)

- Guard: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it); otherwise 401.
- Handlers: sweep `findExpiredQuotations()` + `markQuotationExpired`, flush `email_retries` (`next_retry < now && attempts < max`).

---

### 15. Error Handling

| Condition                                       | Status | Body Example                                                          |
| ----------------------------------------------- | ------ | --------------------------------------------------------------------- |
| Zod validation                                  | 400    | `{error:"Name must be at least 2 characters"}`                        |
| Missing session                                 | 401    | `{error:"Not authenticated"}`                                         |
| `requireAdmin` non-admin                        | 403    | `{error:"Forbidden"}`                                                 |
| Unknown artist/booking                          | 404    | `{error:"Artist not found"}`                                          |
| Duplicate email / profile / slot / payment type | 409    | `{error:"An account with this email already exists"}` or slot message |
| Rate limit                                      | 429    | `{error:"Too many requests"}` + `Retry-After`                         |
| Webhook bad sig                                 | 401    | `{error:"Invalid signature"}`                                         |

Client error ingestion: `POST /api/errors {message, stack?, context}` — rate-limited, `reportError()`.

---

### 16. Security Notes (API Consumers)

- Never send `SESSION_SECRET` to client; all `NEXT_PUBLIC_*` are safe.
- Billplz webhook **must** send `X-Billplz-Signature` as hex64 of `HMAC-SHA256(apiKey, rawBody)`; JSON body is the Billplz bill payload (amount in sen).
- All mutating requests should include `Content-Type: application/json` unless multipart; missing `Cookie` returns 401 (not redirect) for API routes; pages handle redirects.
- Rate limits are per-IP + per-user where relevant; clients should respect `429` and back off.

---

### 17. Example: End-to-End Booking Flow via API

```bash
# 1. Register + verify (dev: grab devVerifyUrl from response)
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Nurul","email":"nurul@example.my","password":"Str0ng!Pass99","role":"customer","consent":true}'

# 2. Create booking
curl -X POST http://localhost:3000/api/bookings \
  -H 'Content-Type: application/json' \
  --cookie "leish_session=…" \
  -d '{"artistId":"aisha-azman","service":"Reception Makeup","date":"2026-09-20","time":"10:00 AM","eventType":"reception","venue":"Cyber 5","guestCount":40}'

# 3. Artist claims + accepts (as artist user)
curl -X POST http://localhost:3000/api/artist-profiles --cookie "leish_session=<artist>" -d '{"artistId":"aisha-azman"}'
curl -X PATCH http://localhost:3000/api/bookings/BK_ID --cookie "leish_session=<artist>" -d '{"action":"accept"}'

# 4. Artist quotes
curl -X POST http://localhost:3000/api/bookings/BK_ID/quotation --cookie "leish_session=<artist>" \
  -d '{"baseFee":88000,"travelFee":8000,"extras":[{"label":"Hair styling","amount":5000}]}'

# 5. Customer pays deposit (dev → auto confirmed)
curl -X POST http://localhost:3000/api/bookings/BK_ID/pay-fee --cookie "leish_session=<customer>" -d '{}'
# → {payment:{url:null, status:"paid"|"required"}, booking:{status:"confirmed"}}

# 6. Customer pays balance (dev → payout created)
curl -X POST http://localhost:3000/api/bookings/BK_ID/pay-balance --cookie "leish_session=<customer>" -d '{}'

# 7. Artist completes
curl -X PATCH http://localhost:3000/api/bookings/BK_ID --cookie "leish_session=<artist>" -d '{"action":"complete"}'

# 8. Customer reviews
curl -X POST http://localhost:3000/api/artists/aisha-azman/reviews --cookie "leish_session=<customer>" \
  -d '{"rating":5,"text":"Amazing!","event":"Reception","bookingId":"BK_ID"}'
```

---

_Next: `docs/08-Traceability-Matrix.md` maps each BR → SRS → FRS → API → Table → Test._
