"""Data access for the Citi Bike app.

Two interchangeable sources with the same methods:
  * DatabricksSource - reads the project's Unity Catalog tables through the app's SQL warehouse,
                       authenticated as the Databricks App's service principal (no tokens in code).
  * DemoSource       - deterministic synthetic data in the same shape, for local testing and as an
                       offline fallback. The app labels it clearly as demo data.

Set CITIBIKE_DEMO=1 to force the demo source.
"""
from __future__ import annotations

import datetime as dt
import os
import re

import numpy as np
import pandas as pd

SCHEMA = os.getenv("CITIBIKE_SCHEMA", "workspace.citibike")
if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*", SCHEMA):
    raise ValueError(f"CITIBIKE_SCHEMA must be catalog.schema, got {SCHEMA!r}")

OUTCOME_HOURS = 72   # live_outcomes keeps ~3 days; the app never reads more than this


class DatabricksSource:
    name = "databricks"

    def __init__(self):
        from databricks import sql
        from databricks.sdk.core import Config

        warehouse = os.getenv("DATABRICKS_WAREHOUSE_ID")
        if not warehouse:
            raise RuntimeError("DATABRICKS_WAREHOUSE_ID is not set. Add the SQL warehouse as an app resource "
                               "with key 'sql-warehouse' (see README).")
        self._cfg = Config()
        self._sql = sql
        self._host = re.sub(r"^https?://", "", self._cfg.host or "").rstrip("/")
        self._http_path = f"/sql/1.0/warehouses/{warehouse}"

    def _query(self, q: str, params: dict | None = None) -> pd.DataFrame:
        with self._sql.connect(server_hostname=self._host, http_path=self._http_path,
                               credentials_provider=lambda: self._cfg.authenticate) as conn:
            with conn.cursor() as cur:
                cur.execute(q, params or {})
                return cur.fetchall_arrow().to_pandas()

    def latest_predictions(self) -> pd.DataFrame:
        return self._query(f"""
            WITH latest AS (SELECT MAX(prediction_time_utc) AS t FROM {SCHEMA}.predictions)
            SELECT p.*, i.name, i.lat, i.lon, i.capacity
            FROM {SCHEMA}.predictions p
            JOIN latest ON p.prediction_time_utc = latest.t
            LEFT JOIN {SCHEMA}.live_station_info i USING (station_id)""")

    def outcomes(self) -> pd.DataFrame:
        return self._query(f"""
            SELECT o.*, i.name, i.lat, i.lon
            FROM {SCHEMA}.live_outcomes o
            LEFT JOIN {SCHEMA}.live_station_info i USING (station_id)
            WHERE o.prediction_time_utc >= current_timestamp() - INTERVAL {OUTCOME_HOURS} HOURS""")

    def station_history(self, station_id: str, start: dt.datetime, end: dt.datetime) -> pd.DataFrame:
        return self._query(f"""
            SELECT snapshot_ts, num_bikes_available, num_docks_available
            FROM {SCHEMA}.live_station_status
            WHERE station_id = :sid AND snapshot_ts BETWEEN :start AND :end
            ORDER BY snapshot_ts""", {"sid": str(station_id), "start": start, "end": end})

    def health(self) -> dict:
        k = self._query(f"""
            SELECT
              (SELECT MAX(snapshot_ts) FROM {SCHEMA}.live_station_status) AS newest_snapshot,
              (SELECT MAX(scored_at) FROM {SCHEMA}.predictions) AS last_scored,
              (SELECT COUNT(*) FROM {SCHEMA}.collector_runs
                 WHERE fetched_at >= current_timestamp() - INTERVAL 24 HOURS AND status = 'OK') AS runs_ok,
              (SELECT COUNT(*) FROM {SCHEMA}.collector_runs
                 WHERE fetched_at >= current_timestamp() - INTERVAL 24 HOURS AND status <> 'OK') AS runs_failed,
              current_timestamp() AS now_utc""").iloc[0].to_dict()
        log = self._query(f"""
            SELECT checked_at, check, value, ok, detail
            FROM {SCHEMA}.monitoring_log
            WHERE checked_at >= current_timestamp() - INTERVAL 24 HOURS
            ORDER BY checked_at DESC, check""")
        return {"kpis": k, "log": log}


