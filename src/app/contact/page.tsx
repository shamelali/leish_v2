import type { Metadata } from "next";
export const metadata: Metadata = { title: "Contact — Leish!" };
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-semibold">Contact</h1>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border p-6"><h3 className="font-semibold">General</h3><p className="mt-2 text-sm text-stone-600">hello@leish.my<br/>Cyberjaya, Selangor, Malaysia</p></div>
        <div className="rounded-2xl border p-6"><h3 className="font-semibold">Data Protection (DPO)</h3><p className="mt-2 text-sm text-stone-600">dpo@leish.my<br/>PDPA requests — 21 day response</p></div>
        <div className="rounded-2xl border p-6"><h3 className="font-semibold">Support</h3><p className="mt-2 text-sm text-stone-600">support@leish.my<br/>Bookings, payments, cancellations</p></div>
        <div className="rounded-2xl border p-6"><h3 className="font-semibold">Artist Onboarding</h3><p className="mt-2 text-sm text-stone-600">artists@leish.my<br/>Verification & payouts</p></div>
      </div>
    </div>
  );
}
