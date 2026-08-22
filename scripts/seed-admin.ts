#!/usr/bin/env npx tsx
/**
 * Seed or upgrade a user to admin role.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@leish.my ADMIN_PASSWORD=changeme npx tsx scripts/seed-admin.ts
 *
 * The script is idempotent — safe to run multiple times.
 * If the user already exists, it upgrades their role to 'admin'.
 * If not, it creates a new admin user.
 */

import { getDb, closeDb, type UserRow } from "../src/server/db";
import { hashPassword } from "../src/server/password";
import { randomUUID } from "node:crypto";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("Error: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.");
    console.error(
      "Example: ADMIN_EMAIL=admin@leish.my ADMIN_PASSWORD=changeme npx tsx scripts/seed-admin.ts",
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Error: ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const db = getDb();
  const existing = (await db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase().trim())) as UserRow | undefined;

  if (existing) {
    if (existing.role === "admin") {
      console.log(`User ${email} is already an admin. No changes needed.`);
    } else {
      await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
      console.log(`User ${email} has been upgraded to admin (was: ${existing.role}).`);
    }
  } else {
    const id = randomUUID();
    const now = new Date().toISOString();
    const hashedPassword = hashPassword(password);
    await db
      .prepare(
        `INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at)
         VALUES (@id, @email, @name, @role, @password, @email_verified, @consent, @created_at)`,
      )
      .run({
        id,
        email: email.toLowerCase().trim(),
        name: "Admin",
        role: "admin",
        password: hashedPassword,
        email_verified: 1,
        consent: 1,
        created_at: now,
      });
    console.log(`Admin user created: ${email}`);
  }

  await closeDb();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
