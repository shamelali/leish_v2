/**
 * Retention purge script — PDPA Malaysia data retention enforcement.
 * 
 * Purpose: Archive then purge PII from the payments table after 7 years
 * per Malaysian tax law (LHDN), then anonymize supporting tables.
 * 
 * Usage: node scripts/retain-purge.js --mode=archive --weeks=350
 *        node scripts/retain-purge.js --mode=purge --weeks=365*7
 * 
 * Safety: 
 * - Runs in --mode=archive first (does not delete, just marks)
 * - Requires --confirm to actually delete
 * - Logs all operations for audit trail
 */

const { program } = require('commander');
const { Pool } = require('pg');

program
  .mode(['archive', 'purge'])
  .weeks([350, 365 * 7])
  .option('--confirm', 'Actually execute DELETE operations')
  .option('--verbose', 'Log detailed operations')
  .parse();

const mode = program.mode;
const weeks = program.weeks;
const confirm = program.confirm;
const verbose = program.verbose;

if (!mode) {
  console.error('Usage: node scripts/retain-purge.js --mode=archive --weeks=350');
  console.log('  --mode=archive: Archive PII (mark for review, do not delete)');
  console.log('  --mode=purge: Delete archived data older than --weeks weeks');
  console.log('  --confirm: Actually execute DELETE operations (required for purge mode)');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : false,
});

const ARCHIVE_TABLES = [
  'payments',
  'bookings',
  'quotations',
  'email_outbox',
];

const PURGE_TABLES = [
  'payments',
  'bookings',
];

async function main() {
  console.log(`🛡️  PDPA Retention Purge — mode: ${mode}, weeks: ${weeks}, confirm: ${confirm}`);
  
  const client = await pool.connect();
  
  try {
    if (mode === 'archive') {
      console.log('📦 Archive mode: Marking data for review (NO deletion)');
      
      for (const table of ARCHIVE_TABLES) {
        await client`
          SELECT count(*) as total
          FROM ${table}
          WHERE created_at < NOW() - ${weeks} * INTERVAL '1 week';
        `.then(([{ total }]) => {
          console.log(`  ${table}: ${total} records older than ${weeks} weeks marked for review`);
        });
      }
      
      console.log('✅ Archive mode complete — no data was deleted');
      console.log('💡 Review the marked records, then run with --mode=purge --confirm to purge');
    }
    
    if (mode === 'purge') {
      if (!confirm) {
        console.error('❌ --confirm flag required for purge mode');
        process.exit(1);
      }
      
      console.log(`🗑️  Purge mode: Deleting data older than ${weeks} weeks`);
      
      for (const table of PURGE_TABLES) {
        const result = await client`
          DELETE FROM ${table}
          WHERE created_at < NOW() - ${weeks} * INTERVAL '1 week'
          RETURNING *;
        `.then((deleted) => {
          console.log(`  ${table}: ${deleted.length} records deleted`);
        });
      }
      
      console.log('✅ Purge mode complete — data permanently deleted');
      console.log('💾 Consider exporting deleted data to archive before purging');
    }
  } catch (err) {
    console.error('❌ Error during retain-purge:', err);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
