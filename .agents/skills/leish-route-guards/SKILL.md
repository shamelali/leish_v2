---
name: leish-route-guards
description: "Use when adding a page or API route that must be signed in, admin-only, or form-posted; or when debugging a page that renders for anonymous visitors, a redirect loop, or an unexpected post-login destination. Triggers: requirePageUser, getSessionUser, requireAdmin, statefulRoute, PATHNAME_HEADER, x-leish-pathname, safeRedirectPath, /dashboard, /onboarding, /admin, /api/admin, open redirect, CSRF, origin check."
metadata:
  author: leish
  version: "1.0.0"
---

# Route guards and redirects

## Pages: guard in a server layout, not in the client

A `"use client"` page cannot protect itself — `useAuth()` resolves after the HTML
is already streamed, so an anonymous request gets a 200 with the authenticated
shell. Every protected segment therefore has a server layout:

```tsx
// src/app/dashboard/layout.tsx
import { requirePageUser } from "@/server/page-auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return <>{children}</>;
}
```

- `requirePageUser(fallbackPath = "/dashboard")` redirects to
  `/login?redirect=<encodeURIComponent(pathname)>` and returns the `UserRow`
  (`never`-returning, so no null checks after it).
- `getSessionUser()` resolves Supabase OAuth first, then the JWT cookie, and
  returns the `users` row (or `null`). Reuse it; do not re-implement the lookup.
- `/admin` keeps a fixed `/login?redirect=/admin` target.

Existing guarded segments: `/dashboard`, `/onboarding`, `/bookings/[id]/chat`, `/admin`.

## The pathname comes from the proxy

`src/proxy.ts` stamps `PATHNAME_HEADER` (`x-leish-pathname`) on the forwarded
request with `requestHeaders.set(...)`. `set` — not `append` — so a
client-supplied value is overwritten rather than trusted. A layout cannot read
the pathname itself, which is why the header exists; if it is missing,
`requirePageUser` falls back to its argument.

## Never trust `?redirect=`

```ts
import { safeRedirectPath } from "@/lib/utils";
const target = safeRedirectPath(searchParams.get("redirect")); // rejects //, /\ , absolute, control chars
router.push(target);
```

`safeRedirectPath` exists because `router.push("//evil.com")` is a live open
redirect. Any new "return to where you were" flow must use it.

## API routes

- Mutations: wrap in `statefulRoute()` (`src/server/http.ts`) for the
  CSRF/origin check; it is also the reason uploads verify `Origin`.
- `/api/admin/*`: `await requireAdmin(request)` (`src/server/admin-auth.ts`),
  401 when unauthenticated, 403 when non-admin. Mutations go through
  `logAdminAction()`.
- Cron: `authorizeCron(request)` (`src/server/cron-auth.ts`) — fails closed in
  production when `CRON_SECRET` is unset.

## Verifying a guard

`curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/dashboard`
must be `307 .../login?redirect=%2Fdashboard`. A 200 means the guard is not in
the render path. Keep `src/server/page-auth.test.ts`, `src/proxy.test.ts` and
`e2e/navigation.spec.ts` in sync when the contract changes.
