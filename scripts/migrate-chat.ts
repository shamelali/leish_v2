#!/usr/bin/env node
/**
 * Leish Chat Migration Script
 *
 * Calls the Next.js admin API to migrate historical messages.
 * The actual migration runs in the Next.js context with database access.
 *
 * Usage:
 *   npx tsx scripts/migrate-chat.ts [--booking-ids=id1,id2] [--dry-run] [--url=http://localhost:3000]
 */

import { program } from "commander";

program
  .name("migrate-chat")
  .description("Migrate chat messages from SSE to Durable Objects via Next.js API")
  .option("-b, --booking-ids <ids...>", "Comma-separated booking IDs to migrate (default: all)")
  .option("-d, --dry-run", "Preview migration without making changes", false)
  .option("-u, --url <url>", "Next.js app URL", "http://localhost:3000")
  .option("-t, --token <token>", "Admin session token (required)")
  .parse(process.argv);

const options = program.opts();

async function main() {
  console.log("🔄 Starting chat migration via Next.js API...");

  if (!options.token) {
    console.error("❌ --token is required (admin session token)");
    console.error("   Get it from browser cookies: leish_session=<token>");
    process.exit(1);
  }

  const bookingIds = options.bookingIds?.flatMap((id: string) => id.split(",")).filter(Boolean);
  const dryRun = options.dryRun ?? false;
  const baseUrl = options.url.replace(/\/$/, "");

  if (bookingIds) {
    console.log(`📦 Migrating bookings: ${bookingIds.join(", ")}`);
  } else {
    console.log("📦 Migrating all bookings");
  }

  if (dryRun) {
    console.log("🔍 DRY RUN - No changes will be made");
  }

  try {
    const res = await fetch(`${baseUrl}/api/admin/chat/migrate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.token}`,
      },
      body: JSON.stringify({ bookingIds, dryRun }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error(`❌ API error (${res.status}):`, result.error || result);
      process.exit(1);
    }

    if (result.success) {
      console.log(`✅ Migration completed successfully`);
      console.log(`   Migrated: ${result.migrated} messages`);
      if (result.failed > 0) {
        console.log(`   Failed: ${result.failed} messages`);
      }
    } else {
      console.log(`❌ Migration failed`);
      console.log(`   Migrated: ${result.migrated} messages`);
      console.log(`   Failed: ${result.failed} messages`);
      if (result.errors.length > 0) {
        console.log("   Errors:");
        result.errors.forEach((err: string) => console.log(`     - ${err}`));
      }
      process.exit(1);
    }
  } catch (error) {
    console.error("💥 Migration error:", error);
    process.exit(1);
  }
}

main();
