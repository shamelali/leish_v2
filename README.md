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
- **Auth (demo)** — login / register / forgot-password with Google sign-in button, and
  role selection (Client · Artist · Studio). Demo auth is stored in `localStorage` only.
- **Artist onboarding** — auth-gated application flow (mirrors leish.my, which redirects
  to sign-in)
- **Dashboard** — role-aware home with appointments / booking requests

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- Zero backend — all data is sample content in `src/lib/data.ts`

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Project structure

```
src/
  app/            # routes: /, /artists, /artists/[id], /artists/[id]/book,
                  # /studios, /studios/[id], /login, /register, /forgot-password,
                  # /onboarding, /dashboard
  components/     # Navbar, Footer, Button, ArtistCard, StudioCard, RatingStars, Logo
  lib/            # types, mock data (artists/studios/states/areas), auth (demo), utils
```

## Notes

- All artist/studio data and reviews are fictional sample content.
- Booking and auth flows are front-end demos — nothing is persisted server-side.
- Generated photography lives in `public/images/`.
