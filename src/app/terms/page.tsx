import { LegalDoc } from "@/components/LegalDoc";

export const metadata = {
  title: "Terms of Use",
  description: "Terms for booking beauty services through Leish!",
};

export default function TermsPage() {
  return (
    <LegalDoc title="Terms of Use" updated="23 Aug 2026">
      <p>
        These Terms govern your use of <strong>leish.my</strong> (the &ldquo;Platform&rdquo;),
        operated by <strong>[LEISH OPERATING COMPANY SDN BHD]</strong> (company no.{" "}
        <strong>[NUMBER]</strong>) (&ldquo;Leish!&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).
        By creating an account or booking through the Platform you agree to these Terms and our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>1. Eligibility &amp; accounts</h2>
      <ul>
        <li>You must be at least [18] years old to book. Minors may receive services only with a parent or guardian&rsquo;s booking and supervision.</li>
        <li>Provide accurate details and keep your password confidential; you are responsible for activity under your account.</li>
        <li>Email verification is required before any payment is processed.</li>
      </ul>

      <h2>2. How bookings work</h2>
      <ol className="ml-5 list-decimal space-y-1">
        <li><strong>Request:</strong> choose an artist/studio, service, date, time and event type, then send a booking request. The slot is not reserved yet.</li>
        <li><strong>Acceptance &amp; quotation:</strong> the professional reviews your request and accepts, declines, or proposes a Quotation. Quotations are valid for the period shown (typically 24 hours).</li>
        <li><strong>Deposit:</strong> paying the deposit shown at checkout confirms the booking and locks the slot exclusively for you.</li>
        <li><strong>Balance:</strong> unless stated otherwise on your quotation, the balance is due no later than <strong>3 days before your event</strong>. We will email you reminders.</li>
      </ol>
      <p>
        A contract for the beauty service itself is formed <strong>between you and the
        professional</strong>. Leish! is a marketplace: we provide discovery, booking, messaging,
        payment collection and dispute-assistance tooling, but we do not perform beauty services and
        do not guarantee results.
      </p>

      <h2>3. Prices</h2>
      <p>
        The Quotation is the final price for the booked scope — it already includes our commission,
        so you never pay extra fees to Leish! on top. Changes requested after confirmation (extra
        guests, venue change, additional looks) must be agreed on-platform and may result in a new
        quotation.
      </p>

      <h2>4. Cancellations &amp; refunds</h2>
      <table>
        <thead>
          <tr>
            <th>When you cancel</th>
            <th>What happens</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Before the professional accepts</td>
            <td>The request lapses; nothing is charged.</td>
          </tr>
          <tr>
            <td>After confirmation, more than 3 days before the event</td>
            <td>Balance (if paid) refunded in full; deposit [retained / refunded less handling fee].</td>
          </tr>
          <tr>
            <td>Within 3 days of the event, or no-show</td>
            <td>Payments are non-refundable.</td>
          </tr>
          <tr>
            <td>Professional cancels or doesn&rsquo;t show</td>
            <td>All amounts paid are refunded to you in full.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Refunds go back to your original payment method within [5–10 business days], subject to
        gateway processing times.
      </p>

      <h2>5. Rescheduling</h2>
      <p>
        Reschedules requested more than 3 days before the event are free where the professional has
        availability. Inside 3 days, rescheduling is at the professional&rsquo;s discretion and may
        be treated as a cancellation.
      </p>

      <h2>6. Payments must stay on-platform</h2>
      <p>
        All payments must be processed through the Platform. Never pay a professional directly in
        cash or by transfer for a Platform booking — such payments are not protected by our refund
        and dispute processes.
      </p>

      <h2>7. Disputes</h2>
      <ul>
        <li>Raise service disputes within 48 hours of the appointment via [SUPPORT EMAIL] or dashboard messaging so evidence stays fresh.</li>
        <li>We mediate using on-platform records (messages, timestamps, payment status) as primary evidence and may issue refunds where fair. We do not guarantee any particular outcome.</li>
        <li>Nothing in these Terms limits your rights under Malaysian consumer law, including the Consumer Protection Act 1999.</li>
      </ul>

      <h2>8. Conduct &amp; reviews</h2>
      <p>
        Be accurate about event details and treat professionals respectfully. Do not arrange
        off-platform payments for Platform bookings. Reviews are for genuine completed bookings;
        we remove defamatory or fraudulent reviews and otherwise publish them unedited.
      </p>

      <h2>9. Privacy</h2>
      <p>
        Our <a href="/privacy">Privacy Policy</a> explains what we collect and why, including what
        we share with the professional servicing your booking (name, contact, event details).
        Personal data is handled per the Personal Data Protection Act 2010.
      </p>

      <h2>10. Availability &amp; changes to these terms</h2>
      <p>
        The Platform is provided &ldquo;as is&rdquo;; we aim for high uptime but do not guarantee
        uninterrupted service. We may modify these Terms with 14 days&rsquo; notice by email or
        on-site notice; continued use constitutes acceptance. Paid bookings are governed by the
        Terms in force when you booked.
      </p>

      <h2>11. Liability</h2>
      <p>
        To the maximum extent permitted by law, Leish!&rsquo;s aggregate liability arising from your
        use of the Platform is limited to the total fees you paid through the Platform in the
        6 months before the claim. We are not liable for indirect or consequential loss, or for
        professionals&rsquo; acts and omissions except as expressly stated above. Professionals
        remain solely responsible for the quality and safety of the services they deliver.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of Malaysia. Disputes fall under the exclusive
        jurisdiction of the courts of [Kuala Lumpur]. Questions? <a href="/contact">Contact us</a>.
      </p>
    </LegalDoc>
  );
}
