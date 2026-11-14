import { describe, expect, it } from "vitest";
import { demo } from "../lib/demo";
import { replay, stationDetail, summarize } from "../lib/performance";

describe("demo data + server aggregation", () => {
  const rows = demo.outcomes();
  it("demo has 100 stations and about 72 h of 15-minute forecasts", () => {
    expect(demo.latest()).toHaveLength(100);
    expect(rows.length).toBeGreaterThan(25_000);
  });
  it("summarize returns small, consistent payloads", () => {
    const s = summarize(rows, "empty");
    expect(s.windowHours).toBeGreaterThan(60);
    expect(s.times.length).toBeGreaterThan(250);
    expect(s.scoreboard[1]!.newEventsCaught).toBe(0);
    expect(s.stations).toHaveLength(100);
    expect(JSON.stringify(s).length).toBeLessThan(200_000);
  });
  it("replay classifies every station at a time", () => {
    const s = summarize(rows, "full");
    const r = replay(rows, "full", s.times.at(-1)!);
    const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(r.stations.length);
    expect(r.stations.length).toBe(100);
  });
  it("station detail aligns forecasts and observed counts", () => {
    const id = demo.latest()[0]!.station_id;
    const d = stationDetail(rows, demo.history(id), id, "empty");
    expect(d.forecasts.length).toBeGreaterThan(250);
    expect(d.counts.length).toBeGreaterThan(800);
    expect(d.threshold).toBeCloseTo(0.4);
  });
});
