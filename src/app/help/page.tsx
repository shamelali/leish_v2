import type { Metadata } from "next";
export const metadata: Metadata = { title: "Help Centre — Leish!" };
export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-semibold">Help Centre</h1>
      <p className="mt-2 text-stone-500">How Leish! works for customers and artists.</p>

      <div className="mt-10 space-y-10">
        <section><h2 className="text-lg font-semibold">For Customers</h2>
          <div className="mt-4 space-y-4">
            <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">How do I book?</summary><p className="mt-2 text-sm text-stone-600">Browse Artists → Check real-time availability → Select service, date, location → Pay via Billplz (FPX/Card) → Receive confirmation.</p></details>
            <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Payments & Billplz</summary><p className="mt-2 text-sm text-stone-600">We use Billplz. No card data stored on Leish!. Receipt issued instantly. Invoices retained 7 years per Malaysian law, then PII stripped.</p></details>
            <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Cancellation</summary><p className="mt-2 text-sm text-stone-600">&gt;48h 100% refund, 24-48h 50%, &lt;24h no refund. Artist cancels = full refund.</p></details>
          </div>
        </section>

        <section><h2 className="text-lg font-semibold">For Artists</h2>
          <div className="mt-4 space-y-4">
            <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">How do I join?</summary><p className="mt-2 text-sm text-stone-600">Go to /onboarding → Verify IC, portfolio, hygiene cert → Set services & prices → Go live.</p></details>
            <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Payouts</summary><p className="mt-2 text-sm text-stone-600">Payouts T+2 after service completion, minus Leish! commission. S3 invoices encrypted with SSE-KMS.</p></details>
          </div>
        </section>

        <section className="rounded-xl bg-rose-50 p-6 dark:bg-rose-950/20"><h3 className="font-semibold">Need help?</h3><p className="mt-2 text-sm">Email hello@leish.my — Response within 24h. For data requests: dpo@leish.my</p></section>
      </div>
    </div>
  );
}
