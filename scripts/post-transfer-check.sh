#!/usr/bin/env bash
# =============================================================================
# post-transfer-check.sh — prepare and verify the leish_v2 ownership transfer
#
# Why: GitHub Actions is locked on the personal account that owns this repo
# (every job dies in ~0 s with zero steps). Section A of
# docs/CI-WITHOUT-ACTIONS.md moves the repository to an organisation whose
# billing is separate. A transfer touches branch protection, integrations and
# URLs, so this script proves from the outside that CI really came back —
# the decisive test is that a job EXECUTES STEPS instead of dying in ~3 s.
#
# Usage:
#   scripts/post-transfer-check.sh --preflight     # run BEFORE the transfer
#   scripts/post-transfer-check.sh                 # run AFTER the transfer
#   scripts/post-transfer-check.sh --expect-sha <sha>
#   scripts/post-transfer-check.sh <new-owner> [new-repo] [old-owner/old-repo]
#
# Environment:
#   BRANCH      branch to inspect        (default arena/01a0fd28-leish-v2)
#   EXPECT_SHA  commit expected to survive the transfer
#   PR          pull request number      (default 23)
#
# Needs: gh (authenticated), git, curl.
# Exit: 0 all checks passed · 1 problems found · 2 not transferred yet
# =============================================================================
set -uo pipefail

NEW_OWNER="Duta-Integra"
REPO="leish_v2"
OLD_PATH="shamelali/leish_v2"
BRANCH="${BRANCH:-arena/01a0fd28-leish-v2}"
EXPECT_SHA="${EXPECT_SHA:-}"
PR="${PR:-23}"
PREFLIGHT=0
REQUIRED_CHECKS=(verify integration-pg e2e)

while [ $# -gt 0 ]; do
  case "$1" in
    --preflight) PREFLIGHT=1 ;;
    --expect-sha)
      shift
      EXPECT_SHA="${1:-}"
      ;;
    -h | --help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) break ;;
  esac
  shift
