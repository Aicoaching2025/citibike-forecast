"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HourlyRow } from "@/lib/metrics";
import type { CheckRow, HealthKpis, Target } from "@/lib/types";
import { fmtDayTime, fmtFull, minutesAgo } from "@/lib/format";
import { Card, Pill, Segmented, Stat } from "./ui";

const AXIS = { fontSize: 11.5, fill: "rgb(var(--muted))" };

export function StatusClient({ kpis, log, hourly }: { kpis: HealthKpis; log: CheckRow[]; hourly: Record<Target, HourlyRow[]> }) {
  const [target, setTarget] = useState<Target>("empty");
  const now = Date.parse(kpis.now_utc);
  const snapAge = minutesAgo(kpis.newest_snapshot, now);
  const predAge = minutesAgo(kpis.last_scored, now);
  const failing = log.filter((r) => !r.ok);
  const healthy = (snapAge ?? 99) <= 25 && (predAge ?? 99) <= 30 && kpis.runs_failed === 0;
  const data = hourly[target].map((h) => ({ t: Date.parse(h.hour), Model: h.model, "Persistence (no change)": h.persistence }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">System status</h1>
          <p className="mt-1 text-[14px] text-muted">Live data is collected every 5 minutes; forecasts are made every 15 minutes.</p>
        </div>
        <Pill tone={healthy ? "good" : "warn"}>{healthy ? "All systems normal" : "Attention needed"}</Pill>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Newest live snapshot" value={snapAge === null ? "—" : `${snapAge.toFixed(1)} min`} sub="ago · alert above 25" tone={(snapAge ?? 99) <= 25 ? "good" : "bad"} />
        <Stat label="Latest forecast" value={predAge === null ? "—" : `${predAge.toFixed(1)} min`} sub="ago · alert above 30" tone={(predAge ?? 99) <= 30 ? "good" : "bad"} />
        <Stat label="Collector runs OK (24 h)" value={kpis.runs_ok.toLocaleString()} sub="expected about 288" />
        <Stat label="Collector runs failed (24 h)" value={kpis.runs_failed} tone={kpis.runs_failed === 0 ? "good" : "bad"} />
      </div>

      <Card
        title="Live accuracy by hour"
        subtitle="Brier score of each hour's forecasts once their outcomes are known. Lower is better."
        action={<Segmented<Target> label="Target" value={target} onChange={setTarget} options={[{ value: "empty", label: "Empty" }, { value: "full", label: "Full" }]} />}
      >
        {data.length === 0 ? (
          <p className="text-[14px] text-muted">No outcomes yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtDayTime(v)} tick={AXIS} minTickGap={70} />
              <YAxis tick={AXIS} width={52} tickFormatter={(v: number) => v.toFixed(3)} />
              <Tooltip labelFormatter={(v) => fmtFull(Number(v))} formatter={(v: number) => v.toFixed(4)} />
              <Legend wrapperStyle={{ fontSize: 12.5 }} />
              <Line type="monotone" dataKey="Model" stroke="#2a78d6" strokeWidth={2.25} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Persistence (no change)" stroke="rgb(var(--muted))" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Automated checks" subtitle={failing.length ? `${failing.length} check(s) failing in the last 24 hours.` : "Every check in the last 24 hours passed."}>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[560px] text-[13.5px]">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line text-left text-[12.5px] text-muted">
                <th className="py-2 pr-3 font-medium">Checked</th>
                <th className="py-2 pr-3 font-medium">Check</th>
                <th className="py-2 pr-3 font-medium">Value</th>
                <th className="py-2 pr-3 font-medium">Result</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r, i) => (
                <tr key={`${r.checked_at}-${r.check}-${i}`} className="border-b border-line/70 last:border-0">
                  <td className="py-2 pr-3 text-muted">{fmtDayTime(r.checked_at)}</td>
                  <td className="py-2 pr-3 font-medium">{r.check.replaceAll("_", " ")}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.value === null ? "—" : Number(r.value).toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                  <td className="py-2 pr-3">{r.ok ? <Pill tone="good">Pass</Pill> : <Pill tone="bad">Fail</Pill>}</td>
                  <td className="py-2 text-muted">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
