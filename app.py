"""Citi Bike 15-minute availability: rider finder, model test bench, and health view.

Runs as a Databricks App (Streamlit) against the project's Unity Catalog tables,
or locally with CITIBIKE_DEMO=1 on synthetic data.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import pydeck as pdk
import streamlit as st
from plotly.subplots import make_subplots

import metrics as M
from data import get_source

TZ = "America/New_York"
BLUE, GREY = "#2a78d6", "#8a8985"
GOOD, WARN, BAD = "#0ca30c", "#fab219", "#d03b3b"
CAT_COLOR = {"caught": [12, 163, 12], "missed": [208, 59, 59], "false_alarm": [250, 178, 25], "quiet": [190, 189, 184]}
CAT_LABEL = {"caught": "Caught (flagged, happened)", "missed": "Missed (not flagged, happened)",
             "false_alarm": "False alarm (flagged, didn't happen)", "quiet": "Correct quiet"}

st.set_page_config(page_title="Citi Bike 15-minute forecast", page_icon="🚲", layout="wide")


# ---------------------------------------------------------------- data (cached)
@st.cache_resource
def source():
    return get_source()


def utc_naive(s: pd.Series) -> pd.Series:
    s = pd.to_datetime(s)
    return s.dt.tz_convert("UTC").dt.tz_localize(None) if s.dt.tz is not None else s


def to_local(ts) -> pd.Timestamp:
    return pd.Timestamp(ts).tz_localize("UTC").tz_convert(TZ) if pd.Timestamp(ts).tzinfo is None \
        else pd.Timestamp(ts).tz_convert(TZ)


@st.cache_data(ttl=60, show_spinner=False)
def load_latest() -> pd.DataFrame:
    d = source().latest_predictions()
    for c in ("prediction_time_utc", "target_time_utc", "scored_at"):
        if c in d:
            d[c] = utc_naive(d[c])
    return d


@st.cache_data(ttl=120, show_spinner=False)
def load_outcomes() -> pd.DataFrame:
    d = source().outcomes()
    for c in ("prediction_time_utc", "target_time_utc", "scored_at"):
        if c in d:
            d[c] = utc_naive(d[c])
    return d


@st.cache_data(ttl=120, show_spinner=False)
def load_history(station_id: str, start: dt.datetime, end: dt.datetime) -> pd.DataFrame:
    d = source().station_history(station_id, start, end)
    d["snapshot_ts"] = utc_naive(d["snapshot_ts"])
    return d


@st.cache_data(ttl=60, show_spinner=False)
def load_health() -> dict:
    return source().health()


def pct(x) -> str:
    return "—" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.0%}"


# ---------------------------------------------------------------- header
try:
    latest = load_latest()
except Exception as e:  # noqa: BLE001 - surface a readable error instead of a stack trace
    st.error(f"Could not read predictions: {e}")
    st.stop()

if source().name == "demo":
    st.warning("Demo mode: synthetic data, not real Citi Bike stations. Set up the Databricks connection to see live data.")

st.title("Will there be a bike when I get there?")
if latest.empty:
    st.info("No predictions yet. The scoring job writes a new batch every 15 minutes.")
    st.stop()

t_pred = pd.Timestamp(latest["prediction_time_utc"].max())
age_min = (pd.Timestamp.utcnow().tz_localize(None) - latest["scored_at"].max()).total_seconds() / 60
versions = f"empty v{latest['model_version_empty'].iloc[0]} · full v{latest['model_version_full'].iloc[0]}"
st.caption(f"Forecast for **{to_local(t_pred + pd.Timedelta(minutes=15)):%a %b %d, %I:%M %p}** "
           f"(made from data at {to_local(t_pred):%I:%M %p}, scored {age_min:.0f} min ago) · "
           f"{len(latest)} stations covered · models {versions}")

tab_find, tab_test, tab_health = st.tabs(["Find a bike or dock", "Test the model", "Is it working?"])

# ================================================================= TAB 1: rider finder
with tab_find:
    left, right = st.columns([1, 2.2], gap="large")
    with left:
        mode_label = st.radio("I need…", ["a bike", "an open dock"], horizontal=True)
        mode = "bike" if mode_label == "a bike" else "dock"
        names = latest.dropna(subset=["lat", "lon"]).sort_values("name")
        start_name = st.selectbox("I'm starting near", names["name"].tolist(),
                                  index=min(len(names) - 1, len(names) // 2))
        start = names[names["name"] == start_name].iloc[0]
        radius = st.slider("How far will you walk? (metres)", 200, 2000, 800, step=100)
        st.caption(f"≈ {radius / M.WALK_M_PER_MIN:.0f} min at a normal walking pace. "
                   f"Forecasts look {M.HORIZON_MIN} minutes ahead.")

    ranked = M.rank_stations(latest, float(start.lat), float(start.lon), mode, radius)
    need = "bike" if mode == "bike" else "open dock"
    with left:
        if ranked.empty:
            st.info("No covered stations within that distance. Try walking a little farther.")
        else:
            best = ranked.iloc[0]
            st.success(f"**Best bet: {best['name']}**  \n"
                       f"{best['chance']:.0%} chance of a {need} in 15 min · "
                       f"{int(best['now'])} {'bikes' if mode == 'bike' else 'docks'} now · "
                       f"{best['walk_min']:.0f} min walk")
            if (ranked["flagged"]).any():
                st.caption(f"{int(ranked['flagged'].sum())} nearby station(s) are flagged as likely "
                           f"{'empty' if mode == 'bike' else 'full'} by the model.")

    with right:
        allst = M.rank_stations(latest, float(start.lat), float(start.lon), mode, 1e9)
        allst["color"] = allst["chance"].apply(
            lambda c: [12, 163, 12, 220] if c >= 0.8 else ([250, 178, 25, 220] if c >= 0.5 else [208, 59, 59, 230]))
        allst["radius_px"] = np.where(allst["within"], 70, 40)
        allst["chance_txt"] = (allst["chance"] * 100).round().astype(int).astype(str) + "%"
        allst["walk_txt"] = allst["walk_min"].round().astype(int).astype(str) + " min"
        allst["now_int"] = allst["now"].astype(int)
        layers = [
            pdk.Layer("ScatterplotLayer", data=allst, get_position="[lon, lat]", get_fill_color="color",
                      get_radius="radius_px", pickable=True, stroked=True, get_line_color=[255, 255, 255],
                      line_width_min_pixels=1),
            pdk.Layer("ScatterplotLayer", data=pd.DataFrame([{"lat": start.lat, "lon": start.lon}]),
                      get_position="[lon, lat]", get_radius=radius, filled=False, stroked=True,
                      get_line_color=[42, 120, 214], line_width_min_pixels=2),
        ]
        st.pydeck_chart(pdk.Deck(
            layers=layers, map_provider="carto", map_style=pdk.map_styles.CARTO_LIGHT,
            initial_view_state=pdk.ViewState(latitude=float(start.lat), longitude=float(start.lon), zoom=13.2),
            tooltip={"html": "<b>{name}</b><br/>Chance in 15 min: {chance_txt}<br/>Now: {now_int}<br/>Walk: {walk_txt}"}),
            height=430)
        st.caption("Green ≥ 80% · amber 50–80% · red < 50% chance of a " + need +
                   " in 15 minutes. Larger dots are within your walking distance; the blue ring is that distance.")

    if not ranked.empty:
        show = ranked.head(10).assign(
            **{"Walk (min)": lambda d: d["walk_min"].round(0).astype(int),
               ("Bikes now" if mode == "bike" else "Docks now"): lambda d: d["now"].astype(int),
               "Chance in 15 min": lambda d: (d["chance"] * 100).round(0),
               "Model flag": lambda d: np.where(d["flagged"], "likely " + ("empty" if mode == "bike" else "full"), "")})
        cols = ["name", "Walk (min)", "Bikes now" if mode == "bike" else "Docks now", "Chance in 15 min", "Model flag"]
        st.dataframe(show[cols].rename(columns={"name": "Station"}), hide_index=True, use_container_width=True,
                     column_config={"Chance in 15 min": st.column_config.ProgressColumn(
                         format="%.0f%%", min_value=0, max_value=100)})
        if ranked["beyond_horizon"].any():
            st.caption("Stations more than a 15-minute walk away are shown, but the forecast is for 15 minutes from now, "
                       "not your arrival time.")

# ================================================================= TAB 2: test the model
with tab_test:
    out = load_outcomes()
    if out.empty:
        st.info("No predictions with known outcomes yet. Outcomes appear 15 minutes after each forecast.")
    else:
        target_label = st.radio("Predicting", ["Empty (no bikes)", "Full (no docks)"], horizontal=True, key="tgt")
        target = "empty" if target_label.startswith("Empty") else "full"
        c = M.target_cols(target)

        hours = (out["prediction_time_utc"].max() - out["prediction_time_utc"].min()).total_seconds() / 3600
        st.subheader(f"Model vs. \"nothing changes\" over the last {hours:.0f} hours")
        sb = M.scoreboard(out, target)
        mdl, per = sb.iloc[0], sb.iloc[1]
        k1, k2, k3, k4 = st.columns(4)
        k1.metric(f"New {target} stations caught in advance", f"{mdl.new_events_caught} of {mdl.new_events}",
                  help="Stations that were NOT " + target + " at prediction time but were 15 minutes later.")
        k2.metric("…by persistence", f"{per.new_events_caught} of {per.new_events}",
                  help="Persistence assumes nothing changes, so it can never warn about a new event.")
        k3.metric("Model precision (flags that were right)", pct(mdl.precision),
                  help=f"Persistence: {pct(per.precision)}. Persistence only ever flags stations that are already "
                       f"{target}, so its precision is high but it gives no advance warning.")
        k4.metric("Probability error (Brier, lower is better)", f"{mdl.brier:.4f}",
                  delta=f"{(1 - mdl.brier / per.brier):.0%} less error" if per.brier else None, delta_color="normal")

        # ---- replay map
        st.subheader("Replay a moment")
        times = sorted(out["prediction_time_utc"].unique())
        labels = [f"{to_local(t):%a %I:%M %p}" for t in times]
        pick = st.select_slider("Prediction time", options=list(range(len(times))), value=len(times) - 1,
                                format_func=lambda i: labels[i])
        snap = out[out["prediction_time_utc"] == times[pick]].dropna(subset=["lat", "lon"]).copy()
        snap["cat"] = M.outcome_category(snap[c["pred"]], snap[c["label"]])
        snap["color"] = snap["cat"].map(CAT_COLOR).apply(lambda v: v + [230])
        snap["radius_px"] = np.where(snap["cat"] == "quiet", 35, 75)
        snap["p_txt"] = (snap[c["p"]] * 100).round().astype(int).astype(str) + "%"
        snap["cat_txt"] = snap["cat"].map(CAT_LABEL)
        mcol, lcol = st.columns([2.2, 1], gap="large")
        with mcol:
            st.pydeck_chart(pdk.Deck(
                layers=[pdk.Layer("ScatterplotLayer", data=snap, get_position="[lon, lat]", get_fill_color="color",
                                  get_radius="radius_px", pickable=True, stroked=True,
                                  get_line_color=[255, 255, 255], line_width_min_pixels=1)],
                map_provider="carto", map_style=pdk.map_styles.CARTO_LIGHT,
                initial_view_state=pdk.ViewState(latitude=float(snap["lat"].mean()), longitude=float(snap["lon"].mean()), zoom=12),
                tooltip={"html": "<b>{name}</b><br/>Predicted: {p_txt}<br/>{cat_txt}"}), height=420)
        with lcol:
            counts = snap["cat"].value_counts()
            st.markdown(f"**{to_local(times[pick]):%a %b %d, %I:%M %p}** → outcome at "
                        f"{to_local(times[pick] + np.timedelta64(15, 'm')):%I:%M %p}")
            for k in ("caught", "missed", "false_alarm", "quiet"):
                rgb = CAT_COLOR[k]
                st.markdown(f"<span style='color:rgb({rgb[0]},{rgb[1]},{rgb[2]});font-size:1.2em'>●</span> "
                            f"{CAT_LABEL[k]}: **{int(counts.get(k, 0))}**", unsafe_allow_html=True)
            st.caption("Drag the slider to any past forecast. Every dot is checked against what the station "
                       "actually reported 15 minutes later.")

        # ---- station drill-down
        st.subheader("Follow one station")
        st_names = out.dropna(subset=["name"]).groupby("name")[c["label"]].sum().sort_values(ascending=False)
        station_name = st.selectbox("Station (most " + target + " events first)", st_names.index.tolist())
        so = out[out["name"] == station_name].sort_values("prediction_time_utc")
        sid = so["station_id"].iloc[0]
        hist = load_history(sid, so["prediction_time_utc"].min().to_pydatetime(),
                            (so["target_time_utc"].max()).to_pydatetime())
        count_col = "num_bikes_available" if target == "empty" else "num_docks_available"
        fig = make_subplots(rows=2, cols=1, shared_xaxes=True, row_heights=[0.45, 0.55], vertical_spacing=0.08,
                            subplot_titles=(f"Model: chance of {target} in 15 min (plotted at the time it predicts)",
                                            f"Actual {'bikes' if target == 'empty' else 'open docks'} available"))
        x_target = so["target_time_utc"].map(to_local)
        fig.add_trace(go.Scatter(x=x_target, y=so[c["p"]], mode="lines", line=dict(color=BLUE, width=2),
                                 name="Predicted chance", hovertemplate="%{x|%a %I:%M %p}: %{y:.0%}<extra></extra>"),
                      row=1, col=1)
        thr = float(so[f"threshold_{target}"].iloc[-1]) if f"threshold_{target}" in so else 0.5
        fig.add_hline(y=thr, line=dict(color=GREY, dash="dash", width=1), row=1, col=1,
                      annotation_text=f"flag threshold {thr:.2f}", annotation_position="top left")
        hx = hist["snapshot_ts"].map(to_local)
        fig.add_trace(go.Scatter(x=hx, y=hist[count_col], mode="lines", line=dict(color=GREY, width=1.5, shape="hv"),
                                 name="Actual count", hovertemplate="%{x|%a %I:%M %p}: %{y}<extra></extra>"),
                      row=2, col=1)
        zero = hist[hist[count_col] == 0]
        fig.add_trace(go.Scatter(x=zero["snapshot_ts"].map(to_local), y=zero[count_col], mode="markers",
                                 marker=dict(color=BAD, size=6), name=f"Station {target}",
                                 hovertemplate="%{x|%a %I:%M %p}: " + target + "<extra></extra>"), row=2, col=1)
        fig.update_yaxes(range=[0, 1], tickformat=".0%", row=1, col=1)
        fig.update_yaxes(rangemode="tozero", row=2, col=1)
        fig.update_layout(height=470, margin=dict(l=10, r=10, t=40, b=10), legend=dict(orientation="h", y=-0.12),
                          plot_bgcolor="white")
        st.plotly_chart(fig, use_container_width=True)
        ssb = M.scoreboard(so, target)
        st.caption(f"At this station: the model caught {ssb.iloc[0].new_events_caught} of "
                   f"{ssb.iloc[0].new_events} new {target} events in advance; persistence caught 0.")

# ================================================================= TAB 3: health
with tab_health:
    h = load_health()
    k = h["kpis"]
    now = pd.Timestamp(k["now_utc"]).tz_localize(None) if pd.Timestamp(k["now_utc"]).tzinfo else pd.Timestamp(k["now_utc"])
    snap_age = (now - utc_naive(pd.Series([k["newest_snapshot"]])).iloc[0]).total_seconds() / 60
    pred_age = (now - utc_naive(pd.Series([k["last_scored"]])).iloc[0]).total_seconds() / 60
    a, b, cc, d = st.columns(4)
    a.metric("Minutes since last snapshot", f"{snap_age:.1f}", help="Collector runs every 5 minutes; alert above 25.")
    b.metric("Minutes since last forecast", f"{pred_age:.1f}", help="Scoring runs every 15 minutes; alert above 30.")
    cc.metric("Collector runs OK (24 h)", int(k["runs_ok"]))
    d.metric("Collector runs failed (24 h)", int(k["runs_failed"]))

    out = load_outcomes()
    if not out.empty:
        st.subheader("Live accuracy by hour")
        hb = M.hourly_brier(out, TZ)
        tsel = st.radio("Target", ["empty", "full"], horizontal=True, key="hb")
        sel = hb[hb["target"] == tsel]
        fig = go.Figure()
        for name, color, dash in [("Model", BLUE, None), ("Persistence", GREY, "dot")]:
            s = sel[sel["forecast"] == name]
            fig.add_trace(go.Scatter(x=s["hour"], y=s["brier"], name=name, mode="lines",
                                     line=dict(color=color, width=2.5 if name == "Model" else 1.5, dash=dash)))
        fig.update_layout(height=320, yaxis_title="Brier score (lower is better)", plot_bgcolor="white",
                          margin=dict(l=10, r=10, t=10, b=10), legend=dict(orientation="h", y=-0.2))
        st.plotly_chart(fig, use_container_width=True)

        st.subheader("Are the probabilities honest?")
        cl = M.target_cols(tsel)
        cal = M.calibration_bins(out[cl["p"]], out[cl["label"]])
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=[0, 1], y=[0, 1], mode="lines", line=dict(color=GREY, dash="dash", width=1),
                                 name="Perfect calibration"))
        fig.add_trace(go.Scatter(x=cal["mean_pred"], y=cal["obs_rate"], mode="lines+markers",
                                 marker=dict(size=8, color=BLUE), line=dict(color=BLUE), name="Model",
                                 customdata=cal["n"],
                                 hovertemplate="predicted %{x:.0%} → happened %{y:.0%} (n=%{customdata})<extra></extra>"))
        fig.update_layout(height=340, xaxis=dict(range=[0, 1], tickformat=".0%", title="Predicted chance"),
                          yaxis=dict(range=[0, 1], tickformat=".0%", title="How often it happened"),
                          plot_bgcolor="white", margin=dict(l=10, r=10, t=10, b=10))
        st.plotly_chart(fig, use_container_width=True)

    st.subheader("Automated checks (last 24 h)")
    st.dataframe(h["log"], hide_index=True, use_container_width=True)

st.caption("Predictions: gradient-boosted classifiers trained on Aug 21 – Oct 11, 2026 Citi Bike GBFS snapshots; "
           "live data from the public Citi Bike GBFS feed. Covers 100 study stations only.")
