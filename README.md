# Leish! v2 — Beauty Booking Marketplace

Book beauty anywhere. **Leish!** connects clients with Malaysia's top makeup artists and beauty
studios — browse profiles, check real-time availability, and book in minutes.

This is a from-scratch **v2 frontend** scaffold of [leish.my](https://leish.my), rebuilt as a
modern Next.js application.

## Features

- **Branded header** — gem logo (`public/images/logo.png`) in the navbar with the header
  background gradient matched to the logo's sampled brand color (`#c9284b` family).
  To use your own logo, replace `public/images/logo.png` and the header colors in
  `src/app/globals.css` (`--leish-header-from` / `--leish-header-to`).
- **Dark & light themes** — dark mode by default, with a sun/moon toggle in the navbar
  (choice is remembered in `localStorage`)
- **Home** — hero, browse-by-category, featured artists, stats, how-it-works, and join CTAs
- **Browse Artists** — live search + filters by state → area, date, and event type
  (bridal: engagement / solemnization / reception / full package; non-bridal: dinner /
  graduation / ceremony / corporate / touch-up)
- **Artist profiles** — portfolio, services & pricing, availability slots, reviews, and a
  multi-step **booking request** flow
- **Browse Studios** — studio directory with detail pages
- **Auth (real, server-side)** — register / login / forgot-password with role selection
  (Client · Artist · Studio). Passwords hashed with scrypt; sessions are signed httpOnly
  cookies; `/dashboard` and `/onboarding` are protected by middleware.
- **Artist onboarding** — auth-gated application flow (mirrors leish.my, which redirects
  to sign-in)
- **Dashboard** — role-aware and journey-driven:
  - **Client:** request → wait for acceptance → review the MUA's quotation
    (24h window) → pay the **RM 200 booking fee** (Billplz hosted page) →
    booking confirmed; balance (quotation total − RM 200) due **3 days before**
    the event is shown with its due date.
  - **Artist:** claim a catalog profile → accept/reject requests → build and send
    line-item quotations (base/travel/early call/accommodation/extras, 24h expiry,
    re-quote supported) → complete confirmed bookings; stats for requests,
    open quotations, confirmed bookings and fees paid.
  - Email-verification banner with resend until the account is verified.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- **Dual persistence** — PostgreSQL (`DATABASE_URL` set — use a Neon/Supabase
  pooler connection string in prod) or Node 22's built-in `node:sqlite` (no URL —
  local dev/tests). Same async API: `await getDb().prepare(sql).get/all/run()`.
  Schema applied automatically for SQLite; `npm run db:migrate` provisions
  PostgreSQL explicitly
