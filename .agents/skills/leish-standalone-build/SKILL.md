---
name: leish-standalone-build
description: "Use when building, starting, containerising, or deploying this app, or when a production boot fails with MODULE_NOT_FOUND, 'next start does not work with output: standalone', a missing static asset, a 404 on /_next/static/*, or an empty database after boot. Triggers: output standalone, next start, pnpm run start, start:next, scripts/start-standalone.mjs, .next/standalone, outputFileTracingIncludes, @swc/helpers, server.js, Dockerfile, HOSTNAME, LEISH_DB_PATH, --env-file, wrangler/vinext."
metadata:
  author: leish
  version: "1.0.0"
---

# Standalone build and boot

`next.config.ts` sets `output: "standalone"` unless `VERCEL` is set, so there are
two different production stories.

## Commands

| Command | Use |
|---|---|
| `pnpm run build` | emits `.next/standalone` (local, Docker) |
| `pnpm run start` | `scripts/start-standalone.mjs` — copies static assets, then boots `server.js` |
| `pnpm run start:next` | bare `next start`, only valid when standalone output is absent |

`next start` against a standalone build prints a warning and serves the wrong
tree (no `.next/static` next to `server.js`). Do not "fix" that with `next start`;
use the script.

## The four traps this repo already hit

1. **Untraced ESM helpers.** Next's tracer copies only `@swc/helpers/cjs` under
   pnpm, while the runtime require-hook resolves the ESM build → boot dies with
   `MODULE_NOT_FOUND ... @swc/helpers/esm/_interop_require_default.js`.
   `outputFileTracingIncludes` pulls the `esm/**` glob in. Removing that config
   reintroduces the crash. Verify with:
   `ls .next/standalone/node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/`
2. **Static assets are not traced.** `.next/static` and `public/` must be copied
   next to `server.js` — the Dockerfile `COPY`s them, the start script `cpSync`s
   them. A page rendering but all CSS 404ing means this step was skipped.
3. **The generated server `chdir`s into its own directory**, so Next's env loader
   never sees repo-root `.env` / `.env.local`. The script passes them with
   `--env-file=` (later file wins, matching Next's precedence).
4. **Relative paths move with the `chdir`.** `LEISH_DB_PATH` is pinned to
   `<repo>/data/leish.db` so `next dev`, `next start` and standalone share one
   database; otherwise a fresh, empty SQLite file appears under `.next/standalone`.

Also: the standalone server binds to `HOSTNAME`, and an interactive shell often
exports the machine name. The script defaults it to `0.0.0.0`; use
`LEISH_HOSTNAME` to pin a specific interface.

## Verifying a build

```bash
pnpm run build && pnpm run start
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/             # 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/images/hero.jpg
```

If a chunk 404s, `static` was not copied. If boot complains about missing env
vars, the `--env-file` step was skipped (`SKIP_ENV_VALIDATION=1` is a local
convenience, not a fix).

## The other build target

`vinext` / `@vinext/cloudflare` / `wrangler` produce a Cloudflare Workers build
(`build:vinext`, `start:vinext`). They are build tooling, not runtime
dependencies, so they belong in `devDependencies`. Note they currently carry the
bulk of the `pnpm audit` findings; moving them out of `dependencies` also
removes that chain from a `--prod` audit.

## Docker

`Dockerfile` copies `.next/standalone`, `.next/static`, `public` and runs
`node server.js` — equivalent to the start script, minus the env-file handling
(Docker injects real env vars). Health check hits `/api/health`.
