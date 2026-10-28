#!/usr/bin/env bash
#
# Post local CI evidence to the pull request.
#
# Runs scripts/ci-local.sh (the same gates as .github/workflows/ci.yml) and
# posts — or refreshes — a single PR comment containing the gate table, the
# commit, and the toolchain versions. Exists because GitHub Actions is blocked
# by an account-level billing lock (see docs/CI-WITHOUT-ACTIONS.md), where the
# weakest link in local CI is that "a claim in a comment is not evidence".
# A machine-generated comment tied to a commit SHA is closer to evidence: the
# reviewer can see the run happened, on which commit, with which versions.
#
# This still is NOT an independent gate. It does not block merge, and the
# author could have edited the script. It is a stopgap, not a substitute.
#
# Usage:
#   ./scripts/ci-report.sh            # run every gate, then post/refresh the comment
#   ./scripts/ci-report.sh --dry-run  # run + print the comment body, do not post
#   ./scripts/ci-report.sh --pr 23    # target a specific PR instead of the current branch
#
# Requires: gh (authenticated), pnpm/node, and a PR that exists for HEAD.

set -uo pipefail

MARKER="<!-- ci-local-report -->"
DRY_RUN=0
PR_OVERRIDE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --pr)
      PR_OVERRIDE="${2:-}"
      shift
      ;;
    -h | --help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      echo "unknown option: $1" >&2
      exit 2
      ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SUMMARY="$(mktemp)"
FULL_LOG="$(mktemp)"
trap 'rm -f "$SUMMARY" "$FULL_LOG"' EXIT

echo "▸ running local CI (mirrors .github/workflows/ci.yml)…"
CI_LOCAL_SUMMARY="$SUMMARY" ./scripts/ci-local.sh 2>&1 | tee "$FULL_LOG"
CI_STATUS=${PIPESTATUS[0]}

SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
NODE_V="$(node -v 2>/dev/null || echo "node?")"
PNPM_V="$(pnpm -v 2>/dev/null || echo "pnpm?")"
WHEN="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

PASS_COUNT="$(awk -F'\t' 'NR>1 && $2=="pass"' "$SUMMARY" | wc -l | tr -d ' ')"
FAIL_COUNT="$(awk -F'\t' 'NR>1 && $2=="fail"' "$SUMMARY" | wc -l | tr -d ' ')"
if [ "$FAIL_COUNT" = "0" ]; then
  HEADLINE="✅ **All ${PASS_COUNT} gates passed**"
else
  HEADLINE="❌ **${FAIL_COUNT} gate(s) failed**, ${PASS_COUNT} passed"
fi

BODY="$(mktemp)"
{
  echo "$MARKER"
  echo "### Local CI evidence — \`./scripts/ci-local.sh\`"
  echo
  echo "$HEADLINE"
  echo
  echo "| gate | result | seconds |"
  echo "| --- | --- | --- |"
  awk -F'\t' 'NR>1 {
    icon = ($2 == "pass") ? "✅ pass" : "❌ fail";
    printf "| %s | %s | %s |\n", $1, icon, $3
  }' "$SUMMARY"
  echo
  echo "- commit: \`$SHORT_SHA\` (\`$BRANCH\`)"
  echo "- toolchain: node \`$NODE_V\` · pnpm \`$PNPM_V\` · \`$(uname -s)/$(uname -m)\`"
  echo "- run at: \`$WHEN\`"
  echo
  if [ "$FAIL_COUNT" != "0" ]; then
    echo "<details><summary>Failing gate output (last 40 lines)</summary>"
    echo
    echo '```'
    tail -n 40 "$FULL_LOG"
    echo '```'
    echo
    echo "</details>"
    echo
  fi
  echo "> Posted by \`scripts/ci-report.sh\` because GitHub Actions is blocked by an"
  echo "> account-level billing lock on this account. These gates mirror"
  echo "> \`.github/workflows/ci.yml\` but ran on a **local** machine: this is evidence,"
  echo "> not an independent gate, and it does not block merge. See"
  echo "> \`docs/CI-WITHOUT-ACTIONS.md\`."
} >"$BODY"

if [ "$DRY_RUN" = "1" ]; then
  echo
  echo "─── comment body (dry run, not posted) ───"
  cat "$BODY"
  exit "$CI_STATUS"
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh not found — cannot post the report. Body follows:" >&2
  cat "$BODY" >&2
  exit "$CI_STATUS"
fi

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
if [ -z "$REPO" ]; then
  echo "could not resolve the GitHub repo (is gh authenticated?) — skipping post" >&2
  exit "$CI_STATUS"
fi

if [ -n "$PR_OVERRIDE" ]; then
  PR="$PR_OVERRIDE"
else
  PR="$(gh pr view "$BRANCH" --repo "$REPO" --json number --jq .number 2>/dev/null || true)"
fi

if [ -z "$PR" ]; then
  echo "no pull request for '$BRANCH' — printing the report instead:" >&2
  cat "$BODY" >&2
  exit "$CI_STATUS"
fi

# Refresh our previous comment when one exists, so a branch keeps one record.
COMMENT_ID="$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
  --jq ".[] | select(.body | contains(\"$MARKER\")) | .id" 2>/dev/null | tail -n 1)"

if [ -n "$COMMENT_ID" ]; then
  if gh api -X PATCH "repos/$REPO/issues/comments/$COMMENT_ID" -F "body=@$BODY" >/dev/null 2>&1; then
    echo "▸ refreshed CI report comment on PR #$PR (comment $COMMENT_ID)"
  else
    echo "failed to update comment $COMMENT_ID" >&2
    exit "$CI_STATUS"
  fi
else
  if gh api -X POST "repos/$REPO/issues/$PR/comments" -F "body=@$BODY" >/dev/null 2>&1; then
    echo "▸ posted CI report comment on PR #$PR"
  else
    echo "failed to post the CI report comment" >&2
    exit "$CI_STATUS"
  fi
fi

echo "▸ head commit $SHORT_SHA"
exit "$CI_STATUS"
