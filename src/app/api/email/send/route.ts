import { NextRequest, NextResponse } from "next/server";
import { sendTransactionalEmail } from "@/lib/email/brevo";
import { z } from "zod";

// Internal-only route — call from server actions/webhooks, not the client.
// TODO: add an internal shared-secret header check before wiring this up
// to anything reachable from the browser.
const schema = z.object({
  to: z.array(z.object({ email: z.string().email(), name: z.string().optional() })),
  subject: z.string().min(1),
  htmlContent: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    await sendTransactionalEmail(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[POST /api/email/send]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
