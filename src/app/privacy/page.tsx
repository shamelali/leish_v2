import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy Policy — Leish! PDPA Compliant" };
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-stone-500">PDPA 2010 (Malaysia) Compliant — Last updated: 20 Aug 2026</p>

      <div className="prose prose-stone mt-10 dark:prose-invert max-w-none space-y-8 text- leading-7">
        <section><h2 className="text-xl font-semibold">1. Introduction</h2><p>Leish! (“we”) respects your privacy under Malaysia Personal Data Protection Act 2010 (PDPA). This policy explains how we collect, use, disclose and retain personal data.</p></section>

        <section><h2 className="text-xl font-semibold">2. Personal Data We Collect</h2>
          <ul className="list-disc pl-5">
            <li><b>Identity:</b> Name, IC/passport (for verified artists), profile photo</li>
            <li><b>Contact:</b> Phone, email, address</li>
            <li><b>Booking:</b> Service type, date, location, preferences</li>
            <li><b>Financial:</b> Billplz payment IDs (we do NOT store full card numbers)</li>
            <li><b>Technical:</b> IP, device, cookies (for fraud & rate limiting)</li>
          </ul>
        </section>

        <section><h2 className="text-xl font-semibold">3. Purposes</h2><p>Booking fulfillment, artist-customer matching, payments, customer support, legal compliance (invoicing), safety/fraud prevention, platform improvement.</p></section>

        <section><h2 className="text-xl font-semibold">4. Disclosure</h2><p>We disclose data to: Artists/Studios (to fulfill booking), Billplz (payment processor), Supabase/Postgres (hosting, Singapore/MY region), S3 (encrypted storage). No selling of data.</p></section>

        <section><h2 className="text-xl font-semibold">5. Security — S3 SSE-KMS & Encryption</h2>
          <p>Data encrypted in transit (TLS) and at rest. Invoice images & uploads stored in S3 with SSE-KMS (Customer Master Key). Database encrypted. Access logged.</p>
        </section>

        <section><h2 className="text-xl font-semibold">6. Retention & PII Stripping (PDPA Compliance)</h2>
          <div className="rounded-xl bg-stone-100 p-4 dark:bg-stone-900">
            <p><b>Financial records (invoices):</b> Retained 7 years per Malaysian Income Tax Act & Companies Act, then PII stripped (name, phone, email replaced with hash) and original image deleted via pg_cron job.</p>
            <p className="mt-2"><b>Booking data:</b> Active bookings retained. Completed bookings anonymized after 2 years.</p>
            <p className="mt-2"><b>Logs:</b> IP/rate-limit logs deleted after 30 days.</p>
            <p className="mt-2 text-xs text-stone-500">Implemented: pg_cron nightly job — see scripts/retention.sql</p>
          </div>
        </section>

        <section><h2 className="text-xl font-semibold">7. Your Rights (PDPA S.12)</h2><p>You have right to access, correct, withdraw consent, and prevent processing likely to cause damage/distress. Email dpo@leish.my. We respond within 21 days.</p></section>

        <section><h2 className="text-xl font-semibold">8. Data Transfer</h2><p>Data stored in AWS ap-southeast-1 (Singapore) / Malaysia region. Transfer outside Malaysia only with consent and adequate protection per PDPA S.129.</p></section>

        <section><h2 className="text-xl font-semibold">9. Cookies</h2><p>Essential cookies for session, preferences (theme), and security. No third-party tracking without consent.</p></section>

        <section><h2 className="text-xl font-semibold">10. Contact DPO</h2><p>Data Protection Officer: dpo@leish.my — Leish!, Cyberjaya, Selangor, Malaysia. Complaints may also be lodged with Jabatan Perlindungan Data Peribadi (JPDP).</p></section>
      </div>
    </div>
  );
}
