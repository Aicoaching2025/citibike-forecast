import { ok, fail } from "@/lib/api";
import { getLatest } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getLatest(), 60);
  } catch (e) {
    return fail(e);
  }
}
