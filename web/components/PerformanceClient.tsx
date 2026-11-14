"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { replay, stationDetail, summarize } from "@/lib/performance";
import type { Target } from "@/lib/types";
import { fmtDayTime, fmtFull, fmtTime, pct, plus15 } from "@/lib/format";
import { Card, Segmented, Stat } from "./ui";
import { useJson } from "./useJson";
import type { MapPoint } from "./StationMap";

const StationMap = dynamic(() => import("./StationMap"), { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-xl bg-line/50" /> });

type Summary = ReturnType<typeof summarize>;
type Replay = ReturnType<typeof replay>;
type Detail = ReturnType<typeof stationDetail>;

const CAT = {
  caught: { color: "#0c8c0c", label: "Caught: warned, and it happened" },
  missed: { color: "#cd3737", label: "Missed: no warning, but it happened" },
  false_alarm: { color: "#d68c00", label: "False alarm: warned, didn't happen" },
  quiet: { color: "#bdbcb8", label: "Correct quiet" },
} as const;

const AXIS = { fontSize: 11.5, fill: "rgb(var(--muted))" };

export function PerformanceClient({ initial }: { initial: Record<Target, Summary> }) {
  const [target, setTarget] = useState<Target>("empty");
  const s = initial[target];
  const [model, pers] = s.scoreboard;
  const word = target === "empty" ? "empty" : "full";

  const [timeIdx, setTimeIdx] = useState(s.times.length - 1);
  const idx = Math.min(timeIdx, s.times.length - 1);
  const time = s.times[idx]!;
  const rep = useJson<Replay>(`/api/performance/replay?target=${target}&t=${encodeURIComponent(time)}`);

  const [stationId, setStationId] = useState(s.stations[0]?.station_id ?? "");
  const det = useJson<Detail>(stationId ? `/api/stations/${encodeURIComponent(stationId)}?target=${target}` : null);

  const points: MapPoint[] = useMemo(
    () =>
      (rep.data?.stations ?? []).map((st) => ({
        id: st.station_id,
        lat: st.lat,
        lon: st.lon,
        color: CAT[st.category].color,
        radius: st.category === "quiet" ? 4.5 : 8,
        emphasis: st.category !== "quiet",
        title: st.name,
        lines: [`Predicted ${pct(st.p)} chance of ${word}`, CAT[st.category].label],
      })),
    [rep.data, word],
  );
  const center = useMemo(() => {
    const st = rep.data?.stations ?? [];
    if (!st.length) return { lat: 40.75, lon: -73.98 };
    return { lat: st.reduce((a, b) => a + b.lat, 0) / st.length, lon: st.reduce((a, b) => a + b.lon, 0) / st.length };
  }, [rep.data]);

  const brierGain = model && pers && pers.brier > 0 ? 1 - model.brier / pers.brier : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Does the model beat “nothing changes”?</h1>
          <p className="mt-1 text-[14px] text-muted">
            Every forecast from the last {s.windowHours} hours, checked against what each station reported 15 minutes later ({s.rows.toLocaleString()} forecasts).
          </p>
        </div>
        <Segmented<Target>
          label="Predicting"
          value={target}
          onChange={(t) => {
            setTarget(t);
            setStationId(initial[t].stations[0]?.station_id ?? "");
          }}
          options={[
            { value: "empty", label: "Empty (no bikes)" },
            { value: "full", label: "Full (no docks)" },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`New ${word} stations warned in advance`} value={`${model?.newEventsCaught ?? 0} of ${model?.newEvents ?? 0}`} sub={`Persistence: ${pers?.newEventsCaught ?? 0} — it never predicts a change`} tone="good" />
        <Stat label="Warnings that were right" value={pct(model?.precision)} sub={`Persistence: ${pct(pers?.precision)} (flags only stations already ${word})`} />
        <Stat label={`Actual ${word} events warned about`} value={pct(model?.recall)} sub={`Persistence: ${pct(pers?.recall)}`} />
        <Stat label="Probability error (Brier)" value={model ? model.brier.toFixed(4) : "—"} sub={brierGain !== null ? `${pct(brierGain)} less error than persistence` : undefined} tone={brierGain !== null && brierGain > 0 ? "good" : undefined} />
      </div>

      <Card title="Replay any past forecast" subtitle="Drag the slider. Each station is checked against what it actually reported 15 minutes later.">
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div>
            <StationMap ariaLabel="Map of past forecast outcomes" points={points} center={center} zoom={12.3} height={420} />
            <input
              type="range"
              min={0}
              max={s.times.length - 1}
              value={idx}
              onChange={(e) => setTimeIdx(Number(e.target.value))}
              aria-label="Forecast time"
              className="mt-4 w-full"
            />
            <div className="mt-1 flex justify-between text-[12px] text-muted">
              <span>{fmtDayTime(s.times[0]!)}</span>
              <span>{fmtDayTime(s.times.at(-1)!)}</span>
            </div>
          </div>
          <div>
            <div className="text-[13px] text-muted">Forecast made</div>
            <div className="text-lg font-semibold">{fmtFull(time)}</div>
            <div className="text-[13px] text-muted">for {fmtTime(plus15(time))}</div>
            <ul className="mt-4 space-y-2.5">
              {(Object.keys(CAT) as (keyof typeof CAT)[]).map((k) => (
                <li key={k} className="flex items-center justify-between gap-3 text-[13.5px]">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: CAT[k].color }} />
                    {CAT[k].label}
                  </span>
                  <span className="font-semibold tabular-nums">{rep.data?.counts[k] ?? "…"}</span>
                </li>
              ))}
            </ul>
            {rep.error && <p className="mt-3 text-[12.5px] text-bad">{rep.error}</p>}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card
          title="Follow one station"
          subtitle="Top: the model's chance, plotted at the time it predicts. Bottom: what the station actually had."
          action={
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              aria-label="Station"
              className="max-w-[260px] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]"
            >
              {s.stations.map((st) => (
                <option key={st.station_id} value={st.station_id}>
                  {st.name} · {st.events} {word} events
                </option>
              ))}
            </select>
          }
        >
          {det.loading && <div className="h-[380px] animate-pulse rounded-xl bg-line/50" />}
          {det.error && <p className="text-[13px] text-bad">{det.error}</p>}
          {det.data && !det.loading && <StationCharts d={det.data} word={word} />}
        </Card>

        <Card title="Are the probabilities honest?" subtitle="When the model says 30%, it should happen about 30% of the time.">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 0 }}>
              <CartesianGrid stroke="rgb(var(--line))" />
              <XAxis type="number" dataKey="meanPred" domain={[0, 1]} tickFormatter={(v) => pct(v)} tick={AXIS} label={{ value: "Predicted chance", position: "insideBottom", offset: -14, ...AXIS }} />
              <YAxis type="number" dataKey="obsRate" domain={[0, 1]} tickFormatter={(v) => pct(v)} tick={AXIS} width={44} />
              <ZAxis type="number" dataKey="n" range={[40, 260]} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="rgb(var(--muted))" strokeDasharray="4 4" />
              <Tooltip formatter={(v: number, k: string) => (k === "n" ? v.toLocaleString() : pct(v))} labelFormatter={() => ""} />
              <Scatter data={s.calibration} fill="#2a78d6" />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-[12.5px] text-muted">Dots on the dashed line are perfectly calibrated. Larger dots hold more forecasts.</p>
        </Card>
      </div>
    </div>
  );
}