class DemoSource:
    """Synthetic but realistic data: 100 Manhattan stations, 72 h of 5-minute snapshots."""
    name = "demo"

    def __init__(self, seed: int = 622):
        rng = np.random.default_rng(seed)
        n = 100
        self.now = pd.Timestamp("2026-11-12 23:45:00")      # on the 15-min grid
        self.info = pd.DataFrame({
            "station_id": [f"demo-{i:03d}" for i in range(n)],
            "name": [f"Demo Station {i:03d}" for i in range(n)],
            "lat": rng.uniform(40.705, 40.800, n),
            "lon": rng.uniform(-74.015, -73.940, n),
            "capacity": rng.integers(15, 46, n),
        })
        times = pd.date_range((self.now - pd.Timedelta(hours=OUTCOME_HOURS + 1)).floor("15min"), self.now, freq="5min")
        hours = ((times.hour - 5) % 24).to_numpy()            # rough UTC->NY shift for commute shape
        rows = []
        for i, st in self.info.iterrows():
            cap = int(st.capacity)
            kind = i % 3                                       # 0 drains AM, 1 fills AM, 2 neutral
            b = int(rng.integers(2, cap - 1))
            series = []
            for h in hours:
                drift = 0.0
                if kind == 0: drift = -1.6 if 7 <= h <= 9 else (1.4 if 17 <= h <= 19 else 0.0)
                if kind == 1: drift = 1.6 if 7 <= h <= 9 else (-1.4 if 17 <= h <= 19 else 0.0)
                b = int(np.clip(round(b + drift + 0.04 * (cap / 2 - b) + rng.normal(0, 1.4)), 0, cap))   # mean-reverting walk
                series.append(b)
            series = np.array(series)
            rows.append(pd.DataFrame({"station_id": st.station_id, "snapshot_ts": times,
                                      "num_bikes_available": series, "num_docks_available": cap - series}))
        self.status = pd.concat(rows, ignore_index=True)
        self._outcomes, self._latest = self._make_predictions(rng)

    def _make_predictions(self, rng):
        s = self.status.copy()
        s["t"] = s["snapshot_ts"].dt.floor("15min")
        grid = s[s["snapshot_ts"] == s["t"]].copy()            # snapshots on the grid
        grid = grid.sort_values(["station_id", "t"])
        g = grid.groupby("station_id")
        grid["d15"] = grid["num_bikes_available"] - g["num_bikes_available"].shift(1)
        grid["y_bikes"] = g["num_bikes_available"].shift(-1)
        grid["y_docks"] = g["num_docks_available"].shift(-1)
        b, dk, d15 = grid["num_bikes_available"], grid["num_docks_available"], grid["d15"].fillna(0)
        z_e = 2.2 - 1.1 * b + 0.35 * (-d15) + rng.normal(0, 0.6, len(grid))
        z_f = 2.2 - 1.1 * dk + 0.35 * d15 + rng.normal(0, 0.6, len(grid))
        grid["p_empty"] = 1 / (1 + np.exp(-z_e))
        grid["p_full"] = 1 / (1 + np.exp(-z_f))
        grid["threshold_empty"], grid["threshold_full"] = 0.400, 0.472
        grid["pred_empty"] = (grid["p_empty"] >= 0.400).astype(int)
        grid["pred_full"] = (grid["p_full"] >= 0.472).astype(int)
        grid["model_version_empty"], grid["model_version_full"] = "demo", "demo"
        grid = grid.rename(columns={"t": "prediction_time_utc"})
        grid["target_time_utc"] = grid["prediction_time_utc"] + pd.Timedelta(minutes=15)
        grid["scored_at"] = grid["prediction_time_utc"] + pd.Timedelta(minutes=3)
        grid = grid.merge(self.info, on="station_id", how="left")
        latest = grid[grid["prediction_time_utc"] == grid["prediction_time_utc"].max()].copy()
        out = grid.dropna(subset=["y_bikes"]).copy()
        out["empty_label"] = (out["y_bikes"] == 0).astype(int)
        out["full_label"] = (out["y_docks"] == 0).astype(int)
        keep = ["station_id", "prediction_time_utc", "target_time_utc", "num_bikes_available", "num_docks_available",
                "p_empty", "pred_empty", "threshold_empty", "model_version_empty",
                "p_full", "pred_full", "threshold_full", "model_version_full", "scored_at", "name", "lat", "lon"]
        return (out[keep + ["empty_label", "full_label"]].reset_index(drop=True),
                latest[keep + ["capacity"]].reset_index(drop=True))

    def latest_predictions(self):
        return self._latest.copy()

    def outcomes(self):
        return self._outcomes.copy()

    def station_history(self, station_id, start, end):
        s = self.status
        m = (s.station_id == station_id) & (s.snapshot_ts >= pd.Timestamp(start)) & (s.snapshot_ts <= pd.Timestamp(end))
        return s.loc[m, ["snapshot_ts", "num_bikes_available", "num_docks_available"]].reset_index(drop=True)

    def health(self):
        log = pd.DataFrame({"checked_at": [self.now] * 3,
                            "check": ["snapshot_age_min", "prediction_age_min", "collector_fail_rate_24h"],
                            "value": [2.4, 3.1, 0.0], "ok": [True, True, True], "detail": ["demo"] * 3})
        return {"kpis": {"newest_snapshot": self.now - pd.Timedelta(minutes=2), "last_scored": self.now - pd.Timedelta(minutes=3),
                         "runs_ok": 288, "runs_failed": 0, "now_utc": self.now}, "log": log}


def get_source():
    if os.getenv("CITIBIKE_DEMO") == "1":
        return DemoSource()
    return DatabricksSource()
