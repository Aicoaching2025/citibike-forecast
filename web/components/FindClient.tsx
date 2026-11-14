"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import clsx from "clsx";
import type { Mode, Prediction } from "@/lib/types";
import { HORIZON_MIN, WALK_M_PER_MIN, rankStations, scoreStations } from "@/lib/metrics";
import { ago, fmtFull, fmtTime, pct, plus15 } from "@/lib/format";
import { Card, Pill, Segmented } from "./ui";
import type { MapPoint } from "./StationMap";

const StationMap = dynamic(() => import("./StationMap"), { ssr: false, loading: () => <div className="h-[460px] animate-pulse rounded-xl bg-line/50" /> });

const chanceColor = (c: number) => (c >= 0.8 ? "#0c8c0c" : c >= 0.5 ? "#d68c00" : "#cd3737");
const chanceTone = (c: number): "good" | "warn" | "bad" => (c >= 0.8 ? "good" : c >= 0.5 ? "warn" : "bad");

export function FindClient({ predictions }: { predictions: Prediction[] }) {
  const located = useMemo(() => predictions.filter((p) => p.lat !== null && p.lon !== null), [predictions]);
  const centroid = useMemo(() => {
    const n = located.length || 1;
    return { lat: located.reduce((s, p) => s + (p.lat as number), 0) / n, lon: located.reduce((s, p) => s + (p.lon as number), 0) / n };
  }, [located]);

  const [mode, setMode] = useState<Mode>("bike");
  const [start, setStart] = useState<{ lat: number; lon: number; label: string }>({ ...centroid, label: "Map centre" });
  const [radius, setRadius] = useState(800);
  const [query, setQuery] = useState("");
  const [geoError, setGeoError] = useState<string | null>(null);

  const ranked = useMemo(() => rankStations(located, start.lat, start.lon, mode, radius), [located, start, mode, radius]);
  const all = useMemo(() => scoreStations(located, start.lat, start.lon, mode, radius), [located, start, mode, radius]);
  const best = ranked[0];
  const need = mode === "bike" ? "bike" : "open dock";
  const unit = mode === "bike" ? "bikes" : "docks";

  const points: MapPoint[] = useMemo(
    () =>
      all.map((s) => ({
        id: s.station_id,
        lat: s.lat as number,
        lon: s.lon as number,
        color: chanceColor(s.chance),
        radius: s.within ? 8 : 5,
        emphasis: best?.station_id === s.station_id,
        title: s.name ?? s.station_id,
        lines: [`${pct(s.chance)} chance of a ${need} in 15 min`, `${s.now} ${unit} now · ${Math.round(s.walkMin)} min walk`],
      })),
    [all, best, need, unit],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length < 2 ? [] : located.filter((p) => (p.name ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [query, located]);

  const predTime = predictions[0]?.prediction_time_utc;
  const scoredAt = predictions[0]?.scored_at;

  function locateMe() {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError("Location is not available in this browser.");
    navigator.geolocation.getCurrentPosition(
      (pos) => setStart({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Your location" }),
      () => setGeoError("Location permission was denied."),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Will there be a {need} when I get there?</h1>
          <p className="mt-1 text-[14px] text-muted">
            Forecast for {predTime ? fmtFull(plus15(predTime)) : "—"} · updated {ago(scoredAt)} · {located.length} stations covered
          </p>
        </div>
        <Segmented<Mode>
          label="I need"
          value={mode}
          onChange={setMode}
          options={[
            { value: "bike", label: "I need a bike" },
            { value: "dock", label: "I need a dock" },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card title="Where are you starting?" subtitle="Search a station, use your location, or click the map.">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stations"
                aria-label="Search stations"
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
              />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-panel py-1 shadow-card">
                  {matches.map((m) => (
                    <li key={m.station_id}>
                      <button
                        className="w-full px-3.5 py-2 text-left text-[13.5px] hover:bg-line/50"
                        onClick={() => {
                          setStart({ lat: m.lat as number, lon: m.lon as number, label: m.name ?? m.station_id });
                          setQuery("");
                        }}
                      >
                        {m.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-[13px]">
              <span className="truncate text-muted">Starting near <span className="font-medium text-ink">{start.label}</span></span>
              <button onClick={locateMe} className="shrink-0 rounded-lg border border-line px-2.5 py-1 font-medium hover:bg-line/50">
                Use my location
              </button>
            </div>
            {geoError && <p className="mt-2 text-[12.5px] text-bad">{geoError}</p>}
            <label className="mt-5 block text-[13px] font-medium" htmlFor="radius">
              Walking distance: {radius} m <span className="font-normal text-muted">(~{Math.round(radius / WALK_M_PER_MIN)} min)</span>
            </label>
            <input id="radius" type="range" min={200} max={2000} step={100} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="mt-2 w-full" />
          </Card>

          {best ? (
            <div className="rounded-2xl border border-good/30 bg-good/10 p-5">
              <div className="text-[12.5px] font-medium uppercase tracking-wide text-good">Best bet</div>
              <div className="mt-1 text-lg font-semibold">{best.name}</div>
              <div className="mt-1 text-[14px] text-muted">
                <span className="font-semibold text-ink">{pct(best.chance)}</span> chance of a {need} in 15 min · {best.now} {unit} now · {Math.round(best.walkMin)} min walk
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-panel p-5 text-[14px] text-muted">No covered stations within that distance. Try walking a little farther.</div>
          )}
        </div>

        <Card className="overflow-hidden" title="Nearby stations" subtitle={`Colour shows the chance of a ${need} 15 minutes from now.`}>
          <StationMap
            ariaLabel="Map of stations coloured by forecast availability"
            points={points}
            center={{ lat: start.lat, lon: start.lon }}
            radiusM={radius}
            zoom={13.5}
            onMapClick={(lat, lon) => setStart({ lat, lon, label: "Point on map" })}
            onPointClick={(id) => {
              const s = located.find((p) => p.station_id === id);
              if (s) setStart({ lat: s.lat as number, lon: s.lon as number, label: s.name ?? id });
            }}
          />
          <div className="mt-3 flex flex-wrap gap-4 text-[12.5px] text-muted">
            <Legend color="#0c8c0c" label="80% or higher" />
            <Legend color="#d68c00" label="50–80%" />
            <Legend color="#cd3737" label="Below 50%" />
            <span>Larger dots are within walking distance.</span>
          </div>
        </Card>
      </div>

      {ranked.length > 0 && (
        <Card title={`Stations within ${radius} m`} subtitle={`Ranked by the chance of a ${need} in ${HORIZON_MIN} minutes.`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-[12.5px] text-muted">
                  <th className="py-2 pr-3 font-medium">Station</th>
                  <th className="py-2 pr-3 font-medium">Walk</th>
                  <th className="hidden py-2 pr-3 font-medium sm:table-cell">{mode === "bike" ? "Bikes now" : "Docks now"}</th>
                  <th className="py-2 pr-3 font-medium">Chance</th>
                  <th className="hidden py-2 font-medium md:table-cell" />
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, 12).map((s) => (
                  <tr key={s.station_id} className="border-b border-line/70 last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{s.name}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted">{Math.round(s.walkMin)} min</td>
                    <td className="hidden py-2.5 pr-3 tabular-nums sm:table-cell">{s.now}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-line sm:block">
                          <div className={clsx("h-full rounded-full", s.chance >= 0.8 ? "bg-good" : s.chance >= 0.5 ? "bg-warn" : "bg-bad")} style={{ width: `${Math.round(s.chance * 100)}%` }} />
                        </div>
                        <span className="tabular-nums">{pct(s.chance)}</span>
                      </div>
                    </td>
                    <td className="hidden py-2.5 text-right md:table-cell">
                      {s.flagged && <Pill tone={chanceTone(s.chance)}>Likely {mode === "bike" ? "empty" : "full"}</Pill>}
                      {s.beyondHorizon && <Pill>Over 15 min away</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            Forecasts are for {predTime ? fmtTime(plus15(predTime)) : "15 minutes after the latest update"}, not your arrival time. Stations more than a 15-minute walk away are marked.
          </p>
        </Card>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
