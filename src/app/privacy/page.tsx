import { LegalDoc } from "@/components/LegalDoc";

export const metadata = {
  title: "Privacy Policy",
  description: "How Leish! collects, uses and protects your personal data (PDPA 2010).",
};

export default function PrivacyPage() {
  return (
    <LegalDoc title="Privacy Policy" updated="23 Aug 2026">
      <p>
        Leish! (&ldquo;we&rdquo;, &ldquo;us&rdquo;), operated by{" "}
        <strong>[LEISH OPERATING COMPANY SDN BHD]</strong> (company no. <strong>[NUMBER]</strong>),
        respects and is committed to the protection of your personal data under the{" "}
        <strong>Personal Data Protection Act 2010 (&ldquo;PDPA&rdquo;)</strong>. This policy
        explains what we collect, why, who we share it with, and your rights.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email address, password (hashed — we never store it in readable form).</li>
        <li><strong>Booking data:</strong> service, event type, date, time, venue, guest count, notes you provide.</li>
        <li><strong>Payment data:</strong> amounts and payment references via our gateway (Billplz). We do not store card or bank credentials on our servers.</li>
        <li><strong>Communications:</strong> messages sent through booking threads, and support correspondence.</li>
        <li><strong>Technical data:</strong> IP address and basic request logs for security and debugging.</li>
      </ul>

      <h2>2. Why we use it</h2>
      <ul>
        <li>To create and manage your account and bookings.</li>
        <li>To connect you with the artist/studio you booked: they receive the details needed to perform the service (name, contact, event details).</li>
        <li>To collect deposits and balances, issue invoices and process refunds through our payment gateway.</li>
        <li>To send transactional emails: verification, booking updates, quotation notices, balance reminders. Marketing emails are opt-in and every message includes an unsubscribe link.</li>
        <li>To prevent fraud, enforce our terms, and keep the platform secure.</li>
      </ul>

      <h2>3. Who we share it with</h2>
      <ul>
        <li><strong>The professional you book</strong> — only the details necessary to deliver the service.</li>
        <li><strong>Payment gateway (Billplz)</strong> — payment processing, under their own privacy terms.</li>
        <li><strong>Email delivery providers</strong> — to send you transactional mail.</li>
        <li><strong>Authorities</strong> — where required by law.</li>
      </ul>
      <p>We never sell your personal data.</p>

      <h2>4. Retention</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Retention</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Invoices &amp; payment records</td>
            <td>[7 years], as required by Malaysian law; personal identifiers are then stripped.</td>
          </tr>
          <tr>
            <td>Bookings</td>
            <td>Anonymised [2 years] after the event date.</td>
          </tr>
          <tr>
            <td>Security &amp; request logs</td>
            <td>[30 days].</td>
          </tr>
          <tr>
            <td>Account data</td>
            <td>Until you delete your account, plus any legally required retention period.</td>
          </tr>
        </tbody>
      </table>

      <h2>5. Security</h2>
      <p>
        Passwords are hashed with a memory-hard algorithm (scrypt); sessions use signed,
        HTTP-only cookies; data in transit is encrypted (TLS); database access follows
        least-privilege practices.
      </p>

      <h2>6. Your rights</h2>
      <p>
        Under PDPA you may request access to your personal data, corrections, or withdrawal of
        consent (which may end our ability to provide services). You can also export a copy of
        your booking data anytime from your dashboard. Write to{" "}
        <strong>[DPO / PRIVACY EMAIL]</strong> — we respond within [21 days]. You may complain to
        the Personal Data Protection Department (JPDP) at any time.
      </p>

      <h2>7. Cookies</h2>
      <p>
        We use a single essential cookie for your login session and store your light/dark theme
        preference locally in your browser. No advertising trackers.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update this policy from time to time; material changes will be announced on-site
        or by email. Questions? <a href="/contact">Contact us</a>.
      </p>
    </LegalDoc>
  );
}
