import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getOutcomes } from "@/lib/data";
import { summarize } from "@/lib/performance";
import { parseTarget } from "@/lib/params";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const target = parseTarget(req.nextUrl.searchParams.get("target"));
    const { source, data } = await getOutcomes();
    return ok({ source, data: summarize(data, target) }, 120);
  } catch (e) {
    return fail(e);
  }
}
