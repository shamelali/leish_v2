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

The lock is **account-level**, so it follows `shamelali` (the user account) rather
than this repository. That single fact drives every option below: anything that
keeps the repo under the locked account inherits the lock, and anything that
moves execution to a different _billing account_ does not.

| Option                                                                               | Effort     | Restores `ci.yml` as-is? | Posts PR checks on this repo? | Notes                                                                                                               |
| ------------------------------------------------------------------------------------ | ---------- | ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **A. Move the repo to the `Duta-Integra` org**                                       | Low–medium | ✅                       | ✅                            | Org billing is separate from the personal account                                                                   |
| **B. Fork the repo into the org / a second account**                                 | Low        | ✅ (in the fork)         | ❌ upstream PRs still blocked | Evidence lives in the fork's Actions tab                                                                            |
| **C. Azure Pipelines**                                                               | Medium     | ❌ (new YAML)            | ✅                            | Free for public projects; first-class GitHub checks                                                                 |
| **D. CircleCI**                                                                      | Medium     | ❌ (new YAML)            | ✅                            | 30k credits/mo (~3k–6k Linux min); GitHub app posts checks                                                          |
| **E. Cirrus CI**                                                                     | Medium     | ❌ (`.cirrus.yml`)       | ✅                            | Closest Linux-container drop-in; Postgres service container                                                         |
| **F. Local CI + `ci-report.sh`**                                                     | **None**   | ✅ (mirrored)            | ❌                            | Already wired; machine-generated evidence comment                                                                   |
| **G. Vercel build**                                                                  | None       | —                        | ❌                            | Build coverage only; not lint/typecheck/test                                                                        |
| **H. Self-hosted or "faster" runners** (Blacksmith, Depot, RunsOn, Tenki, Namespace) | —          | —                        | —                             | ❌ **Does not work** — they replace the runner, not the scheduler; the job never starts while the account is locked |
| **I. Jenkins / Drone / Woodpecker on a VPS**                                         | High       | ❌                       | ✅ (with webhooks)            | You now operate a CI server                                                                                         |

### A. Move the repository to the `Duta-Integra` organization

The cleanest real fix that keeps GitHub Actions. Billing is attached to the
**account that owns the repository**, and `Duta-Integra` is a separate GitHub
organisation with its own billing settings — the personal lock should not follow
the repo. Public repositories get unlimited Actions minutes, so the org needs no
payment method.

```bash
# Requires admin on the repo and create-repo rights on the org:
gh api -X POST repos/shamelali/leish_v2/transfer \
  -f new_owner="Duta-Integra"
```

- Transfers preserve issues, PRs (numbering included), stars and watchers, and
  GitHub leaves redirects for the old URLs.
- After transferring: re-point the Vercel Git connection (Vercel matches the
  repo by full name), re-authorise any GitHub Apps (CodeRabbit, Arena), and
  update `gh`/`git remote` locally.
- Verify before relying on it: org → Settings → Billing should show no
  outstanding issue, then re-run a workflow and confirm the job **executes
  steps** rather than failing in ~3 s with zero steps.
- If the org itself is later locked, the same logic moves the repo again — this
  is a property of account boundaries, not of the organisation.

### B. Fork into another (unlocked) account

Lowest disruption to the canonical repo: keep `shamelali/leish_v2` as-is, fork
it into `Duta-Integra` (or a second personal account), and push feature branches
there to get real Actions runs. Actions in a fork are billed to the fork's
owner, so they run regardless of the upstream lock.

The catch: a PR opened _upstream_ is evaluated in the upstream repository's
Actions, which is still locked — so fork CI evidence does not appear on this
repo's PRs. It appears in the fork's Actions tab; paste the run link on the
upstream PR (or have the fork's workflow comment it back). Use this when you
need a real runner now and cannot move the repo.

### C–E. External hosted CI

Any of these runs on a public repo without touching GitHub's billing, and all
three post commit statuses back to GitHub PRs, which is the property local CI
lacks. The gate list is identical — install, format, lint, typecheck, test,
build — so a port is ~20 lines of YAML:

```yaml
# azure-pipelines.yml (Azure Pipelines — free for public projects)
trigger: [main]
pr: [main]
pool: { vmImage: ubuntu-latest }
steps:
  - task: NodeTool@0
    inputs: { versionSpec: "22.x" }
  - script: corepack enable && pnpm install --frozen-lockfile
  - script: pnpm run format:check
  - script: pnpm run lint
  - script: pnpm run typecheck
  - script: pnpm run test:coverage
  - script: pnpm run build
    env: { SKIP_ENV_VALIDATION: "1" }
```

Add a Postgres service container if you want `test:pg` covered too. Keep
`scripts/ci-local.sh` and `ci.yml` in sync with whatever you port — three
copies of the gate list drift fastest.

### F. Local CI, now with reviewable evidence

`scripts/ci-report.sh` runs `scripts/ci-local.sh` and posts (or refreshes) a
single PR comment containing the gate table, commit SHA, and toolchain versions:

```bash
./scripts/ci-report.sh              # run gates, then post/refresh the PR comment
./scripts/ci-report.sh --dry-run    # print the comment without posting
```

This narrows the "verifiable by a reviewer" gap in the table above — the comment
is machine-generated, tied to a commit, and refreshed on each run rather than
re-asserted by hand. It does **not** close it: nothing blocks merge on it, and
the author still controls the machine. Treat it as a smoke test with a receipt.

## Recommendation

1. **Move to the `Duta-Integra` org (A)** if you want the problem gone properly.
   It is the only option here that restores `ci.yml`, branch-protection checks
   and the deploy workflow without maintaining a second CI system, and it is a
   one-time cost rather than a permanent one.
2. **Local CI + `ci-report.sh` (F) meanwhile** — already wired, no new accounts,
   and it gives reviewers a receipt per commit.
3. **Azure Pipelines or CircleCI (C/D)** only if moving the repo is not
   acceptable and you need independent PR checks on _this_ repository.
4. Do not spend time on faster-runner services (H) — they cannot start a job
   while the account is locked.
