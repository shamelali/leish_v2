# CI while GitHub Actions is billing-locked

_Written 2026-09-04._

Every workflow run on this repo fails within seconds with:

> The job was not started because your account is locked due to a billing issue.

No step has ever executed. `.github/workflows/ci.yml` is correct — it simply
never gets to run.

## Read this before replacing anything

**`shamelali/leish_v2` is a public repository, and GitHub Actions minutes are
free and unlimited on public repos.** There is no quota to exceed and nothing
to pay for. The lock is an **account-level flag**, not a usage limit, and it
blocks Actions across every repo the account owns regardless of visibility.

This is a well-documented failure mode: a failed card _authorization hold_ —
often a $1 verification that a bank declined, sometimes for a subscription
unrelated to this project — leaves a lingering flag even when the balance is
$0 and usage is 0%. The billing page frequently looks clean.

So the cheapest fix is almost certainly not migrating CI. In rough order of
effort:

1. **Check for a failed micro-payment.** Settings → Billing and plans →
   Payment history. Retry anything showing "Failed", even for cents.
2. **Remove and re-add the payment method.** This re-triggers the
   authorization hold. Widely reported as the thing that actually clears it;
   a virtual card sometimes succeeds where a physical one is declined.
3. **Set a non-zero spending limit** briefly (e.g. $1), then restore it. A $0
   limit can block Actions even when the amount owed is $0.
4. **Contact GitHub Support** (Accounts or Billing). The flag is server-side;
   if the above fails, only Support can clear it. Say explicitly that the repo
   is public, you are on the free plan, and you are not asking for paid usage.

Only if that stalls is a third-party runner worth the migration cost.

## Interim: `scripts/ci-local.sh`

Until Actions runs, this is the source of truth. It mirrors the `verify` job —
same gates, same order, same `CI=true SKIP_ENV_VALIDATION=1` environment — so a
local pass means what a green run would have meant.

```bash
./scripts/ci-local.sh          # verify job: format, lint, typecheck, test, build (~80s)
./scripts/ci-local.sh --pg     # + Postgres integration (needs DATABASE_URL)
./scripts/ci-local.sh --e2e    # + Playwright
./scripts/ci-local.sh --all    # everything
```

Passing gates stay quiet; a failure prints the last 40 lines of that gate's
output and exits non-zero.

**If you edit `ci.yml`, edit this too.** The moment they drift, a local pass
stops being evidence about CI.

## Interim: pre-push hook

Opt-in, one command per clone, no new dependency (uses git's native
`core.hooksPath` rather than Husky):

```bash
git config core.hooksPath .githooks
```

Runs format, lint, typecheck and test on every push — about 60s. The build is
excluded deliberately: it is the slowest gate and rarely fails on its own once
typecheck passes. Bypass with `git push --no-verify`.

The hook is committed, so it is shared, but git will not enable it
automatically — that is a deliberate git security property, not an oversight.

## What this does not replace

Be honest about the gap. A local gate is weaker than CI in ways that matter:

| Property                      | GitHub Actions | Local script                               |
| ----------------------------- | -------------- | ------------------------------------------ |
| Runs on a clean checkout      | ✅             | ❌ — your working tree, your node_modules  |
| Cannot be skipped             | ✅             | ❌ — `--no-verify`, or just not running it |
| Verifiable by a reviewer      | ✅             | ❌ — you are trusting the author's word    |
| Blocks merge via branch rules | ✅             | ❌                                         |
| Node 22 / Ubuntu specifically | ✅             | ❌ — whatever you happen to have           |

That last row bites: this repo requires Node >=22, and a contributor on Node 18
can pass locally and still break the build. Check with `node -v`.

The "verifiable by a reviewer" row is the one that matters for PR #19. A green
check is evidence; a claim in a comment is not. Treat local results as a
smoke test, not a merge gate, and re-run CI once the lock clears.

## If the lock cannot be cleared

Free options that work on public repos, in order of how well they fit here:

**Cirrus CI** — free for public repos, runs Linux containers, config is a
single `.cirrus.yml`. The closest drop-in: it can run the same pnpm commands
and provides real PR status checks, including a Postgres service container for
`test:pg`.

**Woodpecker or Drone on a small VPS** — full control, no vendor quota, but you
are now operating a CI server. Only sensible if you already have a box.

**Vercel's own build** — you are already deploying there, and a failed build
blocks the deploy. This gives you `build` coverage for free but **not** lint,
typecheck, tests or e2e, so it is a backstop rather than CI. Worth knowing it
exists; not worth calling it a solution.

**GitLab CI via a mirror** — 400 free minutes/month, genuinely capable, but
mirroring a GitHub repo to run CI elsewhere splits your history and status
checks across two hosts. High friction for a temporary problem.

I would not migrate for this. The lock is very likely a five-minute billing
fix, and every option above costs more than that to set up and keeps costing
attention afterwards.
