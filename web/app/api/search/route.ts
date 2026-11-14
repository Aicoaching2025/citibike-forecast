import { NextResponse, type NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getAllStations, getLatest } from "@/lib/data";
import { searchStations } from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** GET /api/search?q=bedford — top matches across all stations, flagged when DockCast forecasts them. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 80) return NextResponse.json({ error: "Query must be 2-80 characters." }, { status: 400 });
  try {
    const [stations, latest] = await Promise.all([getAllStations(), getLatest()]);
    const covered = new Set(latest.data.map((p) => p.station_id));
    return ok({ source: stations.source, data: searchStations(stations.data, q, covered) }, 300);
  } catch (e) {
    return fail(e);
  }
}
