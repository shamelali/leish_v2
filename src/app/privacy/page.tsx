export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl p-10">
      <h1 className="text-4xl font-bold">Privacy Policy — PDPA Compliant</h1>
      <p className="text-sm text-stone-500 mt-2">PDPA 2010 Malaysia — 20 Aug 2026</p>
      <div className="mt-8 space-y-6 text-sm leading-7">
        <p>We collect name, phone, email, booking data, Billplz payment IDs. No card storage.</p>
        <h2 className="font-semibold text-lg">Retention & PII Stripping</h2>
        <div className="bg-stone-100 p-4 rounded-xl">
          <p>
            <b>Invoices:</b> 7 years per Malaysian law, then PII stripped (hash) and S3 image
            deleted via pg_cron.
          </p>
          <p>
            <b>Bookings:</b> Anonymized after 2 years. Logs deleted after 30 days.
          </p>
          <p>
            <b>Security:</b> S3 SSE-KMS, TLS, encrypted DB.
          </p>
        </div>
        <h2 className="font-semibold text-lg">Your Rights</h2>
        <p>
          Access, correct, withdraw consent. Email dpo@leish.my — 21 day response. JPDP complaints
          allowed.
        </p>
      </div>
    </div>
  );
}
