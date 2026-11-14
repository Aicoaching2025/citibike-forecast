/**
 * Pure functions behind every number the app shows. No I/O; unit-tested in tests/metrics.test.ts.
 * Ported from the Python app's metrics.py so both front ends agree.
 */
import type { Mode, Outcome, Prediction, Target } from "./types";

export const WALK_M_PER_MIN = 80; // ~4.8 km/h
export const HORIZON_MIN = 15;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dphi = toRad(lat2 - lat1);
  const dlmb = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlmb / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface RankedStation extends Prediction {
  distanceM: number;
  walkMin: number;
  chance: number; // probability the rider's need is met at t+15
  now: number; // bikes now (bike mode) or docks now (dock mode)
  flagged: boolean;
  within: boolean;
  beyondHorizon: boolean;
}

/** All stations with coordinates, scored for a rider at (lat, lon); `within` marks the walk radius. */
export function scoreStations(preds: Prediction[], lat: number, lon: number, mode: Mode, radiusM: number): RankedStation[] {
  return preds
    .filter((p) => p.lat !== null && p.lon !== null && Number.isFinite(p.p_empty) && Number.isFinite(p.p_full))
    .map((p) => {
      const distanceM = haversineM(lat, lon, p.lat as number, p.lon as number);
      const walkMin = distanceM / WALK_M_PER_MIN;
      const bike = mode === "bike";
      return {
        ...p,
        distanceM,
        walkMin,
        chance: bike ? 1 - p.p_empty : 1 - p.p_full,
        now: bike ? p.num_bikes_available : p.num_docks_available,
        flagged: (bike ? p.pred_empty : p.pred_full) === 1,
        within: distanceM <= radiusM,
        beyondHorizon: walkMin > HORIZON_MIN,
      };
    });
}

/** Stations within the radius, best chance first, then nearest. */
export function rankStations(preds: Prediction[], lat: number, lon: number, mode: Mode, radiusM: number): RankedStation[] {
  return scoreStations(preds, lat, lon, mode, radiusM)
    .filter((s) => s.within)
    .sort((a, b) => b.chance - a.chance || a.walkMin - b.walkMin);
}

export type Category = "caught" | "missed" | "false_alarm" | "quiet";

export function category(predFlag: number, actual: number): Category {
  if (predFlag === 1 && actual === 1) return "caught";
  if (predFlag === 0 && actual === 1) return "missed";
  if (predFlag === 1 && actual === 0) return "false_alarm";
  return "quiet";
}

export function cols(target: Target) {
  return target === "empty"
    ? ({ p: "p_empty", pred: "pred_empty", label: "empty_label", nowCount: "num_bikes_available" } as const)
    : ({ p: "p_full", pred: "pred_full", label: "full_label", nowCount: "num_docks_available" } as const);
}

export interface ScoreRow {
  forecast: "Model" | "Persistence";
  precision: number | null;
  recall: number | null;
  brier: number;
  newEvents: number;
  newEventsCaught: number;
  falseAlarms: number;
}

/**
 * Model vs persistence on the same rows. Persistence predicts the state at t carries to t+15.
 * New event (onset) = state absent at t, present at t+15; persistence catches none by construction.
 */
export function scoreboard(rows: Outcome[], target: Target): ScoreRow[] {
  const c = cols(target);
  const forecasts: [ScoreRow["forecast"], (r: Outcome) => number, (r: Outcome) => number][] = [
    ["Model", (r) => r[c.pred], (r) => r[c.p]],
    ["Persistence", (r) => (r[c.nowCount] === 0 ? 1 : 0), (r) => (r[c.nowCount] === 0 ? 1 : 0)],
  ];
  return forecasts.map(([forecast, flag, prob]) => {
    let tp = 0, fp = 0, fn = 0, se = 0, onset = 0, caught = 0;
    for (const r of rows) {
      const y = r[c.label];
      const f = flag(r);
      if (f === 1 && y === 1) tp++;
      else if (f === 1 && y === 0) fp++;
      else if (f === 0 && y === 1) fn++;
      se += (prob(r) - y) ** 2;
      const isOnset = r[c.nowCount] !== 0 && y === 1;
      if (isOnset) {
        onset++;
        if (f === 1) caught++;
      }
    }
    return {
      forecast,
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null,
      brier: rows.length ? se / rows.length : NaN,
      newEvents: onset,
      newEventsCaught: caught,
      falseAlarms: fp,
    };
  });
}

export interface CalBin {
  bin: number;
  n: number;
  meanPred: number;
  obsRate: number;
}

export function calibrationBins(p: number[], y: number[], nBins = 10, minN = 20): CalBin[] {
  const acc = Array.from({ length: nBins }, () => ({ n: 0, sp: 0, sy: 0 }));
  p.forEach((pi, i) => {
    const b = Math.min(nBins - 1, Math.max(0, Math.floor(pi * nBins)));
    const a = acc[b]!;
    a.n++;
    a.sp += pi;
    a.sy += y[i] ?? 0;
  });
  return acc
    .map((a, bin) => ({ bin, n: a.n, meanPred: a.n ? a.sp / a.n : 0, obsRate: a.n ? a.sy / a.n : 0 }))
    .filter((b) => b.n >= minN);
}

export interface HourlyRow {
  hour: string; // ISO, start of the UTC hour
  n: number;
  model: number;
  persistence: number;
}

export function hourlyBrier(rows: Outcome[], target: Target): HourlyRow[] {
  const c = cols(target);
  const m = new Map<string, { n: number; sm: number; sp: number }>();
  for (const r of rows) {
    const d = new Date(r.prediction_time_utc);
    d.setUTCMinutes(0, 0, 0);
    const k = d.toISOString();
    const y = r[c.label];
    const e = m.get(k) ?? { n: 0, sm: 0, sp: 0 };
    e.n++;
    e.sm += (r[c.p] - y) ** 2;
    e.sp += ((r[c.nowCount] === 0 ? 1 : 0) - y) ** 2;
    m.set(k, e);
  }
  return [...m.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([hour, e]) => ({ hour, n: e.n, model: e.sm / e.n, persistence: e.sp / e.n }));
}

/** GeoJSON polygon approximating a circle (for the walk-radius ring on the map). */
export function circlePolygon(lat: number, lon: number, radiusM: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lon + dLon * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}
