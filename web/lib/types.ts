export type Target = "empty" | "full";
export type Mode = "bike" | "dock";
export type Source = "live" | "demo";

/** One station's newest forecast, joined with its location. */
export interface Prediction {
  station_id: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
  capacity: number | null;
  prediction_time_utc: string; // ISO, UTC
  num_bikes_available: number;
  num_docks_available: number;
  p_empty: number;
  pred_empty: number;
  threshold_empty: number;
  p_full: number;
  pred_full: number;
  threshold_full: number;
  model_version_empty: string;
  model_version_full: string;
  scored_at: string; // ISO, UTC
}

/** A past forecast joined to what the station reported 15 minutes later. */
export interface Outcome {
  station_id: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
  prediction_time_utc: string;
  num_bikes_available: number;
  num_docks_available: number;
  p_empty: number;
  pred_empty: number;
  threshold_empty: number;
  p_full: number;
  pred_full: number;
  threshold_full: number;
  empty_label: number;
  full_label: number;
  model_version_empty: string;
}

export interface Snapshot {
  snapshot_ts: string;
  num_bikes_available: number;
  num_docks_available: number;
}

export interface HealthKpis {
  newest_snapshot: string | null;
  last_scored: string | null;
  runs_ok: number;
  runs_failed: number;
  now_utc: string;
}

export interface CheckRow {
  checked_at: string;
  check: string;
  value: number | null;
  ok: boolean;
  detail: string | null;
}

export interface WithSource<T> {
  source: Source;
  data: T;
}

/** Any Citi Bike station, forecast or not (for search). */
export interface StationRef {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
}

/** One row of analysis_weather (notebook 09): a target x variant with paired-bootstrap deltas. */
export interface WeatherExperimentRow {
  target: Target;
  variant: "hgb_no_weather" | "hgb_weather";
  test_pr_auc: number;
  test_brier: number;
  test_brier_skill_vs_persistence: number;
  test_onset_caught: number;
  test_onset_events: number;
  d_pr_auc_mean: number;
  d_pr_auc_lo: number;
  d_pr_auc_hi: number;
  d_brier_mean: number;
  d_brier_lo: number;
  d_brier_hi: number;
}

/** Latest hourly forecast for the current hour, averaged over forecast areas (Maxfield's collector). */
export interface CurrentWeather {
  valid_at: string;
  retrieved_at: string;
  temperature_c: number;
  precipitation_mm: number;
  wind_kmh: number;
  locations: number;
}
