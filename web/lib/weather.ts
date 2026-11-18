import type { CurrentWeather, Target, WeatherExperimentRow } from "./types";

export type Verdict = "better" | "worse" | "no_change";

export interface WeatherSummary {
  target: Target;
  without: WeatherExperimentRow;
  with: WeatherExperimentRow;
  ranking: Verdict;     // PR-AUC: higher is better
  error: Verdict;       // Brier: lower is better
  errorRelChange: number; // Δ Brier / Brier without weather (negative = less error)
}

/** A change counts only when its whole 95% interval is on one side of zero. */
export function verdict(lo: number, hi: number, higherIsBetter: boolean): Verdict {
  if (lo > 0) return higherIsBetter ? "better" : "worse";
  if (hi < 0) return higherIsBetter ? "worse" : "better";
  return "no_change";
}

export function summarizeWeather(rows: WeatherExperimentRow[]): WeatherSummary[] {
  return (["empty", "full"] as const).flatMap((target) => {
    const without = rows.find((r) => r.target === target && r.variant === "hgb_no_weather");
    const withW = rows.find((r) => r.target === target && r.variant === "hgb_weather");
    if (!without || !withW) return [];
    return [{
      target,
      without,
      with: withW,
      ranking: verdict(without.d_pr_auc_lo, without.d_pr_auc_hi, true),
      error: verdict(without.d_brier_lo, without.d_brier_hi, false),
      errorRelChange: without.test_brier > 0 ? without.d_brier_mean / without.test_brier : 0,
    }];
  });
}

export function describeWeather(w: CurrentWeather): string {
  const rain = w.precipitation_mm >= 0.1 ? `rain ${w.precipitation_mm.toFixed(1)} mm/h` : "no rain";
  return `${Math.round(w.temperature_c)}°C · ${rain} · wind ${Math.round(w.wind_kmh)} km/h`;
}
