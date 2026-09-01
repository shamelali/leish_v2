#!/usr/bin/env node
/**
 * Verification script to confirm Brevo email configuration
 * (Simple version that doesn't require importing TS files)
 */

console.log('🔍 Verifying Leish! v2 Email Configuration\n');

// Read environment variables directly
const emailProvider = process.env.EMAIL_PROVIDER;
const brevoApiKey = process.env.BREVO_API_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const postmarkServerToken = process.env.POSTMARK_SERVER_TOKEN;

// Determine active provider based on integrations.ts logic
let activeProvider;
if (emailProvider === 'resend' || emailProvider === 'postmark' || emailProvider === 'brevo' || emailProvider === 'dev') {
  activeProvider = emailProvider;
} else {
  // Auto-detect from credentials
  if (resendApiKey) activeProvider = 'resend';
  else if (postmarkServerToken) activeProvider = 'postmark';
  else if (brevoApiKey) activeProvider = 'brevo';
  else activeProvider = 'dev';
}

const isConfigured = activeProvider !== 'dev';

console.log(`Active Email Provider: ${activeProvider}`);
console.log(`Is Configured (not dev): ${isConfigured}`);
console.log(`BREVO_API_KEY Set: ${brevoApiKey ? 'YES' : 'NO'}`);
console.log(`EMAIL_PROVIDER: ${emailProvider || '(not set)'}\n`);

if (activeProvider === 'brevo') {
  console.log('✅ SUCCESS: Application is configured to use Brevo for email sending');
  console.log('📧 When you trigger email actions (registration, booking, etc.),');
  console.log('   emails will be sent via Brevo API');
} else if (activeProvider === 'dev') {
  console.log('⚠️  WARNING: Application is using dev outbox (emails stored in database)');
  console.log('   To use Brevo, ensure EMAIL_PROVIDER is not set or BREVO_API_KEY is configured');
} else {
  console.log(`ℹ️  INFO: Application is using ${activeProvider} for email sending`);
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