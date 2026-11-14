import { ok, fail } from "@/lib/api";
import { getHealth } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getHealth(), 60);
  } catch (e) {
    return fail(e);
  }
}
