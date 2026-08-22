import { NextResponse } from "next/server";
import { listAllStudios } from "@/server/catalog";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";

export const GET = tryRoute(
  async function GET(request: Request) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const studios = await listAllStudios();
    return NextResponse.json({ studios });
  },
  { route: "GET /api/admin/studios" },
);
