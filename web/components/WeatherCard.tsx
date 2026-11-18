import type { WeatherExperimentRow } from "@/lib/types";
import { summarizeWeather, type Verdict } from "@/lib/weather";
import { pct } from "@/lib/format";
import { Card, Pill } from "./ui";

const LABEL: Record<Verdict, { text: string; tone: "good" | "warn" | undefined }> = {
  better: { text: "Reliably better", tone: "good" },
  worse: { text: "Reliably worse", tone: "warn" },
  no_change: { text: "No measurable change", tone: undefined },
};

/** Results of notebook 09: the champion model trained with and without weather on identical rows. */
export function WeatherCard({ rows }: { rows: WeatherExperimentRow[] }) {
  const summary = summarizeWeather(rows);
  if (!summary.length) return null;
  return (
    <Card
      title="Does weather help?"
      subtitle="The same model trained twice on identical data, with and without hourly weather (temperature, wind, rain), scored on the test week Oct 19–26."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[12.5px] text-muted">
              <th className="py-2 pr-3 font-medium">Predicting</th>
              <th className="py-2 pr-3 font-medium">Ranking (PR-AUC)</th>
              <th className="py-2 pr-3 font-medium">Probability error (Brier)</th>
              <th className="py-2 pr-3 font-medium">Gain over persistence</th>
              <th className="py-2 font-medium">New events warned</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.target} className="border-b border-line/70 align-top last:border-0">
                <td className="py-3 pr-3 font-medium">{s.target === "empty" ? "Empty (no bikes)" : "Full (no docks)"}</td>
                <td className="py-3 pr-3">
                  <div className="tabular-nums">{s.without.test_pr_auc.toFixed(3)} → {s.with.test_pr_auc.toFixed(3)}</div>
                  <div className="mt-1"><Pill tone={LABEL[s.ranking].tone}>{LABEL[s.ranking].text}</Pill></div>
                </td>
                <td className="py-3 pr-3">
                  <div className="tabular-nums">
                    {s.without.test_brier.toFixed(4)} → {s.with.test_brier.toFixed(4)}
                    <span className="text-muted"> ({s.errorRelChange > 0 ? "+" : ""}{(s.errorRelChange * 100).toFixed(1)}%)</span>
                  </div>
                  <div className="mt-1"><Pill tone={LABEL[s.error].tone}>{LABEL[s.error].text}</Pill></div>
                </td>
                <td className="py-3 pr-3 tabular-nums">{pct(s.without.test_brier_skill_vs_persistence)} → {pct(s.with.test_brier_skill_vs_persistence)}</td>
                <td className="py-3 tabular-nums">{s.without.test_onset_caught} → {s.with.test_onset_caught} <span className="text-muted">of {s.without.test_onset_events.toLocaleString()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">
        “Reliably” means the 95% interval from 300 paired resamples of station-days excludes zero. Weather uses the last completed hour before each forecast, so no future weather is used.
        Live forecasts above use the model <span className="font-medium text-ink">without</span> weather: the gain is small and live use would need a weather-forecast feed.
      </p>
    </Card>
  );
}
