import "server-only";
import { unstable_cache } from "next/cache";
import { query } from "./databricks";
import { demo } from "./demo";
import { env } from "./env";
import type { CheckRow, HealthKpis, Outcome, Prediction, Snapshot, Source, WithSource } from "./types";

/**
 * Data access. Every function returns { source, data } so the UI can label demo data.
 * Live reads are cached (60-120 s) because the pipeline only writes every 5-15 minutes,
 * which also keeps the SQL warehouse from being woken on every page view.
 */

const S = () => env().CITIBIKE_SCHEMA; // validated catalog.schema identifier
const source = (): Source => (env().demo ? "demo" : "live");

const liveLatest = unstable_cache(
  async () =>
    query<Prediction>(`
      WITH latest AS (SELECT MAX(prediction_time_utc) AS t FROM ${S()}.predictions)
      SELECT p.station_id, i.name, i.lat, i.lon, i.capacity, p.prediction_time_utc,
             p.num_bikes_available, p.num_docks_available,
             p.p_empty, p.pred_empty, p.threshold_empty, p.p_full, p.pred_full, p.threshold_full,
             p.model_version_empty, p.model_version_full, p.scored_at
      FROM ${S()}.predictions p
      JOIN latest ON p.prediction_time_utc = latest.t
      LEFT JOIN ${S()}.live_station_info i USING (station_id)`),
  ["latest-predictions"],
  { revalidate: 60, tags: ["predictions"] },
);

const liveOutcomes = unstable_cache(
  async () =>
    query<Outcome>(`
      SELECT o.station_id, i.name, i.lat, i.lon, o.prediction_time_utc,
             o.num_bikes_available, o.num_docks_available,
             o.p_empty, o.pred_empty, o.threshold_empty, o.p_full, o.pred_full, o.threshold_full,
             o.empty_label, o.full_label, o.model_version_empty
      FROM ${S()}.live_outcomes o
      LEFT JOIN ${S()}.live_station_info i USING (station_id)
      WHERE o.prediction_time_utc >= current_timestamp() - INTERVAL 72 HOURS`),
  ["outcomes-72h"],
  { revalidate: 120, tags: ["outcomes"] },
);

const liveHistory = unstable_cache(
  async (stationId: string) =>
    query<Snapshot>(
      `SELECT snapshot_ts, num_bikes_available, num_docks_available
       FROM ${S()}.live_station_status
       WHERE station_id = :sid AND snapshot_ts >= current_timestamp() - INTERVAL 72 HOURS
       ORDER BY snapshot_ts`,
      [{ name: "sid", value: stationId, type: "STRING" }],
    ),
  ["station-history"],
  { revalidate: 120, tags: ["history"] },
);

const liveHealth = unstable_cache(
  async () => {
    const [kpis] = await query<HealthKpis>(`
      SELECT
        (SELECT MAX(snapshot_ts) FROM ${S()}.live_station_status) AS newest_snapshot,
        (SELECT MAX(scored_at) FROM ${S()}.predictions) AS last_scored,
        (SELECT COUNT(*) FROM ${S()}.collector_runs
           WHERE fetched_at >= current_timestamp() - INTERVAL 24 HOURS AND status = 'OK') AS runs_ok,
        (SELECT COUNT(*) FROM ${S()}.collector_runs
           WHERE fetched_at >= current_timestamp() - INTERVAL 24 HOURS AND status <> 'OK') AS runs_failed,
        current_timestamp() AS now_utc`);
    const log = await query<CheckRow>(`
      SELECT checked_at, check, value, ok, detail
      FROM ${S()}.monitoring_log
      WHERE checked_at >= current_timestamp() - INTERVAL 24 HOURS
      ORDER BY checked_at DESC, check
      LIMIT 200`);
    return { kpis: kpis!, log };
  },
  ["health"],
  { revalidate: 60, tags: ["health"] },
);

export async function getLatest(): Promise<WithSource<Prediction[]>> {
  return { source: source(), data: env().demo ? demo.latest() : await liveLatest() };
}
export async function getOutcomes(): Promise<WithSource<Outcome[]>> {
  return { source: source(), data: env().demo ? demo.outcomes() : await liveOutcomes() };
}
export async function getHistory(stationId: string): Promise<WithSource<Snapshot[]>> {
  return { source: source(), data: env().demo ? demo.history(stationId) : await liveHistory(stationId) };
}
export async function getHealth(): Promise<WithSource<{ kpis: HealthKpis; log: CheckRow[] }>> {
  return { source: source(), data: env().demo ? demo.health() : await liveHealth() };
}
