import { describe, expect, it } from "vitest";
import { describeWeather, summarizeWeather, verdict } from "@/lib/weather";
import type { WeatherExperimentRow } from "@/lib/types";

const base = { test_pr_auc: 0.88, test_brier: 0.0114, test_brier_skill_vs_persistence: 0.13, test_onset_caught: 82, test_onset_events: 493 };
const d = { d_pr_auc_mean: 0.001, d_pr_auc_lo: -0.0014, d_pr_auc_hi: 0.0035, d_brier_mean: -0.00026, d_brier_lo: -0.00046, d_brier_hi: -0.00009 };
const rows: WeatherExperimentRow[] = [
  { target: "empty", variant: "hgb_no_weather", ...base, ...d },
  { target: "empty", variant: "hgb_weather", ...base, test_brier: 0.0112, ...d },
];

describe("weather verdicts", () => {
  it("requires the whole interval on one side of zero", () => {
    expect(verdict(-0.001, 0.003, true)).toBe("no_change");
    expect(verdict(0.001, 0.003, true)).toBe("better");
    expect(verdict(-0.0005, -0.0001, false)).toBe("better"); // lower Brier
    expect(verdict(0.0001, 0.0005, false)).toBe("worse");
  });
  it("summarizes the Nov 18 result: ranking unchanged, empty error reliably lower", () => {
    const [s] = summarizeWeather(rows);
    expect(s!.ranking).toBe("no_change");
    expect(s!.error).toBe("better");
    expect(s!.errorRelChange).toBeCloseTo(-0.0228, 3);
  });
  it("skips a target with a missing variant", () => {
    expect(summarizeWeather(rows.slice(0, 1))).toEqual([]);
  });
  it("describes current weather", () => {
    expect(describeWeather({ valid_at: "", retrieved_at: "", temperature_c: 9.4, precipitation_mm: 0.3, wind_kmh: 17.2, locations: 3 }))
      .toBe("9°C · rain 0.3 mm/h · wind 17 km/h");
  });
});
