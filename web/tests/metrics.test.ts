import { describe, expect, it } from "vitest";
import { calibrationBins, category, circlePolygon, haversineM, hourlyBrier, rankStations, scoreboard } from "../lib/metrics";
import { isStationId, parseIsoTime, parseTarget } from "../lib/params";
import type { Outcome, Prediction } from "../lib/types";

const pred = (o: Partial<Prediction>): Prediction => ({
  station_id: "s", name: "s", lat: 40.75, lon: -73.98, capacity: 20, prediction_time_utc: "2026-11-12T00:00:00.000Z",
  num_bikes_available: 5, num_docks_available: 15, p_empty: 0.1, pred_empty: 0, threshold_empty: 0.4,
  p_full: 0.1, pred_full: 0, threshold_full: 0.47, model_version_empty: "2", model_version_full: "2",
  scored_at: "2026-11-12T00:03:00.000Z", ...o,
});

const out = (o: Partial<Outcome>): Outcome => ({
  station_id: "s", name: "s", lat: 40.75, lon: -73.98, prediction_time_utc: "2026-11-12T00:00:00.000Z",
  num_bikes_available: 5, num_docks_available: 5, p_empty: 0.1, pred_empty: 0, threshold_empty: 0.4,
  p_full: 0.1, pred_full: 0, threshold_full: 0.47, empty_label: 0, full_label: 0, model_version_empty: "2", ...o,
});

describe("haversineM", () => {
  it("Times Square to Grand Central is ~0.9 km", () => {
    const d = haversineM(40.758, -73.9855, 40.7527, -73.9772);
    expect(d).toBeGreaterThan(850);
    expect(d).toBeLessThan(1000);
  });
});

describe("rankStations", () => {
  const preds = [
    pred({ name: "a", lat: 40.75, p_empty: 0.9, pred_empty: 1, num_bikes_available: 0 }),
    pred({ name: "b", lat: 40.751, p_empty: 0.1, num_bikes_available: 5 }),
    pred({ name: "c", lat: 40.8, p_empty: 0.0 }),
    pred({ name: "nolat", lat: null }),
  ];
  it("keeps stations within the radius, best chance first", () => {
    const r = rankStations(preds, 40.75, -73.98, "bike", 500);
    expect(r.map((s) => s.name)).toEqual(["b", "a"]);
    expect(r[0]!.chance).toBeCloseTo(0.9);
    expect(r[1]!.flagged).toBe(true);
  });
  it("uses p_full for docks", () => {
    const r = rankStations([pred({ name: "x", p_full: 0.7 }), pred({ name: "y", lat: 40.7501, p_full: 0.2 })], 40.75, -73.98, "dock", 500);
    expect(r.map((s) => s.name)).toEqual(["y", "x"]);
  });
});

describe("category", () => {
  it("maps flag x outcome", () => {
    expect([category(1, 1), category(0, 1), category(1, 0), category(0, 0)]).toEqual(["caught", "missed", "false_alarm", "quiet"]);
  });
});

describe("scoreboard", () => {
  const rows = [
    out({ empty_label: 1, num_bikes_available: 0, pred_empty: 1, p_empty: 0.9 }), // already empty, stays
    out({ empty_label: 1, num_bikes_available: 2, pred_empty: 1, p_empty: 0.6 }), // onset caught
    out({ empty_label: 0, num_bikes_available: 0, pred_empty: 1, p_empty: 0.7 }), // recovers
    out({ empty_label: 0, num_bikes_available: 5, pred_empty: 0, p_empty: 0.1 }),
    out({ empty_label: 1, num_bikes_available: 3, pred_empty: 0, p_empty: 0.2 }), // onset missed
  ];
  const [model, pers] = scoreboard(rows, "empty");
  it("counts onsets; persistence never catches one", () => {
    expect(model!.newEvents).toBe(2);
    expect(model!.newEventsCaught).toBe(1);
    expect(pers!.newEventsCaught).toBe(0);
  });
  it("computes precision and Brier", () => {
    expect(model!.precision).toBeCloseTo(2 / 3);
    expect(pers!.precision).toBeCloseTo(0.5);
    expect(pers!.brier).toBeCloseTo(3 / 5);
  });
  it("handles no rows", () => {
    expect(scoreboard([], "full")[0]!.precision).toBeNull();
  });
});

describe("calibrationBins and hourlyBrier", () => {
  it("bins probabilities and drops sparse bins", () => {
    const p = Array.from({ length: 1000 }, (_, i) => i / 1000);
    const y = p.map((v) => (v > 0.5 ? 1 : 0));
    const bins = calibrationBins(p, y);
    expect(bins).toHaveLength(10);
    expect(bins[0]!.obsRate).toBe(0);
    expect(bins[9]!.obsRate).toBe(1);
  });
  it("groups by UTC hour", () => {
    const rows = [out({ prediction_time_utc: "2026-11-12T00:15:00.000Z" }), out({ prediction_time_utc: "2026-11-12T01:00:00.000Z" })];
    expect(hourlyBrier(rows, "empty").map((h) => h.hour)).toEqual(["2026-11-12T00:00:00.000Z", "2026-11-12T01:00:00.000Z"]);
  });
});

describe("params and geometry", () => {
  it("validates input", () => {
    expect(parseTarget("full")).toBe("full");
    expect(parseTarget("drop table")).toBe("empty");
    expect(isStationId("00d3e65e-b614-4408-aaa9-939ed96ce645")).toBe(true);
    expect(isStationId("x'; DROP TABLE t; --")).toBe(false);
    expect(parseIsoTime("2026-11-12T00:15:00Z")).toBe("2026-11-12T00:15:00.000Z");
    expect(parseIsoTime("nope")).toBeNull();
  });
  it("closes the radius polygon", () => {
    const c = circlePolygon(40.75, -73.98, 800).geometry.coordinates[0]!;
    expect(c[0]).toEqual(c.at(-1));
  });
});