function StationCharts({ d, word }: { d: Detail; word: string }) {
  const probs = d.forecasts.map((f) => ({ t: Date.parse(f.target_time), p: f.p }));
  const counts = d.counts.map((c) => ({ t: Date.parse(c.t), count: c.count }));
  const domain: [number, number] = [
    Math.min(probs[0]?.t ?? Infinity, counts[0]?.t ?? Infinity),
    Math.max(probs.at(-1)?.t ?? 0, counts.at(-1)?.t ?? 0),
  ];
  const [m] = d.scoreboard;
  const tick = (v: number) => fmtDayTime(v);
  return (
    <div>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={probs} syncId="station" margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="t" type="number" domain={domain} hide />
          <YAxis domain={[0, 1]} tickFormatter={(v) => pct(v)} tick={AXIS} width={44} />
          <ReferenceLine y={d.threshold} stroke="rgb(var(--muted))" strokeDasharray="4 4" label={{ value: `warning threshold ${d.threshold.toFixed(2)}`, position: "insideTopLeft", ...AXIS }} />
          <Tooltip labelFormatter={(v) => fmtFull(Number(v))} formatter={(v: number) => [pct(v), `Chance of ${word}`]} />
          <Line type="monotone" dataKey="p" stroke="#2a78d6" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={counts} syncId="station" margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="t" type="number" domain={domain} tickFormatter={tick} tick={AXIS} minTickGap={60} />
          <YAxis allowDecimals={false} tick={AXIS} width={44} />
          <ReferenceLine y={0} stroke="#cd3737" />
          <Tooltip labelFormatter={(v) => fmtFull(Number(v))} formatter={(v: number) => [v, word === "empty" ? "Bikes available" : "Docks available"]} />
          <Line type="stepAfter" dataKey="count" stroke="rgb(var(--muted))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[13px] text-muted">
        At this station the model warned of <span className="font-semibold text-ink">{m?.newEventsCaught ?? 0} of {m?.newEvents ?? 0}</span> new {word} events in advance; persistence warned of 0.
      </p>
    </div>
  );
}
