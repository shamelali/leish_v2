import type { Metadata } from "next";
export const metadata: Metadata = { title: "Terms of Service — Leish!" };
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-semibold">Terms of Service</h1>
      <p className="mt-2 text-sm text-stone-500">Last updated: 20 Aug 2026 — Governed by laws of Malaysia</p>

      <div className="prose prose-stone mt-10 dark:prose-invert max-w-none space-y-8 text- leading-7">
        <section><h2 className="text-xl font-semibold">1. Introduction</h2><p>Leish! (“we”, “platform”) is a beauty booking marketplace connecting customers with makeup artists and studios in Malaysia. By using leish.my, you agree to these Terms.</p></section>
        <section><h2 className="text-xl font-semibold">2. Definitions</h2><ul className="list-disc pl-5"><li><b>Customer:</b> Person booking services</li><li><b>Artist/Studio:</b> Service provider listed on Leish!</li><li><b>Booking:</b> Confirmed appointment via platform</li></ul></section>
        <section><h2 className="text-xl font-semibold">3. Accounts</h2><p>You must provide accurate info. You are responsible for credentials. Minimum age 18. One account per person/business.</p></section>
        <section><h2 className="text-xl font-semibold">4. Bookings & Payments</h2><p>All payments processed via Billplz. Full price held until service completion. Leish! charges a commission (displayed at checkout). Prices in MYR, inclusive of applicable taxes.</p></section>
        <section><h2 className="text-xl font-semibold">5. Cancellation & Refund</h2><ul className="list-disc pl-5"><li>Customer cancels &gt;48h: 100% refund</li><li>24-48h: 50% refund</li><li>&lt;24h: No refund (artist has reserved slot)</li><li>Artist cancels: Full refund + credit. Repeated cancellations may lead to delisting.</li></ul></section>
        <section><h2 className="text-xl font-semibold">6. Artist Obligations</h2><p>Artists must hold valid qualifications, maintain hygiene standards, arrive on time, and not engage in off-platform payment solicitation. Failure may result in suspension.</p></section>
        <section><h2 className="text-xl font-semibold">7. Fees</h2><p>Leish! deducts commission post-payout. Invoices retained per Malaysian law. PII stripped after retention period (see Privacy Policy).</p></section>
        <section><h2 className="text-xl font-semibold">8. Limitation of Liability</h2><p>Platform is intermediary. Max liability limited to booking fee. Not liable for indirect damages. Services performed by independent artists.</p></section>
        <section><h2 className="text-xl font-semibold">9. Governing Law</h2><p>These Terms governed by laws of Malaysia. Disputes subject to courts of Selangor / KL, Malaysia. PDPA 2010 applies.</p></section>
        <section><h2 className="text-xl font-semibold">10. Contact</h2><p>Email: hello@leish.my — Cyberjaya, Selangor, Malaysia.</p></section>
      </div>
    </div>
  );
}