- [zod](https://zod.dev) request validation · [jose](https://github.com/panva/jose) session JWT
- Catalog data (artists/studios) lives in `src/lib/data.ts`; users, bookings,
  quotations, payments and sessions live in the db-facade store (SQLite or Postgres)
- **Sessions** — stateless HS256 JWT in an httpOnly, same-site cookie, with a
  `jti` recorded in the `sessions` table so logout revokes the token server-side
  before its 7-day expiry

## API routes

| Route                                    | Purpose                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register`                | Create account, set session cookie (scrypt-hashed password)                                                                                  |
| `POST /api/auth/login`                   | Verify credentials, set session cookie                                                                                                       |
| `POST /api/auth/logout`                  | Clear session cookie                                                                                                                         |
| `GET /api/auth/me`                       | Current session user (or `null`)                                                                                                             |
| `POST /api/auth/forgot-password`         | Issue a single-use reset token (rate-limited, no user enumeration)                                                                           |
| `POST /api/auth/reset-password`          | Set a new password with a valid reset token (single-use, 1h expiry)                                                                          |
| `GET /api/auth/verify-email`             | Validate a verification token, mark the account verified (redirects)                                                                         |
| `POST /api/auth/resend-verification`     | Resend the verification email (session required, rate-limited)                                                                               |
| `GET /api/bookings`                      | Current user's bookings (auth required)                                                                                                      |
| `POST /api/bookings`                     | Create booking — price resolved server-side; requires a verified email (auth required)                                                       |
| `PATCH /api/bookings/[id]`               | Booking lifecycle: `accept` / `reject` (claimed artist on a requested booking) / `complete` / `cancel` — validated by a status state machine |
| `POST /api/bookings/[id]/quotation`      | Claimed artist builds & sends a line-item quotation (base/travel/early call/accommodation/extras) with a 24h review window                   |
| `POST /api/bookings/[id]/pay-fee`        | Client pays the flat **RM 200 booking fee** (Billplz bill); the booking confirms when the webhook reports it paid                            |
| `GET /api/bookings/[id]/invoice`         | Printable HTML invoice (quotation lines + RM 200 fee) for owner/claimed artist                                                               |
| `GET /api/bookings/[id]/invoice.pdf`     | Downloadable PDF invoice (same authorization)                                                                                                |
| `POST /api/bookings/[id]/remind`         | Claimed artist sends a balance reminder email to the client (confirmed bookings)                                                             |
| `GET/POST /api/bookings/[id]/messages`   | Per-booking chat thread (client ↔ claimed artist)                                                                                            |
| `GET /api/bookings/[id]/messages/stream` | Live chat via Server-Sent Events (replays history, then streams)                                                                             |
| `POST /api/bookings/[id]/refund`         | Refund the balance (quotation − non-refundable RM 200 fee) on cancelled bookings                                                             |
| `POST /api/payments/webhook`             | Billplz payment callback — verifies the HMAC signature, marks the fee `paid` and confirms the booking                                        |
| `POST /api/errors`                       | Client error ingestion (rate-limited) — logged and forwarded to `SENTRY_DSN` / `ERROR_WEBHOOK_URL` when set                                  |
| `GET /api/artist-profiles`               | The artist/studio account's claimed catalog profile (or `null`)                                                                              |
| `POST /api/artist-profiles`              | Claim a catalog artist profile (artist/studio role, one per account) — scopes which bookings an artist can see and manage                    |
| `GET /api/artists`                       | Public catalog with validated filters (`state`, `area`, `bridal`, `nonBridal`, `query`)                                                      |

All inputs are validated with zod; passwords are hashed with Node's built-in scrypt
(salted, timing-safe comparison); sessions are stateless JWTs in httpOnly, same-site cookies.

## Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

- `SESSION_SECRET` — **required in production** (`openssl rand -base64 32`); signs session JWTs
- `NEXT_PUBLIC_SITE_URL` — used for sitemap/robots/OG metadata
- `LEISH_DB_PATH` — optional override for the SQLite file location

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Quality gates

```bash
npm run lint          # ESLint (0 warnings required)
npm run typecheck     # tsc --noEmit
npm test              # Vitest unit + component tests (48 tests)
npm run build         # production build
npx playwright test   # E2E (register → book → dashboard) — needs browsers
```

CI (`.github/workflows/ci.yml`) runs format → lint → typecheck → test → build on
every PR, plus a Playwright E2E job (browser install handled in CI).

## Security features

- **Rate limiting** on all auth endpoints (sliding window per IP, 429 + Retry-After)
- **Email verification** — every new account gets a single-use, expiring verification
  link; the dashboard shows a banner with resend until verified
- **Password reset** — single-use, expiring tokens (sha256-hashed at rest), no
  user enumeration; dev mode prints the reset link since no email provider is set
- **Structured logging** with pino (`LOG_LEVEL` to adjust verbosity)
- scrypt password hashing · httpOnly JWT sessions · zod validation on every input ·
  production CSP with per-request nonces (no `'unsafe-inline'` for scripts) + security
  headers

## Email (dev & production)

Emails go through `src/server/email.ts`. Default provider is **dev** — messages are
stored in the `email_outbox` table and viewable at **/dev/emails** (dev builds only);
registration and password-reset responses include a `devVerifyUrl`/`devResetUrl` for
local testing. For production set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`
(see `.env.example`).

## Project structure

```
src/
  app/            # routes: /, /artists, /artists/[id], /artists/[id]/book,
                  # /studios, /studios/[id], /login, /register, /forgot-password,
                  # /onboarding, /dashboard + robots/sitemap/error/loading
  components/     # Navbar, Footer, Button, ArtistCard, StudioCard, RatingStars, Logo
  lib/            # types, mock data, filter logic, auth (demo), theme, utils, env
docs/             # CODEBASE-AUDIT.md — enterprise-readiness review
```

## Notes

- All artist/studio data and reviews are fictional sample content.
- Booking and auth flows are front-end demos — nothing is persisted server-side.
- Generated photography lives in `public/images/`.
