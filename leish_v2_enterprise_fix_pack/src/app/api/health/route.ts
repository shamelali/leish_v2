import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
export async function GET() {
  try { await getDb().prepare("SELECT 1 as ok").get(); return NextResponse.json({ status:"ok", version:"2.0.0", uptime: process.uptime() }); }
  catch (e:any) { return NextResponse.json({ status:"degraded", error: e.message }, { status:503 }); }
}
