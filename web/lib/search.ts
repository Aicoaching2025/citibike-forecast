import type { StationRef } from "./types";

export interface SearchHit extends StationRef {
  covered: boolean;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bst\b/g, "street")
    .replace(/\bave?\b/g, "avenue")
    .replace(/\bblvd\b/g, "boulevard")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Rank station names against a free-text query. Every query word must appear
 * ("bedford n 7" finds "Bedford Ave & N 7 St"); names that start with the query rank first,
 * then forecast-covered stations, then alphabetical.
 */
export function searchStations(stations: StationRef[], query: string, covered: Set<string>, limit = 8): SearchHit[] {
  const words = norm(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const q = words.join(" ");
  return stations
    .map((s) => ({ s, n: norm(s.name) }))
    .filter(({ n }) => words.every((w) => n.includes(w)))
    .map(({ s, n }) => ({ hit: { ...s, covered: covered.has(s.station_id) }, prefix: n.startsWith(q) ? 0 : 1 }))
    .sort((a, b) => a.prefix - b.prefix || Number(b.hit.covered) - Number(a.hit.covered) || a.hit.name.localeCompare(b.hit.name))
    .slice(0, limit)
    .map((x) => x.hit);
}
