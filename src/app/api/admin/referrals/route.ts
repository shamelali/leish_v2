import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin-auth";
import { getAllReferrals } from "@/server/referral";

/**
 * GET /api/admin/referrals — list all referrals (admin only).
 * Query params: ?status=pending|qualified|paid&limit=50&offset=0
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

  const referrals = await getAllReferrals();

  let filtered = referrals;
  if (status && ["pending", "qualified", "paid"].includes(status)) {
    filtered = filtered.filter((r) => r.status === status);
  }

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    referrals: paginated,
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  });
}
