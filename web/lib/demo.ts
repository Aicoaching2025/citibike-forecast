import { z } from "zod";
import realStations from "@/data/stations.json";
import type { CheckRow, HealthKpis, Outcome, Prediction, Snapshot } from "./types";

// Optional real station list (id, name, lat, lon, capacity) exported from live_station_info.
// When present, demo mode places synthetic counts on real stations; otherwise it invents them.
const StationRow = z.object({
  station_id: z.coerce.string().min(1),
  name: z.string().min(1),
  lat: z.coerce.number().min(40.4).max(41.0),
  lon: z.coerce.number().min(-74.3).max(-73.6),
  capacity: z.coerce.number().int().min(1).max(200),
});
const parsed = z.array(StationRow).safeParse(realStations);
if (!parsed.success) console.warn("data/stations.json is invalid; demo falls back to synthetic stations.", parsed.error.issues.slice(0, 3));
const REAL = parsed.success ? parsed.data : [];

/**
 * Deterministic synthetic data in the same shape as the live tables.
 * Used when DEMO_MODE=1 (local development, preview deployments, offline demos).
 * The UI labels it as demo data everywhere it appears.
 */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

const N_STATIONS = 100;
const HOURS = 72;
const STEP_MIN = 5;

interface Built {
  latest: Prediction[];
  outcomes: Outcome[];
  history: Map<string, Snapshot[]>;
  now: Date;
}
let built: Built | null = null;

function build(): Built {
  const rand = mulberry32(622);
  // Anchor "now" to the last quarter hour so the demo always looks current.
  const now = new Date();
  now.setUTCSeconds(0, 0);
  now.setUTCMinutes(now.getUTCMinutes() - (now.getUTCMinutes() % 15));
  const start = new Date(now.getTime() - HOURS * 3600_000);
  const steps = (HOURS * 60) / STEP_MIN;

  const stations = REAL.length
    ? REAL.map((r, i) => ({ ...r, kind: i % 3 }))
    : Array.from({ length: N_STATIONS }, (_, i) => ({
        station_id: `demo-${String(i).padStart(3, "0")}`,
        name: `Demo Station ${String(i).padStart(3, "0")}`,
        lat: 40.705 + rand() * 0.095,
        lon: -74.015 + rand() * 0.075,
        capacity: 15 + Math.floor(rand() * 31),
        kind: i % 3,
      }));

  const latest: Prediction[] = [];
  const outcomes: Outcome[] = [];
  const history = new Map<string, Snapshot[]>();

  for (const s of stations) {
    let b = 2 + Math.floor(rand() * (s.capacity - 3));
    const series: Snapshot[] = [];
    for (let k = 0; k <= steps; k++) {
      const t = new Date(start.getTime() + k * STEP_MIN * 60_000);
      const h = (t.getUTCHours() + 19) % 24; // UTC -> New York (EST)
      let drift = 0;
      if (s.kind === 0) drift = h >= 7 && h <= 9 ? -1.6 : h >= 17 && h <= 19 ? 1.4 : 0;
      if (s.kind === 1) drift = h >= 7 && h <= 9 ? 1.6 : h >= 17 && h <= 19 ? -1.4 : 0;
      b = Math.round(b + drift + 0.04 * (s.capacity / 2 - b) + 1.4 * normal(rand));
      b = Math.max(0, Math.min(s.capacity, b));
      series.push({ snapshot_ts: t.toISOString(), num_bikes_available: b, num_docks_available: s.capacity - b });
    }
    history.set(s.station_id, series);

    // Forecasts on the 15-minute grid (every 3rd snapshot).
    for (let k = 3; k + 3 < series.length; k += 3) {
      const cur = series[k]!, prev = series[k - 3]!, next = series[k + 3]!;
      const d15 = cur.num_bikes_available - prev.num_bikes_available;
      const pE = sigmoid(2.2 - 1.1 * cur.num_bikes_available - 0.35 * d15 + 0.6 * normal(rand));
      const pF = sigmoid(2.2 - 1.1 * cur.num_docks_available + 0.35 * d15 + 0.6 * normal(rand));
      outcomes.push({
        station_id: s.station_id, name: s.name, lat: s.lat, lon: s.lon,
        prediction_time_utc: cur.snapshot_ts,
        num_bikes_available: cur.num_bikes_available, num_docks_available: cur.num_docks_available,
        p_empty: pE, pred_empty: pE >= 0.4 ? 1 : 0, threshold_empty: 0.4,
        p_full: pF, pred_full: pF >= 0.472 ? 1 : 0, threshold_full: 0.472,
        empty_label: next.num_bikes_available === 0 ? 1 : 0,
        full_label: next.num_docks_available === 0 ? 1 : 0,
        model_version_empty: "demo",
      });
    }
    const last = series[series.length - 1]!, prev = series[series.length - 4]!;
    const d15 = last.num_bikes_available - prev.num_bikes_available;
    const pE = sigmoid(2.2 - 1.1 * last.num_bikes_available - 0.35 * d15);
    const pF = sigmoid(2.2 - 1.1 * last.num_docks_available + 0.35 * d15);
    latest.push({
      station_id: s.station_id, name: s.name, lat: s.lat, lon: s.lon, capacity: s.capacity,
      prediction_time_utc: last.snapshot_ts,
      num_bikes_available: last.num_bikes_available, num_docks_available: last.num_docks_available,
      p_empty: pE, pred_empty: pE >= 0.4 ? 1 : 0, threshold_empty: 0.4,
      p_full: pF, pred_full: pF >= 0.472 ? 1 : 0, threshold_full: 0.472,
      model_version_empty: "demo", model_version_full: "demo",
      scored_at: new Date(new Date(last.snapshot_ts).getTime() + 3 * 60_000).toISOString(),
    });
  }
  return { latest, outcomes, history, now };
}

function get(): Built {
  // Rebuild when the quarter hour rolls over, so demo timestamps stay fresh.
  const q = Math.floor(Date.now() / 900_000);
  if (!built || Math.floor(built.now.getTime() / 900_000) !== q) built = build();
  return built;
}

export const demo = {
  latest: (): Prediction[] => get().latest,
  outcomes: (): Outcome[] => get().outcomes,
  history: (id: string): Snapshot[] => get().history.get(id) ?? [],
  health: (): { kpis: HealthKpis; log: CheckRow[] } => {
    const b = get();
    const iso = (ms: number) => new Date(b.now.getTime() - ms).toISOString();
    return {
      kpis: { newest_snapshot: iso(2 * 60_000), last_scored: iso(3 * 60_000), runs_ok: 288, runs_failed: 0, now_utc: new Date().toISOString() },
      log: [
        { checked_at: iso(60_000), check: "snapshot_age_min", value: 2.4, ok: true, detail: "demo" },
        { checked_at: iso(60_000), check: "stations_in_latest_snapshot", value: 2519, ok: true, detail: "demo" },
        { checked_at: iso(60_000), check: "collector_fail_rate_24h", value: 0, ok: true, detail: "demo" },
        { checked_at: iso(60_000), check: "prediction_age_min", value: 3.1, ok: true, detail: "demo" },
      ],
    };
  },
};
