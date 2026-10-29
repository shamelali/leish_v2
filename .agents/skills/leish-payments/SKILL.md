---
name: leish-payments
description: "Use when changing anything that moves money in this repo: booking fee (deposit), balance payments, quotations, payouts, commission/waivers, payment provider adapters (Billplz, HitPay, dev), or the Billplz webhook. Triggers: payments table, payouts, markBillPaid, handlePaymentPaid, verifyBillplzSignature, paid_amount mismatch, duplicate/replayed webhook, double charge, settlement, refund, commission."
metadata:
  author: leish
  version: "1.0.0"
---

# Payment flow invariants

## Where it lives

- `src/server/payments.ts` — provider calls, `verifyBillplzSignature()`, `markBillPaid()`, `handlePaymentPaid()`
- `src/app/api/payments/webhook/route.ts` — the only real-money entry point
- `src/server/payouts.ts`, `src/server/settings.ts` — settlement and commission
- `src/server/integrations.ts` — provider selection + health reporting

Two rows per booking in `payments`, `UNIQUE(booking_id, type)`, `type ∈ {deposit, balance}`.
The deposit is a flat non-refundable fee (`booking_fee_sen`, default RM 50);
the balance is quotation total − deposit.

## Webhook order — do not reorder these steps

1. Read the **raw** body (never `request.json()`, the HMAC is over the exact bytes)
   and verify `X-Billplz-Signature` via `verifyBillplzSignature(rawBody, signature)`.
2. Resolve the `payments` row by `provider_ref` *before* mutating anything.
3. Refund guard: a paid callback for `status = 'refunded'` is logged and reported,
   never applied.
4. Amount check: `paid_amount` (falling back to `amount`) converted with `toSen()`
   must equal the stored amount.
5. `markBillPaid(payload.id)` — this is the idempotency boundary.
6. Only when step 5 returns `true`, run `handlePaymentPaid(payment)`:
   deposit confirms the booking, balance marks the quotation paid and creates the payout.
7. Return 200 once handled; the gateway retries indefinitely otherwise.

## markBillPaid is the concurrency guard

```ts
UPDATE payments SET status = 'paid', updated_at = ?
 WHERE provider_ref = ? AND status IN ('required','failed')
```

`changes > 0` means "this is the first time". Never replace it with
SELECT-then-UPDATE (racy), never widen the status set (that is how a refunded
payment comes back to life), never drop the `WHERE`.

## Payouts

- Created for `balance` only, after the paid transition, keyed by `booking_id`
  with a UNIQUE index and `ON CONFLICT DO NOTHING`.
- Statuses `pending | settled | failed`; admin settles via `/api/admin/payouts`.
- Commission is **artist-side**: the client always pays the quoted total.
  `computeCommission()` applies `commission_rate_bps` and `commission_waiver_sen`.

## Secrets

`BILLPLZ_API_KEY` is both the API credential **and** the webhook HMAC secret.
Never log it, echo it, or send it to the client. A leak is a payment-integrity
incident, not a routine credential rotation.

## Adding a second provider

HitPay credentials are documented but there is no adapter code. When adding one:

- Keep the mark-paid transition a single conditional UPDATE keyed on `provider_ref`.
- Do **not** auto-failover bill *creation*. A timed-out request may already have
  created a bill at the first gateway; retrying at the second double-charges.
  Expose it as an explicit user choice instead.

## Tests to extend

`src/server/payments.test.ts` and `src/app/api/payments/webhook/route.test.ts`.
Every new branch needs: replayed callback → no change; amount mismatch → no
change; refund after callback → ignored; balance paid → exactly one payout.
