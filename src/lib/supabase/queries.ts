import { createServiceRoleClient } from "./server";
import type { Database } from "@/lib/types/database";

type ReferralRow = Database["public"]["Tables"]["referrals"]["Row"];

export async function insertReferral(
  referrerId: string,
  refereeId: string,
  productId: string | null,
  status: "pending" | "completed" | "cancelled" = "pending",
  rewardAmount: number | null = null
) {
  const supa = createServiceRoleClient();

  const { error } = await supa
    .from("referrals")
    .insert({
      referrer_id: referrerId,
      referee_id: refereeId,
      product_id: productId,
      status,
      reward_amount: rewardAmount,
    });

  if (error) {
    throw new Error(`[supabase] Failed to insert referral: ${error.message}`);
  }
}

export async function getReferralByRefereeId(
  refereeId: string
): Promise<ReferralRow | null> {
  const supa = createServiceRoleClient();

  const { data, error } = await supa
    .from("referrals")
    .select("*")
    .eq("referee_id", refereeId)
    .single();

  if (error) {
    throw new Error(`[supabase] Failed to fetch referral: ${error.message}`);
  }

  return data || null;
}

export async function getReferralsByReferrerId(
  referrerId: string
): Promise<ReferralRow[]> {
  const supa = createServiceRoleClient();

  const { data, error } = await supa
    .from("referrals")
    .select("*")
    .eq("referrer_id", referrerId);

  if (error) {
    throw new Error(`[supabase] Failed to fetch referrals: ${error.message}`);
  }

  return data || [];
}