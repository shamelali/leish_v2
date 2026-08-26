import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin-auth";
import { jsonError, readJson } from "@/server/http";
import { z } from "zod";
import { payReferral, updateReferralReward } from "@/server/referral";

const updateRewardSchema = z.object({
  rewardSen: z.number().int().min(0),
});

const actionSchema = z.object({
  action: z.enum(["pay", "update_reward"]),
  rewardSen: z.number().int().min(0).optional(),
});

/**
 * PATCH /api/admin/referrals/[id] — admin actions on a referral.
 * Body: { action: "pay" | "update_reward", rewardSen?: number }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;

  const parsed = actionSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { action, rewardSen } = parsed.data;

  if (action === "pay") {
    const ok = await payReferral(id);
    if (!ok) return jsonError("Referral not found or not qualified", 404);
    return NextResponse.json({ ok: true, status: "paid" });
  }

  if (action === "update_reward") {
    const rewardParsed = updateRewardSchema.safeParse({ rewardSen });
    if (!rewardParsed.success || rewardSen === undefined) {
      return jsonError("rewardSen is required for update_reward action", 400);
    }
    const ok = await updateReferralReward(id, rewardSen);
    if (!ok) return jsonError("Referral not found", 404);
    return NextResponse.json({ ok: true, rewardSen });
  }

  return jsonError("Unknown action", 400);
}
