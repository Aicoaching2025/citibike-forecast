import type { Target } from "./types";

export const parseTarget = (v: string | null): Target => (v === "full" ? "full" : "empty");

/** Station ids are UUIDs or short alphanumeric ids; reject anything else before it reaches SQL. */
export const isStationId = (v: string): boolean => /^[A-Za-z0-9_-]{1,64}$/.test(v);

export function parseIsoTime(v: string | null): string | null {
  if (!v || v.length > 40) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
