import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error("Missing R2 credentials");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const BUCKETS = [
  { name: "artist-images", prefix: "artists/portfolio" },
  { name: "studio-images", prefix: "studios/portfolio" },
  { name: "invoices", prefix: "invoices" },
  { name: "avatars", prefix: "avatars" },
] as const;

async function migrateBucket(bucketName: string, r2Prefix: string) {
  console.log(`\n--- Migrating ${bucketName} -> ${r2Prefix} ---`);

  const { data: objects, error } = await supabase.storage
    .from(bucketName)
    .list("", { limit: 1000 });
  if (error) {
    console.error(`Failed to list ${bucketName}:`, error);
    return { success: 0, failed: 0, skipped: 0 };
  }

  let success = 0;
  let failed = 0;
  const skipped = 0;

  for (const obj of objects ?? []) {
    if (obj.metadata === null && obj.name.endsWith(".emptyFolderPlaceholder")) continue;

    const key = `${r2Prefix}/${obj.name}`;
    console.log(`  ${obj.name} (${obj.metadata?.size ?? "unknown"} bytes) -> ${key}`);

    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(bucketName)
        .download(obj.name);

      if (downloadError || !fileData) {
        console.error(`    Failed to download:`, downloadError);
        failed++;
        continue;
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = obj.metadata?.mimetype || "application/octet-stream";

      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );

      console.log(`    ✓ Uploaded (${buffer.length} bytes)`);
      success++;
    } catch (err) {
      console.error(`    ✗ Upload failed:`, err);
      failed++;
    }
  }

  return { success, failed, skipped };
}

async function verifyMigration() {
  console.log("\n--- Verifying R2 objects ---");
  let total = 0;
  for (const { prefix } of BUCKETS) {
    const response = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix }));
    const count = response.Contents?.length ?? 0;
    console.log(`${prefix}: ${count} objects`);
    total += count;
  }
  console.log(`Total in R2: ${total}`);
}

async function main() {
  console.log("Starting Supabase Storage -> R2 migration");
  console.log(`Source: ${SUPABASE_URL}`);
  console.log(`Target: ${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`);

  let totalSuccess = 0;
  let totalFailed = 0;

  for (const { name, prefix } of BUCKETS) {
    const result = await migrateBucket(name, prefix);
    totalSuccess += result.success;
    totalFailed += result.failed;
  }

  await verifyMigration();

  console.log("\n--- Summary ---");
  console.log(`Success: ${totalSuccess}`);
  console.log(`Failed: ${totalFailed}`);

  if (totalFailed > 0) {
    console.log("\n⚠ Some files failed to migrate. Check logs above.");
    process.exit(1);
  } else {
    console.log("\n✓ Migration completed successfully!");
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
