#!/usr/bin/env bash
#
# Trigger a Vercel production deployment via deploy hook.
#
# Usage:
#   bash scripts/deploy.sh                       # deploy current branch
#   VERCEL_DEPLOY_HOOK_URL=<url> bash scripts/deploy.sh  # override hook
#
# Prerequisites:
#   - VERCEL_DEPLOY_HOOK_URL set in environment or .env.local
#   - curl available
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load VERCEL_DEPLOY_HOOK_URL from .env.local if not already set
if [[ -z "${VERCEL_DEPLOY_HOOK_URL:-}" && -f "$PROJECT_ROOT/.env.local" ]]; then
  # shellcheck disable=SC1091
  export VERCEL_DEPLOY_HOOK_URL="$(grep '^VERCEL_DEPLOY_HOOK_URL=' "$PROJECT_ROOT/.env.local" | cut -d'"' -f2)"
fi

if [[ -z "${VERCEL_DEPLOY_HOOK_URL:-}" ]]; then
  echo "ERROR: VERCEL_DEPLOY_HOOK_URL is not set."
  echo "  1. Add it to .env.local: VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy/..."
  echo "  2. Or pass it inline: VERCEL_DEPLOY_HOOK_URL=<url> bash scripts/deploy.sh"
  exit 1
fi

BRANCH="$(git -C "$PROJECT_ROOT" rev-parse --abbreviate-ref HEAD 2>/dev/null || echo "unknown")"
COMMIT="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
DEPLOYER="$(git -C "$PROJECT_ROOT" config user.name 2>/dev/null || echo "unknown")"

echo "→ Triggering Vercel deployment..."
echo "  Branch:  $BRANCH"
echo "  Commit:  $COMMIT"
echo "  Trigger: $DEPLOYER"

RESPONSE="$(curl -s --max-time 30 -X POST "$VERCEL_DEPLOY_HOOK_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"source\":\"manual\",\"branch\":\"$BRANCH\",\"commit\":\"$COMMIT\",\"deployer\":\"$DEPLOYER\"}" \
  -w '\\n%{http_code}')"

HTTP_CODE="$(echo "$RESPONSE" | tail -n1)"
BODY="$(echo "$RESPONSE" | sed '$d')"

if [[ "$HTTP_CODE" == "201" || "$HTTP_CODE" == "200" ]]; then
  JOB_ID="$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"
  echo "✓ Deployment triggered successfully (HTTP $HTTP_CODE)"
  echo "  Job ID: ${JOB_ID:-unknown}"
  echo ""
  echo "  Monitor at: https://vercel.com/duta-integra/leishv2/deployments"
else
  echo "✗ Deployment trigger failed (HTTP $HTTP_CODE)"
  echo "  Response: $BODY"
  exit 1
fi
