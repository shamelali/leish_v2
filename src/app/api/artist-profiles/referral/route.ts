import { NextResponse } from "next/server";
import { verifySessionToken } from "@/server/session";
import { getClaimedArtistIds } from "@/server/artist-profiles";
import { jsonError } from "@/server/http";
import {
  getOrCreateReferralCode,
  getReferralsByReferrer,
  getReferralStats,
  type ReferrerType,
} from "@/server/referral";

/**
 * GET /api/artist-profiles/referral — referral info for the claiming user.
 * Query params: ?type=artist|studio (defaults to artist)
 */
export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return jsonError("Not authenticated", 401);

  const url = new URL(request.url);
  const type = (url.searchParams.get("type") as ReferrerType) ?? "artist";

  const claimedIds = await getClaimedArtistIds(payload.sub);
  if (claimedIds.length === 0) {
    return jsonError("No claimed profile found", 404);
  }

  // Use the first claimed profile (artists typically claim one)
  const entityId = claimedIds[0];

  const [referralCode, stats, referrals] = await Promise.all([
    getOrCreateReferralCode(type, entityId),
    getReferralStats(type, entityId),
    getReferralsByReferrer(type, entityId),
  ]);

  return NextResponse.json({
    referralCode,
    stats,
    referrals: referrals.slice(0, 50),
  });
}
