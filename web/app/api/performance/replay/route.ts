import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { getOutcomes } from "@/lib/data";
import { replay } from "@/lib/performance";
import { parseIsoTime, parseTarget } from "@/lib/params";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const target = parseTarget(req.nextUrl.searchParams.get("target"));
    const time = parseIsoTime(req.nextUrl.searchParams.get("t"));
    if (!time) return NextResponse.json({ error: "Query parameter t must be an ISO timestamp." }, { status: 400 });
    const { source, data } = await getOutcomes();
    return ok({ source, data: replay(data, target, time) }, 300);
  } catch (e) {
    return fail(e);
  }
}
