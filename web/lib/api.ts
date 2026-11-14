import "server-only";
import { NextResponse } from "next/server";
import { ConfigError } from "./env";
import { DatabricksError } from "./databricks";

/** JSON response with CDN caching suited to data that changes every 5-15 minutes. */
export function ok<T>(body: T, maxAge = 60) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 5}` },
  });
}

/** Map internal failures to safe, readable messages; never leak tokens or stack traces. */
export function fail(err: unknown) {
  if (err instanceof ConfigError) return NextResponse.json({ error: err.message }, { status: 503 });
  if (err instanceof DatabricksError) {
    const status = err.code === "TIMEOUT" ? 504 : 502;
    console.error("[databricks]", err.code, err.message);
    return NextResponse.json({ error: "The data warehouse did not respond. Please try again shortly." }, { status });
  }
  console.error("[api]", err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}
