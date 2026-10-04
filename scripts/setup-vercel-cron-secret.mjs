#!/usr/bin/env node
/**
 * Upsert CRON_SECRET into a Vercel project (Production + Preview).
 *
 * The cron routes fail closed: without CRON_SECRET in the Vercel environment
 * Vercel's scheduler gets HTTP 500 and every scheduled job stops. This script
 * generates a 64-char hex secret (32 random bytes, same as
 * `openssl rand -hex 32`) and writes it to the project via the Vercel REST API.
 *
 * Safe by default — dry run unless --apply is passed:
 *
 *   node scripts/setup-vercel-cron-secret.mjs                 # dry run (prints the value)
 *   node scripts/setup-vercel-cron-secret.mjs --apply         # writes Production + Preview
 *   node scripts/setup-vercel-cron-secret.mjs --value <hex>   # use an existing secret
 *
 * Environment:
 *   VERCEL_TOKEN      required with --apply  (https://vercel.com/account/tokens)
 *   VERCEL_PROJECT    project name or id     (default: leish-v2)
 *   VERCEL_TEAM_SLUG  team slug or id        (default: shamelalis-projects; "" for personal)
 *
 * Run with `--help` for the full flag list.
 */

import { randomBytes } from "node:crypto";

const VERCEL_API = "https://api.vercel.com";
const KEY = "CRON_SECRET";

function usage() {
  console.log(`Usage: node scripts/setup-vercel-cron-secret.mjs [options]

Options:
  --apply            Write to Vercel (default is dry run)
  --value <hex>      Use this secret instead of generating one
  --project <name>   Vercel project name/id (default $VERCEL_PROJECT or leish-v2)
  --team <slug>      Vercel team slug/id (default $VERCEL_TEAM_SLUG or shamelalis-projects)
  --target <list>    Comma-separated targets (default production,preview)
  --help             Show this message

Environment:
  VERCEL_TOKEN       Required with --apply
  VERCEL_PROJECT     Alternative to --project
  VERCEL_TEAM_SLUG   Alternative to --team

After a successful --apply, redeploy (or promote) so the running functions pick
up the new variable, then verify a cron route returns 200:
  curl -s -o /dev/null -w '%{http_code}\\n' -H "Authorization: Bearer $CRON_SECRET" \\
    https://<your-domain>/api/cron/retention
`);
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    value: undefined,
    project: process.env.VERCEL_PROJECT || "leish-v2",
    team: process.env.VERCEL_TEAM_SLUG ?? "shamelalis-projects",
    targets: ["production", "preview"],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (arg === "--apply") {
      opts.apply = true;
    } else if (arg === "--value") {
      opts.value = argv[++i];
    } else if (arg === "--project") {
      opts.project = argv[++i];
    } else if (arg === "--team") {
      opts.team = argv[++i];
    } else if (arg === "--target") {
      opts.targets = String(argv[++i] ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    } else {
      console.error(`Unknown option: ${arg}`);
      usage();
      process.exit(2);
    }
  }

  if (!opts.project) {
    console.error("Missing --project (or VERCEL_PROJECT).");
    process.exit(2);
  }
  if (!opts.targets.length) {
    console.error("--target must name at least one environment.");
    process.exit(2);
  }

  return opts;
}

function generateSecret() {
  return randomBytes(32).toString("hex"); // 64 hex chars == openssl rand -hex 32
}

/** Fail without echoing either value (defends against logging a wrong secret). */
function assertLooksLikeSecret(value) {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    console.warn(
      "Warning: the supplied value is not 64 hex chars — cron auth still works, but " +
        "`openssl rand -hex 32` output is the expected format.",
    );
  }
}

async function vercelFetch(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${VERCEL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const message = json?.error?.message ?? json?.message ?? text;
    throw new Error(`Vercel API ${method} ${path} failed (${res.status}): ${message}`);
  }
  return json;
}

async function resolveTeamId(token, team) {
  if (!team) return undefined;
  const data = await vercelFetch(`/v2/teams/${encodeURIComponent(team)}`, { token });
  return data.id;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = process.env.VERCEL_TOKEN;

  if (opts.value) assertLooksLikeSecret(opts.value);
  const secret = opts.value ?? generateSecret();

  console.log(`Project:  ${opts.project}`);
  console.log(`Team:     ${opts.team || "(personal account)"}`);
  console.log(`Targets:  ${opts.targets.join(", ")}`);
  console.log(`Secret:   ${opts.apply ? "(hidden)" : secret}`);

  if (!opts.apply) {
    console.log(
      "\nDry run — nothing written. Re-run with --apply (and VERCEL_TOKEN) to upsert " +
        `${KEY} for ${opts.targets.join(", ")}.`,
    );
    return;
  }

  if (!token) {
    console.error("\nVERCEL_TOKEN is required with --apply.");
    process.exit(1);
  }

  const teamId = await resolveTeamId(token, opts.team);
  const query = teamId ? `?upsert=true&teamId=${encodeURIComponent(teamId)}` : "?upsert=true";

  const result = await vercelFetch(
    `/v10/projects/${encodeURIComponent(opts.project)}/env${query}`,
    {
      token,
      method: "POST",
      body: {
        key: KEY,
        value: secret,
        type: "encrypted",
        target: opts.targets,
        comment:
          "Cron routes fail closed without this (set by scripts/setup-vercel-cron-secret.mjs)",
      },
    },
  );

  const created = result?.created ?? result?.id ?? "(upserted)";
  console.log(
    `\n✅ ${KEY} upserted on ${opts.project} for ${opts.targets.join(", ")} (${created}).`,
  );
  console.log(
    "Redeploy (or promote) to apply, then verify a cron route returns 200 with the Bearer token.",
  );
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
