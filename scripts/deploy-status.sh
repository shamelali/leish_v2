#!/usr/bin/env bash
#
# Check the latest Vercel deployment status.
#
# Usage:
#   bash scripts/deploy-status.sh
#
# Prerequisites:
#   - VERCEL_PROJECT_ID and VERCEL_ACCESS_TOKEN set (or in .env.local)
#   - curl and jq available
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load VERCEL_ACCESS_TOKEN from .env.local if not already set
if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  # shellcheck disable=SC1091
  [[ -z "${VERCEL_ACCESS_TOKEN:-}" ]] && export VERCEL_ACCESS_TOKEN="$(grep '^VERCEL_ACCESS_TOKEN=' "$PROJECT_ROOT/.env.local" | cut -d'"' -f2)"
fi

if [[ -z "${VERCEL_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: VERCEL_ACCESS_TOKEN is required."
  echo "  Get one at: https://vercel.com/account/tokens"
  echo "  Add it to .env.local: VERCEL_ACCESS_TOKEN=your_token"
  exit 1
fi

echo "→ Checking latest deployment for: duta-integra/leishv2"

RESPONSE="$(curl -s --max-time 30 \
  "https://api.vercel.com/v13/deployments?project=leishv2&teamId=duta-integra&limit=1" \
  -H "Authorization: Bearer $VERCEL_ACCESS_TOKEN")"

if command -v jq &>/dev/null; then
  echo "$RESPONSE" | jq -r '.deployments[0] | "  Status: \(.state)\n  URL: https://\(.url)\n  Created: \(.createdAt)\n  Source: \(.meta?.githubCommitRef ?? "manual")"'
else
  echo "$RESPONSE"
fi

echo ""
echo "  Dashboard: https://vercel.com/duta-integra/leishv2/deployments"
