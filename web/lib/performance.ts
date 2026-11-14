import "server-only";
import { calibrationBins, category, cols, hourlyBrier, scoreboard } from "./metrics";
import type { Outcome, Snapshot, Target } from "./types";

/** Server-side aggregation so the browser receives small payloads, not 30,000 rows. */

export function summarize(rows: Outcome[], target: Target) {
  const c = cols(target);
  const times = [...new Set(rows.map((r) => r.prediction_time_utc))].sort();
  const first = times[0], last = times.at(-1);
  const hours = first && last ? (Date.parse(last) - Date.parse(first)) / 3_600_000 : 0;
  return {
    target,
    windowHours: Math.round(hours),
    rows: rows.length,
    scoreboard: scoreboard(rows, target),
    hourly: hourlyBrier(rows, target),
    calibration: calibrationBins(rows.map((r) => r[c.p]), rows.map((r) => r[c.label])),
    times,
    stations: stationIndex(rows, target),
  };
}

function stationIndex(rows: Outcome[], target: Target) {
  const c = cols(target);
  const m = new Map<string, { station_id: string; name: string; events: number }>();
  for (const r of rows) {
    const e = m.get(r.station_id) ?? { station_id: r.station_id, name: r.name ?? r.station_id, events: 0 };
    e.events += r[c.label];
    m.set(r.station_id, e);
  }
  return [...m.values()].sort((a, b) => b.events - a.events || a.name.localeCompare(b.name));
}

export function replay(rows: Outcome[], target: Target, time: string) {
  const c = cols(target);
  const at = rows.filter((r) => r.prediction_time_utc === time && r.lat !== null && r.lon !== null);
  const stations = at.map((r) => ({
    station_id: r.station_id,
    name: r.name ?? r.station_id,
    lat: r.lat as number,
    lon: r.lon as number,
    p: r[c.p],
    category: category(r[c.pred], r[c.label]),
  }));
  const counts = { caught: 0, missed: 0, false_alarm: 0, quiet: 0 };
  for (const s of stations) counts[s.category]++;
  return { target, time, stations, counts };
}

export function stationDetail(rows: Outcome[], history: Snapshot[], stationId: string, target: Target) {
  const c = cols(target);
  const own = rows.filter((r) => r.station_id === stationId).sort((a, b) => (a.prediction_time_utc < b.prediction_time_utc ? -1 : 1));
  const forecasts = own.map((r) => ({
    target_time: new Date(Date.parse(r.prediction_time_utc) + 15 * 60_000).toISOString(),
    p: r[c.p],
    flagged: r[c.pred] === 1,
    happened: r[c.label] === 1,
  }));
  const threshold = own.at(-1)?.[target === "empty" ? "threshold_empty" : "threshold_full"] ?? 0.5;
  const counts = history.map((h) => ({ t: h.snapshot_ts, count: target === "empty" ? h.num_bikes_available : h.num_docks_available }));
  return {
    station_id: stationId,
    name: own[0]?.name ?? stationId,
    target,
    threshold,
    forecasts,
    counts,
    scoreboard: scoreboard(own, target),
  };
}
