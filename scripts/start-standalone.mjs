#!/usr/bin/env node
/**
 * Production entrypoint for this repo.
 *
 * `next.config.ts` emits `output: "standalone"` (except on Vercel), and Next
 * refuses to run `next start` against that output. The standalone bundle ships
 * server.js plus traced node_modules but NOT the static assets, so they have to
 * be placed next to it before boot — this is exactly what the Dockerfile does
 * with COPY. Doing it here keeps `pnpm run start` and the container in sync.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(root, ".next", "standalone");
const serverEntry = path.join(standaloneDir, "server.js");

if (!existsSync(serverEntry)) {
  console.error(
    "[start] .next/standalone/server.js is missing — run `pnpm run build` first.\n" +
      "[start] (A build made with VERCEL=1 produces no standalone output; use `pnpm run start:next` there.)",
  );
  process.exit(1);
}

for (const [from, to] of [
  [path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static")],
  [path.join(root, "public"), path.join(standaloneDir, "public")],
]) {
  if (existsSync(from)) cpSync(from, to, { recursive: true, force: true });
}

const envFiles = [path.join(root, ".env"), path.join(root, ".env.local")].filter((file) =>
  existsSync(file),
);

const child = spawn(
  process.execPath,
  [
    // The generated server `chdir`s into its own directory, so Next's env
    // loader never sees the repo-root .env files. Feed them in explicitly
    // (later files win, matching Next's .env.local over .env precedence).
    ...envFiles.flatMap((file) => [`--env-file=${file}`]),
    serverEntry,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: process.env.PORT ?? "3000",
      // Same reason: a relative SQLite path would land inside .next/standalone
      // (the server `chdir`s there) and be wiped by the next build. Pin it to
      // the repo so `next dev`, `next start`, this script and the e2e fixture
      // seeder all share one file — including when the caller supplies a
      // relative path such as playwright's ./data/e2e.db.
      LEISH_DB_PATH: process.env.LEISH_DB_PATH
        ? path.resolve(root, process.env.LEISH_DB_PATH)
        : path.join(root, "data", "leish.db"),
      // The standalone server binds to HOSTNAME, and an interactive shell
      // already exports the machine name — which would make http://localhost
      // unreachable (and fail Playwright's `webServer` health check).
      // LEISH_HOSTNAME is the explicit override for a specific interface.
      HOSTNAME: process.env.LEISH_HOSTNAME ?? "0.0.0.0",
    },
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => process.exit(signal ? 0 : (code ?? 1)));
