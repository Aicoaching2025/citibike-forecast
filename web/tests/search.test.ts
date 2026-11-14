import { describe, expect, it } from "vitest";
import { searchStations } from "@/lib/search";

const S = [
  { station_id: "1", name: "Bedford Ave & N 7 St", lat: 40.72, lon: -73.96 },
  { station_id: "2", name: "N 7 St & Driggs Ave", lat: 40.72, lon: -73.95 },
  { station_id: "3", name: "Marcy Ave & Lynch St", lat: 40.7, lon: -73.95 },
  { station_id: "4", name: "Bedford Ave & Nostrand Ave", lat: 40.68, lon: -73.95 },
];

describe("searchStations", () => {
  it("matches every word, with abbreviations normalised", () => {
    const r = searchStations(S, "bedford n 7 street", new Set());
    expect(r.map((h) => h.station_id)).toEqual(["1"]);
  });
  it("ranks prefix matches first, then covered stations", () => {
    const r = searchStations(S, "bedford", new Set(["4"]));
    expect(r.map((h) => h.station_id)).toEqual(["4", "1"]);
    expect(r[0]!.covered).toBe(true);
    expect(r[1]!.covered).toBe(false);
  });
  it("returns nothing for empty or non-matching queries", () => {
    expect(searchStations(S, "  ", new Set())).toEqual([]);
    expect(searchStations(S, "times square", new Set())).toEqual([]);
  });
});