done
[ $# -ge 1 ] && NEW_OWNER="$1"
[ $# -ge 2 ] && REPO="$2"
[ $# -ge 3 ] && OLD_PATH="$3"

NEW_PATH="$NEW_OWNER/$REPO"

pass=0
warn=0
fail=0
ok() { printf '  \033[32m✓\033[0m %-40s %s\n' "$1" "${2:-}"; pass=$((pass + 1)); }
note() { printf '  \033[2m•\033[0m %-40s %s\n' "$1" "${2:-}"; }
warn() { printf '  \033[33m!\033[0m %-40s %s\n' "$1" "${2:-}"; warn=$((warn + 1)); }
bad() { printf '  \033[31m✗\033[0m %-40s %s\n' "$1" "${2:-}"; fail=$((fail + 1)); }
hdr() { printf '\n\033[1m%s\033[0m\n' "$1"; }

command -v gh >/dev/null || {
  echo "gh is not installed" >&2
  exit 1
}
gh auth status >/dev/null 2>&1 || {
  echo "gh is not authenticated — run: gh auth login" >&2
  exit 1
}

# gh api prints the error BODY on stdout even when 2>/dev/null hides the
# "gh: ..." line, and jq then yields "null". Treat all three as "not readable"
# so a 403/404 never masquerades as a passing check.
api() {
  local out
  out=$(gh api "$@" 2>/dev/null) || return 1
  case "$out" in
    '' | null | '[]') return 1 ;;
    *'"documentation_url"'* | *'"message"'*) return 1 ;;
  esac
  printf '%s' "$out"
}

# ---------------------------------------------------------------------------
if [ "$PREFLIGHT" = 1 ]; then
  hdr "Preflight — can this account transfer $OLD_PATH to $NEW_OWNER?"

  me=$(api user --jq .login)
  case "$me" in
    *'[bot]' | '')
      bad "authenticated as" "${me:-unknown}"
      note "" "This is a GitHub App installation token. Transfers need"
      note "" "X-Accepted-Github-Permissions: administration=write, which"
      note "" "app tokens do not have — the request returns 403"
      note "" "'Resource not accessible by integration'. Run this script"
      note "" "from a shell where you are logged in as the repo owner."
      ;;
    *) ok "authenticated as" "$me" ;;
  esac

  src=$(api "repos/$OLD_PATH" --jq '"\(.owner.type) private=\(.private) archived=\(.archived) admin=\(.permissions.admin)"')
  if [ -z "$src" ]; then
    bad "source repository readable" "$OLD_PATH"
    src_owner=""
  else
    ok "source repository" "$src"
    src_owner=$(api "repos/$OLD_PATH" --jq .owner.login)
    case "$src" in
      *admin=true*) note "" "admin=true is not sufficient: the transfer endpoint" && note "" "also requires an administration:write user token" ;;
      *) bad "admin on source repo" "needs 'Administration: Read and write'" ;;
    esac
  fi

  org=$(api "orgs/$NEW_OWNER" --jq '"\(.login) repos=\(.public_repos)"')
  [ -n "$org" ] && ok "target organisation exists" "$org" || bad "target organisation exists" "$NEW_OWNER"

  mem=$(api "user/memberships/orgs/$NEW_OWNER" --jq '"state=\(.state) role=\(.role)"')
  if [ -n "$mem" ]; then
    ok "your membership in $NEW_OWNER" "$mem"
    case "$mem" in
      *role=admin*) ;;
      *) warn "role is not admin" "only owners can create/transfer repos into an org" ;;
    esac
  else
    warn "membership unreadable" "token lacks read:org — confirm you are an Owner"
  fi

  case "$(api "repos/$NEW_PATH" --jq .full_name)" in
    '') ok "name is free in $NEW_OWNER" "$REPO" ;;
    *) bad "name already taken" "$NEW_PATH exists — rename or delete it first" ;;
  esac

  if [ -z "$EXPECT_SHA" ]; then
    EXPECT_SHA=$(git ls-remote "https://github.com/$OLD_PATH.git" "refs/heads/$BRANCH" 2>/dev/null | cut -f1)
  fi
  [ -n "$EXPECT_SHA" ] && ok "commit recorded for comparison" "${EXPECT_SHA:0:7}" || warn "could not read $BRANCH" "set EXPECT_SHA=<sha>"

  pr=$(api "repos/$OLD_PATH/pulls/$PR" --jq '"\(.state) head=\(.head.sha[0:7])"')
  [ -n "$pr" ] && ok "PR #$PR present" "$pr" || warn "PR #$PR unreadable" ""

  hdr "Expected to survive"
  printf '  %s\n' "preserved by GitHub: commits, branches, tags, issues, PRs (numbering),"
  printf '  %s\n' "  releases, wiki, stars, watchers, forks, labels, milestones;"
  printf '  %s\n' "  repository secrets and deploy keys stay associated."
  printf '  %s\n' "re-check anyway: branch protection (may drop rules the new owner"
  printf '  %s\n' "  cannot support), installed GitHub Apps, collaborators, Actions"
  printf '  %s\n' "  permissions; Vercel matches on owner/repo so it must be re-pointed."
  printf '  %s\n' "breaks if someone creates a new repo at $OLD_PATH: the redirect."

  hdr "Next step (run as $src_owner, with administration:write)"
  printf '  %s\n' "Settings → General → Danger Zone → Transfer ownership → $NEW_OWNER"
  printf '  %s\n' "  or: gh api -X POST repos/$OLD_PATH/transfer -f new_owner=$NEW_OWNER"
  printf '  %s\n' "then: scripts/post-transfer-check.sh --expect-sha ${EXPECT_SHA:0:7}"
