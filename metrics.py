"""Pure pandas/numpy helpers for the Citi Bike app (no Streamlit, no Databricks).

Kept separate so every number the app shows is unit-testable.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

WALK_M_PER_MIN = 80.0          # ~4.8 km/h walking speed
HORIZON_MIN = 15               # the models predict 15 minutes ahead


def haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres (vectorised)."""
    r = 6_371_000.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi, dlmb = p2 - p1, np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlmb / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def rank_stations(pred: pd.DataFrame, lat: float, lon: float, mode: str, radius_m: float) -> pd.DataFrame:
    """Stations within `radius_m` of (lat, lon), ranked by the chance the rider's need is met in 15 min.

    mode = 'bike' -> chance a bike is available  = 1 - p_empty
    mode = 'dock' -> chance a dock is available  = 1 - p_full
    Rows with missing coordinates or probabilities are dropped, never guessed.
    """
    if mode not in ("bike", "dock"):
        raise ValueError("mode must be 'bike' or 'dock'")
    d = pred.dropna(subset=["lat", "lon", "p_empty", "p_full"]).copy()
    d["distance_m"] = haversine_m(lat, lon, d["lat"].to_numpy(), d["lon"].to_numpy())
    d["walk_min"] = d["distance_m"] / WALK_M_PER_MIN
    if mode == "bike":
        d["chance"] = 1.0 - d["p_empty"]
        d["now"] = d["num_bikes_available"]
        d["flagged"] = d["pred_empty"] == 1
    else:
        d["chance"] = 1.0 - d["p_full"]
        d["now"] = d["num_docks_available"]
        d["flagged"] = d["pred_full"] == 1
    d["within"] = d["distance_m"] <= radius_m
    d["beyond_horizon"] = d["walk_min"] > HORIZON_MIN
    near = d[d["within"]].sort_values(["chance", "walk_min"], ascending=[False, True])
    return near.reset_index(drop=True)


def outcome_category(pred_flag: pd.Series, actual: pd.Series) -> pd.Series:
    """Confusion category per row: caught / missed / false_alarm / quiet."""
    p, a = pred_flag.astype(int).to_numpy(), actual.astype(int).to_numpy()
    out = np.where((p == 1) & (a == 1), "caught",
          np.where((p == 0) & (a == 1), "missed",
          np.where((p == 1) & (a == 0), "false_alarm", "quiet")))
    return pd.Series(out, index=pred_flag.index)


def target_cols(target: str) -> dict:
    """Column names for 'empty' or 'full' in the outcomes table."""
    if target == "empty":
        return {"p": "p_empty", "pred": "pred_empty", "label": "empty_label", "now_count": "num_bikes_available"}
    if target == "full":
        return {"p": "p_full", "pred": "pred_full", "label": "full_label", "now_count": "num_docks_available"}
    raise ValueError("target must be 'empty' or 'full'")


def scoreboard(outcomes: pd.DataFrame, target: str) -> pd.DataFrame:
    """Model vs persistence on the same rows.

    Persistence predicts the state at t carries to t+15: empty now <=> count of bikes now == 0.
    Onset = the state is NOT present at t but IS at t+15; persistence catches none by construction.
    """
    c = target_cols(target)
    if outcomes.empty:
        return pd.DataFrame()
    y = outcomes[c["label"]].astype(int)
    now = (outcomes[c["now_count"]] == 0).astype(int)
    model = outcomes[c["pred"]].astype(int)
    onset = (now == 0) & (y == 1)
    rows = []
    for name, flag, prob in [("Model", model, outcomes[c["p"]].astype(float)),
                             ("Persistence (no change)", now, now.astype(float))]:
        tp = int(((flag == 1) & (y == 1)).sum()); fp = int(((flag == 1) & (y == 0)).sum())
        fn = int(((flag == 0) & (y == 1)).sum())
        rows.append({
            "forecast": name,
            "precision": tp / (tp + fp) if tp + fp else np.nan,
            "recall": tp / (tp + fn) if tp + fn else np.nan,
            "brier": float(np.mean((prob - y) ** 2)),
            "new_events": int(onset.sum()),
            "new_events_caught": int((onset & (flag == 1)).sum()),
            "false_alarms": fp,
        })
    return pd.DataFrame(rows)


def calibration_bins(p: pd.Series, y: pd.Series, n_bins: int = 10, min_n: int = 20) -> pd.DataFrame:
    """Predicted vs observed rate in fixed-width probability bins (bins with < min_n rows dropped)."""
    edges = np.linspace(0, 1, n_bins + 1)
    idx = np.clip(np.digitize(p.to_numpy(dtype=float), edges[1:-1]), 0, n_bins - 1)
    df = pd.DataFrame({"bin": idx, "p": p.to_numpy(dtype=float), "y": y.to_numpy(dtype=float)})
    out = df.groupby("bin").agg(n=("y", "size"), mean_pred=("p", "mean"), obs_rate=("y", "mean")).reset_index()
    return out[out["n"] >= min_n].reset_index(drop=True)


def hourly_brier(outcomes: pd.DataFrame, tz: str = "America/New_York") -> pd.DataFrame:
    """Live Brier per local hour for model and persistence, both targets (long format for plotting)."""
    if outcomes.empty:
        return pd.DataFrame(columns=["hour", "target", "forecast", "brier", "n"])
    d = outcomes.copy()
    d["hour"] = pd.to_datetime(d["prediction_time_utc"], utc=True).dt.tz_convert(tz).dt.floor("h").dt.tz_localize(None)
    rows = []
    for target in ("empty", "full"):
        c = target_cols(target)
        y = d[c["label"]].astype(float)
        d[f"se_model_{target}"] = (d[c["p"]].astype(float) - y) ** 2
        d[f"se_pers_{target}"] = ((d[c["now_count"]] == 0).astype(float) - y) ** 2
        g = d.groupby("hour").agg(n=(c["label"], "size"), model=(f"se_model_{target}", "mean"),
                                  pers=(f"se_pers_{target}", "mean")).reset_index()
        for _, r in g.iterrows():
            rows.append({"hour": r["hour"], "target": target, "forecast": "Model", "brier": r["model"], "n": r["n"]})
            rows.append({"hour": r["hour"], "target": target, "forecast": "Persistence", "brier": r["pers"], "n": r["n"]})
    return pd.DataFrame(rows)
