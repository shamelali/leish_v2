import { NextRequest, NextResponse } from "next/server";
import { sendTransactionalEmail } from "@/lib/email/brevo";
import { z } from "zod";

const schema = z.object({
  to: z.array(z.object({ email: z.string().email(), name: z.string().optional() })),
  subject: z.string().min(1),
  htmlContent: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // Shared secret check for internal route security
  const internalSecret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET;
  if (internalSecret) {
    const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const customHeader = req.headers.get("x-internal-secret");
    if (authHeader !== internalSecret && customHeader !== internalSecret) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

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