else
  # -------------------------------------------------------------------------
  hdr "Post-transfer — is $NEW_PATH a healthy, unlocked repository?"

  meta=$(api "repos/$NEW_PATH" --jq '"\(.full_name) owner=\(.owner.type) default=\(.default_branch) archived=\(.archived) disabled=\(.disabled)"')
  if [ -z "$meta" ]; then
    bad "repository exists at new path" "$NEW_PATH — transfer has not happened yet"
    printf '\n%s\n' "Nothing transferred yet. Run: scripts/post-transfer-check.sh --preflight"
    exit 2
  fi
  ok "repository exists at new path" "$meta"
  case "$meta" in
    *owner=Organization*) ok "new owner is an organisation" "$NEW_OWNER (own billing)" ;;
    *) warn "new owner is not an organisation" "the personal billing lock may still apply" ;;
  esac

  redir=$(curl -sS -o /dev/null -w '%{http_code}|%{redirect_url}' "https://github.com/$OLD_PATH")
  case "$redir" in
    301*"$NEW_PATH"*) ok "old URL redirects" "${redir#*|}" ;;
    *) warn "old URL redirect" "$redir (expected 301 to $NEW_PATH)" ;;
  esac

  new_sha=$(git ls-remote "https://github.com/$NEW_PATH.git" "refs/heads/$BRANCH" 2>/dev/null | cut -f1)
  old_sha=$(git ls-remote "https://github.com/$OLD_PATH.git" "refs/heads/$BRANCH" 2>/dev/null | cut -f1)
  if [ -n "$new_sha" ]; then
    ok "branch survives" "$BRANCH → ${new_sha:0:7}"
    if [ -n "$EXPECT_SHA" ] && [ "$EXPECT_SHA" != "$new_sha" ]; then
      bad "commit preserved" "expected ${EXPECT_SHA:0:7}, found ${new_sha:0:7}"
    elif [ -n "$EXPECT_SHA" ]; then
      ok "commit preserved" "${EXPECT_SHA:0:7} unchanged"
    fi
    [ -n "$old_sha" ] && [ "$old_sha" = "$new_sha" ] && ok "old URL still serves git" "same sha via redirect"
  else
    bad "branch readable at new path" "$BRANCH"
  fi

  pr=$(api "repos/$NEW_PATH/pulls/$PR" --jq '"\(.state) head=\(.head.sha[0:7]) updated=\(.updated_at)"')
  [ -n "$pr" ] && ok "PR #$PR survived" "$pr" || bad "PR #$PR missing" "$NEW_PATH"

  wf=$(api "repos/$NEW_PATH/actions/workflows" --jq '.workflows[].path' | tr '\n' ' ')
  case "$wf" in
    *ci.yml*) ok "workflows present" "$wf" ;;
    *) bad "workflows missing" "${wf:-none}" ;;
  esac

  perm=$(api "repos/$NEW_PATH/actions/permissions" --jq '"enabled=\(.enabled)"')
  [ -n "$perm" ] && ok "Actions permission" "$perm" || warn "Actions permission unreadable" ""

  hdr "The decisive test — do jobs execute steps?"
  runs=$(api "repos/$NEW_PATH/actions/runs?per_page=10&branch=$BRANCH" --jq '.workflow_runs[] | "\(.databaseId)\t\(.name)\t\(.conclusion // .status)\t\(.head_sha[0:7])"')
  if [ -z "$runs" ]; then
    warn "no workflow runs on $BRANCH yet" "push a commit or re-run a failed job, then re-run this script"
  else
    while IFS=$'\t' read -r id name concl sha; do
      [ -z "$id" ] && continue
      steps=$(api "repos/$NEW_PATH/actions/runs/$id/jobs" --jq '[.jobs[].steps | length] | add // 0')
      if [ "${steps:-0}" = "0" ]; then
        bad "run $id ($name, $sha)" "0 steps → still locked ('locked due to a billing issue')"
      else
        ok "run $id ($name, $sha)" "$steps steps executed, $concl"
      fi
    done <<<"$runs"
    note "" "a job that runs steps proves billing is cleared for the new owner"
  fi

  hdr "Re-apply by hand (not carried by the transfer)"
  prot=$(api "repos/$NEW_PATH/branches/${meta##*default=}/protection" --jq '.required_status_checks.contexts // [] | join(", ")')
  if [ -n "$prot" ] || [ "$(api "repos/$NEW_PATH/branches/main/protection" --jq '.required_status_checks != null')" = "true" ]; then
    ctx=$(api "repos/$NEW_PATH/branches/main/protection" --jq '.required_status_checks.contexts // [] | join(", ")')
    ok "branch protection on main" "${ctx:-no required checks}"
    for c in "${REQUIRED_CHECKS[@]}"; do
      case ",$ctx," in
        *",$c,"*) ;;
        *"$c"*) ;;
        *) warn "required check missing" "$c — add in Settings → Branches" ;;
      esac
    done
  else
    warn "branch protection unreadable/absent" "re-check Settings → Branches → main (token may lack scope)"
  fi
  note "secrets/variables" "values are never readable — confirm CRON_SECRET + UPSTASH_* in Settings → Secrets"
  note "integrations" "re-install CodeRabbit / Arena apps and re-point the Vercel project"
  remote=$(git remote get-url origin 2>/dev/null || true)
  case "$remote" in
    *"$NEW_PATH"*) ok "local git remote updated" "$remote" ;;
    *) note "local git remote" "${remote:-none} → git remote set-url origin https://github.com/$NEW_PATH.git" ;;
  esac
fi

hdr "Summary"
printf '  %d passed · %d warnings · %d failures\n' "$pass" "$warn" "$fail"
[ "$fail" -gt 0 ] && exit 1
exit 0
