import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { getHistory, getOutcomes } from "@/lib/data";
import { stationDetail } from "@/lib/performance";
import { isStationId, parseTarget } from "@/lib/params";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isStationId(id)) return NextResponse.json({ error: "Invalid station id." }, { status: 400 });
    const target = parseTarget(req.nextUrl.searchParams.get("target"));
    const [outcomes, history] = await Promise.all([getOutcomes(), getHistory(id)]);
    return ok({ source: outcomes.source, data: stationDetail(outcomes.data, history.data, id, target) }, 120);
  } catch (e) {
    return fail(e);
  }
}
