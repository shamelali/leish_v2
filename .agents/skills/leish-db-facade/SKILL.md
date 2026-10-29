---
name: leish-db-facade
description: "Use when touching the database layer: adding or altering a table/column, writing SQL, changing the pg/sqlite facade, or running migrations. Triggers: src/server/db.ts, getDb, DbFacade, PG_SCHEMA, SQLITE_SCHEMA, @name placeholders, $1 placeholders, scripts/migrate.ts, pnpm run db:migrate, test:pg, Postgres integration tests, SQLITE fallback."
metadata:
  author: leish
  version: "1.0.0"
---

# Database facade

## One API, two backends

`getDb()` returns a `DbFacade` (`src/server/db.ts:33`):

```ts
interface DbFacade {
  prepare(sql: string): Statement; // .get<T>(), .all<T>(), .run() -> { changes }
  exec(sql: string): Promise<void> | void;
}
```

- `DATABASE_URL` set → `pg` Pool. Otherwise `node:sqlite` (in-memory under tests).
- `isPostgres()` reports which one is live.
- `getDb()` is **synchronous**; the pg schema migrates lazily on first query.

## Placeholders

Write `@name` (preferred) or `?`. The facade compiles both to pg's `$1..$n`.
Never write `$1` directly — it breaks the SQLite path, and the compiler will
not rewrite it.

## Schema parity is a hard requirement

`PG_SCHEMA` and `SQLITE_SCHEMA` both live in `src/server/db.ts`. Any column,
index, or constraint added to one must be added to the other. There is no
migration tool that derives one from the other.

## Changing the schema

1. Edit both schema constants.
2. Make `scripts/migrate.ts` tolerant: PostgreSQL `ALTER TABLE ... ADD COLUMN`
   is not idempotent, so migrations must check `information_schema` (or wrap in
   a guard) before applying. Index creation should not abort the run — a
   pre-existing duplicate blocks a UNIQUE index forever, so log and continue.
3. Run `pnpm run db:migrate` against a real database.
4. Add or extend the integration tests in `src/server/__integration__/`
   (`pnpm run test:pg`). CI runs those against a `postgres:16` service
   container; locally they skip without `DATABASE_URL`.

## Notes

- SQLite is the local default and the fallback when `DATABASE_URL` is unset, so
  an accidental SQLite-only feature passes every unit test and fails in
  production. Always exercise both paths for schema work.
- Tests seed directly through `getDb()`; there is no ORM and no fixtures layer.
- `scripts/retain-purge.mjs` reads `POSTGRES_URL` and falls back to
  `DATABASE_URL`; keep that in mind before renaming either.
