#!/usr/bin/env bash
#
# Local stand-in for .github/workflows/ci.yml.
#
# Runs the same gates, in the same order, with the same env as the `verify`
# job so a local pass means the same thing a green CI run would. Exists because
# GitHub Actions is blocked by an account-level billing lock (see
# docs/CI-WITHOUT-ACTIONS.md) — this is the interim source of truth.
#
# Usage:
#   ./scripts/ci-local.sh          # verify job (format, lint, typecheck, test, build)
#   ./scripts/ci-local.sh --e2e    # also run Playwright
#   ./scripts/ci-local.sh --pg     # also run Postgres integration tests
#   ./scripts/ci-local.sh --all    # everything
#
# Keep the gate list in sync with ci.yml. If they drift, this stops being
# evidence of anything.

set -uo pipefail

export CI="true"
export SKIP_ENV_VALIDATION="1"

RUN_E2E=0
RUN_PG=0
for arg in "$@"; do
  case "$arg" in
    --e2e) RUN_E2E=1 ;;
    --pg) RUN_PG=1 ;;
    --all) RUN_E2E=1; RUN_PG=1 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || {
    echo "pnpm not found and corepack enable failed" >&2
    exit 1
  }
fi

BOLD=$(tput bold 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
DIM=$(tput dim 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

FAILED=()
PASSED=()
LOGDIR="$(mktemp -d)"
trap 'rm -rf "$LOGDIR"' EXIT

# Run a gate, streaming nothing unless it fails — a passing run should be quiet
# enough to read at a glance, a failing one should show everything.
gate() {
  local name="$1"; shift
  local log="$LOGDIR/${name// /_}.log"
  printf "%s▸ %-12s%s " "$DIM" "$name" "$RESET"
  local start=$SECONDS
  if "$@" >"$log" 2>&1; then
    PASSED+=("$name")
    printf "%s✓%s %ss\n" "$GREEN" "$RESET" "$((SECONDS - start))"
  else
    FAILED+=("$name")
    printf "%s✗%s %ss\n" "$RED" "$RESET" "$((SECONDS - start))"
    echo "$DIM─── $name output ───$RESET"
    tail -n 40 "$log"
    echo "$DIM───$RESET"
  fi
}

echo "${BOLD}Local CI${RESET} ${DIM}(mirrors .github/workflows/ci.yml)${RESET}"
echo

gate "install"   pnpm install --frozen-lockfile
gate "format"    pnpm run format:check
gate "lint"      pnpm run lint
gate "typecheck" pnpm run typecheck
gate "test"      pnpm run test:coverage
gate "build"     pnpm run build

if [ "$RUN_PG" = "1" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "${DIM}▸ pg           skipped (DATABASE_URL unset)${RESET}"
  else
    gate "pg" pnpm run test:pg
  fi
fi

if [ "$RUN_E2E" = "1" ]; then
  gate "e2e" pnpm run e2e
fi

echo
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "${GREEN}${BOLD}All ${#PASSED[@]} gates passed.${RESET}"
  exit 0
fi
echo "${RED}${BOLD}${#FAILED[@]} failed:${RESET} ${FAILED[*]}"
exit 1
