# DockCast

Station-level Citi Bike availability forecasts: the chance each station is **empty** (no bikes) or **full** (no docks) 15 minutes from now, with live model-vs-persistence performance and pipeline health.

Next.js 15 (App Router, TypeScript strict) on Vercel. Reads directly from Databricks Unity Catalog through the SQL Statement Execution API. No Python on the web tier.

| Page | What it does |
|---|---|
| `/` Find a bike or dock | Map + ranked list of nearby stations by forecast chance; search, geolocation, click-to-set start, walk radius |
| `/performance` | Last 72 h of scored forecasts vs. outcomes: onsets caught, precision/recall, Brier vs. persistence, replay slider, per-station drill-down, calibration |
| `/status` | Snapshot/forecast freshness, collector success, hourly live Brier, automated check log |

## Architecture

```
GBFS feed ─► citibike_collect (5 min) ─► live_station_status
                                           │
             citibank_live (15 min) ──► predictions ─► live_outcomes, monitoring_log
                                           │
        Vercel (Next.js, Node runtime) ──SQL Statement API──► SQL warehouse
              │  unstable_cache 60–120 s + CDN s-maxage
              ▼
           Browser (MapLibre GL, Recharts)
```

- All Databricks access is server-side (`lib/databricks.ts`, marked `server-only`). The token never reaches the browser.
- Every query is parameterized (named `:params`); station ids are validated against `^[A-Za-z0-9_-]{1,64}$`.
- Results are cached 60–120 s per instance plus CDN caching on the API routes, so page traffic does not keep the warehouse awake.
- `DEMO_MODE=1` serves deterministic synthetic data with a visible banner — use it for previews and sales demos.

Tables read (schema from `CITIBIKE_SCHEMA`): `predictions`, `live_outcomes`, `live_station_status`, `live_station_info`, `collector_runs`, `monitoring_log`, and optionally `analysis_weather` (notebook 09: "Does weather help?" card on Model performance).

Optional live weather on the Find page reads `WEATHER_FORECAST_TABLE` (default `workspace.default.weather_forecast_history`, filled hourly by the team's `11_collect_area_forecasts`). Optional panels hide themselves when their table is missing.

## Run locally

```bash
npm ci
cp .env.example .env.local      # set DEMO_MODE=1 to run without Databricks
npm run dev                     # http://localhost:3000
npm test && npm run typecheck   # 15 unit tests
```

## Demo on real NYC stations

Out of the box, demo mode invents 100 stations around Midtown. To put the demo on your real 100 MVP stations (real names and street corners, synthetic counts):

1. In the Databricks SQL editor run:

   ```sql
   SELECT i.station_id, i.name, i.lat, i.lon, i.capacity
   FROM workspace.citibike.live_station_info i
   JOIN workspace.citibike.mvp_stations m USING (station_id)
   ORDER BY i.name;
   ```

2. Download the result as CSV and run `npm run import-stations -- ~/Downloads/stations.csv`.
3. Commit `data/stations.json`. Rows outside the NYC bounding box or missing fields are skipped; an invalid file falls back to synthetic stations with a warning in the logs.

Live mode ignores this file; it always reads station locations from Databricks.

## Deploy to Vercel

1. **Repo.** Push this folder to the root of a GitHub repo (new repo, or replace the Streamlit files in `citibike-forecast`). `package.json` must be at the repo root, otherwise set *Root Directory* in Vercel.
2. **Import.** Vercel → Add New → Project → pick the repo. Framework preset: **Next.js** (auto-detected). No build overrides.
3. **Databricks credentials** (Databricks workspace):
   - *Host*: the workspace URL, e.g. `https://dbc-xxxx.cloud.databricks.com`.
   - *Warehouse ID*: SQL Warehouses → your serverless warehouse → Connection details → the last segment of the HTTP path.
   - *Token*: Settings → Developer → Access tokens → Generate. Set a lifetime (e.g. 30 days).
4. **Environment variables** (Vercel → Settings → Environment Variables, Production + Preview):

   | Name | Value |
   |---|---|
   | `DATABRICKS_HOST` | workspace URL |
   | `DATABRICKS_TOKEN` | the token — mark **Sensitive** |
   | `DATABRICKS_WAREHOUSE_ID` | warehouse id |
   | `CITIBIKE_SCHEMA` | `workspace.citibike` |
   | `DEMO_MODE` | `0` (or `1` for a demo deployment) |

5. **Deploy**, then open `/status`. Green freshness tiles = the pipeline and the connection both work. The first request after the warehouse has idled can take 10–20 s while it resumes; later requests come from cache.

Missing credentials return a clear 503 config message rather than a crash; Databricks errors return 502/504 without leaking details.

## Security

- The token lives only in Vercel's encrypted env vars. Never commit `.env.local`; `.gitignore` already excludes it.
- Prefer a service principal with `USE CATALOG`/`USE SCHEMA`/`SELECT` on the five tables and `CAN USE` on the warehouse over a personal token. Rotate or delete the token when the course is graded.
- Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` geolocation=self) are set in `next.config.mjs`. Map popups use `textContent`, never `innerHTML`.

## Before selling it

- **Data licence.** Citi Bike GBFS data is published under Lyft's data licence agreement. Read it before charging for a product built on it, and keep the "Not affiliated with Citi Bike or Lyft" attribution. Do not use Citi Bike or Lyft names or marks in product branding.
- **Coverage.** The model scores 100 stations. Scaling to all ~2,500 needs a bigger scoring job and a re-check of thresholds per station group.
- **Cost.** Free Edition is fine for a demo. Paid usage needs a production Databricks workspace (or exporting the latest predictions to Postgres/Redis on a schedule so the web tier never touches the warehouse).
- **Map tiles.** Default is OpenFreeMap (free, attribution required). Swap `NEXT_PUBLIC_MAP_STYLE` for MapTiler/Mapbox if you need an SLA.

## Layout

```
app/            pages, API routes (forecast, performance, performance/replay, stations/[id], status)
components/     StationMap (MapLibre), FindClient, PerformanceClient, StatusClient, ui
lib/            databricks (SQL API client), data (cached loaders), metrics, performance, demo, env, params
tests/          vitest unit tests for metrics and replay logic
```
