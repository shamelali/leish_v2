#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

RUN_UNIT=false
for arg in "$@"; do
  if [ "$arg" = "--unit" ]; then
    RUN_UNIT=true
  fi
done

if [ -f .env.local ]; then
  set -a && source .env.local && set +a
elif [ -f .env.example ]; then
  set -a && source .env.example && set +a
fi

export LEISH_DB_PATH="${LEISH_DB_PATH:-:memory:}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[integration-test] No DATABASE_URL — using SQLite in-memory"
fi

if [ -z "${SESSION_SECRET:-}" ]; then
  export SESSION_SECRET="integration-test-secret-32-bytes-long!!"
fi

if ! command -v node &>/dev/null; then
  echo "[integration-test] ERROR: node not found" >&2
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  echo "[integration-test] ERROR: pnpm not found" >&2
  exit 1
fi

if [ -n "${DATABASE_URL:-}" ]; then
  PG_WAIT="${PG_WAIT_SECONDS:-30}"
  echo "[integration-test] Waiting for PostgreSQL (max ${PG_WAIT}s)..."
  ELAPSED=0
  until node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT 1').then(()=>{p.end();process.exit(0)}).catch(()=>{p.end();process.exit(1)})" 2>/dev/null; do
    sleep 1
    ELAPSED=$((ELAPSED + 1))
    if [ "$ELAPSED" -ge "$PG_WAIT" ]; then
      echo "[integration-test] ERROR: PostgreSQL not ready after ${PG_WAIT}s" >&2
      exit 1
    fi
    echo "[integration-test] ...waiting (${ELAPSED}s/${PG_WAIT}s)"
  done
  echo "[integration-test] PostgreSQL is ready"

  echo "[integration-test] Running migrations..."
  pnpm run db:migrate
else
  echo "[integration-test] No DATABASE_URL — using SQLite in-memory (skip migrations)"
fi

echo "[integration-test] Running PG integration tests..."
EXIT_CODE=0
pnpm vitest run --config vitest.pg.config.mts || EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "[integration-test] Integration tests FAILED (exit $EXIT_CODE)" >&2
  if [ "$RUN_UNIT" = true ]; then
    echo "[integration-test] Skipping unit tests due to integration failure"
  fi
  exit "$EXIT_CODE"
fi

echo "[integration-test] Integration tests PASSED"

if [ "$RUN_UNIT" = true ]; then
  echo "[integration-test] Running unit tests..."
  pnpm test || EXIT_CODE=$?
  if [ "$EXIT_CODE" -ne 0 ]; then
    echo "[integration-test] Unit tests FAILED (exit $EXIT_CODE)" >&2
    exit "$EXIT_CODE"
  fi
  echo "[integration-test] Unit tests PASSED"
fi

echo "[integration-test] All tests PASSED"
exit 0
