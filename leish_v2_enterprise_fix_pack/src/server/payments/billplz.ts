import crypto from "node:crypto";
import { env } from "@/lib/env";
import { getDb } from "@/server/db/client";
import { logger } from "@/server/logger";
export function verifyBillplzSignature(payload: Record<string,string>, xSignature: string): boolean {
  const keys = Object.keys(payload).filter(k=>k!=="x_signature").sort();
  const message = keys.map(k=>payload[k]).join("|");
  const expected = crypto.createHmac("sha256", env.BILLPLZ_X_SIGNATURE!).update(message).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(xSignature)); } catch { return false; }
}
export async function handleWebhook(body: Record<string,string>) {
  const sig = body.x_signature as string;
  if (!verifyBillplzSignature(body, sig)) throw new Error("Invalid HMAC");
  const billId = body.id;
  const existing = await getDb().prepare("SELECT status FROM payments WHERE billplz_id=$1").get(billId).catch(() => getDb().prepare("SELECT status FROM payments WHERE billplz_id=?").get(billId)) as any;
  if (existing && existing.status==="paid") { logger.info({ billId }, "duplicate webhook ignored"); return; }
  const paid = body.paid==="true" || !!body.paid_at;
  if (paid) {
    await getDb().transaction(async (tx:any) => {
      try {
        await tx.query("UPDATE payments SET status='paid', paid_at=NOW() WHERE billplz_id=$1", [billId]);
        const payment = await getDb().prepare("SELECT booking_id FROM payments WHERE billplz_id=$1").get(billId) as any;
        if (payment) await getDb().prepare("UPDATE bookings SET status='confirmed' WHERE id=$1").run(payment.booking_id);
      } catch {
        tx.exec?.("BEGIN");
        tx.prepare("UPDATE payments SET status='paid' WHERE billplz_id=?").run(billId);
        const payment = tx.prepare("SELECT booking_id FROM payments WHERE billplz_id=?").get(billId) as any;
        if (payment) tx.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(payment.booking_id);
      }
    });
  }
}
