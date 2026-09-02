#!/usr/bin/env node
/**
 * Verification script to confirm Brevo email configuration
 *
 * Run with: node --experimental-strip-types verify-brevo-config.js
 * (imports the TypeScript module src/server/integrations.ts directly)
 */

import { getActiveEmailProvider, isEmailConfigured } from "./src/server/integrations.ts";

console.log('🔍 Verifying Leish! v2 Email Configuration\n');

const provider = getActiveEmailProvider();
const configured = isEmailConfigured();

console.log(`Active Email Provider: ${provider}`);
console.log(`Is Configured (not dev): ${configured}`);
console.log(`BREVO_API_KEY Set: ${process.env.BREVO_API_KEY ? 'YES' : 'NO'}`);
console.log(`EMAIL_PROVIDER: ${process.env.EMAIL_PROVIDER || '(not set)'}\n`);

if (provider === 'brevo') {
  console.log('✅ SUCCESS: Application is configured to use Brevo for email sending');
  console.log('📧 When you trigger email actions (registration, booking, etc.),');
  console.log('   emails will be sent via Brevo API');
} else if (provider === 'dev') {
  console.log('⚠️  WARNING: Application is using dev outbox (emails stored in database)');
  console.log('   To use Brevo, ensure EMAIL_PROVIDER is not set or BREVO_API_KEY is configured');
} else {
  console.log(`ℹ️  INFO: Application is using ${provider} for email sending`);
}

console.log('\n📋 To test email flows:');
console.log('   1. Register a test user at /auth/register');
console.log('   2. Create a test booking');
console.log('   3. Check Brevo dashboard → Emails → Sent');
console.log('   4. Check logs: vercel logs --project leish_v2 --email');

console.log('\n🔐 Security Note:');
console.log('   - Never commit .env.local with real keys');
console.log('   - Never share API keys in chats or logs');
console.log('   - Use vercel env add for secure production configuration');