"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { circlePolygon } from "@/lib/metrics";

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  color: string; // CSS color
  radius: number; // px
  emphasis?: boolean;
  title: string;
  lines: string[]; // tooltip lines (plain text)
}

const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || "https://tiles.openfreemap.org/styles/positron";

/**
 * Interactive station map (MapLibre GL). Points, an optional walk-radius ring and start marker.
 * Tooltips are built with textContent, never innerHTML, so station names cannot inject markup.
 */
export default function StationMap({
  points,
  center,
  radiusM,
  zoom = 13,
  onMapClick,
  onPointClick,
  height = 460,
  ariaLabel,
}: {
  points: MapPoint[];
  center: { lat: number; lon: number };
  radiusM?: number;
  zoom?: number;
  onMapClick?: (lat: number, lon: number) => void;
  onPointClick?: (id: string) => void;
  height?: number;
  ariaLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const marker = useRef<maplibregl.Marker | null>(null);
  const handlers = useRef({ onMapClick, onPointClick });
  handlers.current = { onMapClick, onPointClick };
  const latest = useRef({ points, center, radiusM });
  latest.current = { points, center, radiusM };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: [center.lon, center.lat],
      zoom,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.current = m;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });

    // If the base-map style cannot be fetched (blocked network, outage), fall back to a plain
    // background so stations still render instead of an empty map.
    let fellBack = false;
    const fallback = () => {
      if (fellBack || ready.current) return;
      fellBack = true;
      m.setStyle({ version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#e9ebee" } }] });
    };
    m.on("error", (e) => {
      if (!ready.current && /style|Failed to fetch|NetworkError/i.test(String(e.error?.message ?? ""))) fallback();
    });
    const timer = setTimeout(fallback, 8000);

    // "style.load" fires for the original style and again for the fallback; build layers once.
    m.on("style.load", () => {
      if (ready.current) return;
      clearTimeout(timer);
      m.addSource("radius", { type: "geojson", data: emptyFC() });
      m.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": "#2a78d6", "fill-opacity": 0.06 } });
      m.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": "#2a78d6", "line-width": 1.5, "line-dasharray": [2, 2] } });
      m.addSource("stations", { type: "geojson", data: emptyFC() });
      m.addLayer({
        id: "stations",
        type: "circle",
        source: "stations",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["get", "radius"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["case", ["get", "emphasis"], 2, 1],
          "circle-opacity": 0.92,
        },
      });
      ready.current = true;
      sync(m, latest.current);

      m.on("mousemove", "stations", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        m.getCanvas().style.cursor = "pointer";
        const props = f.properties as { title: string; lines: string };
        const box = document.createElement("div");
        const t = document.createElement("div");
        t.style.fontWeight = "600";
        t.textContent = props.title;
        box.appendChild(t);
        for (const line of JSON.parse(props.lines) as string[]) {
          const d = document.createElement("div");
          d.textContent = line;
          box.appendChild(d);
        }
        popup.setLngLat(e.lngLat).setDOMContent(box).addTo(m);
      });
      m.on("mouseleave", "stations", () => {
        m.getCanvas().style.cursor = "";
        popup.remove();
      });
      m.on("click", (e) => {
        const hit = m.queryRenderedFeatures(e.point, { layers: ["stations"] })[0];
        if (hit && handlers.current.onPointClick) handlers.current.onPointClick(String(hit.properties?.id));
        else handlers.current.onMapClick?.(e.lngLat.lat, e.lngLat.lng);
      });
    });
    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
    };
    // map is created once; updates flow through the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (m && ready.current) sync(m, { points, center, radiusM });
    if (m) {
      if (!marker.current) marker.current = new maplibregl.Marker({ color: "#2a78d6", scale: 0.8 });
      if (radiusM !== undefined) marker.current.setLngLat([center.lon, center.lat]).addTo(m);
      else marker.current.remove();
    }
  }, [points, center, radiusM]);

  useEffect(() => {
    map.current?.easeTo({ center: [center.lon, center.lat], duration: 600 });
  }, [center.lat, center.lon]);

  return <div ref={el} role="region" aria-label={ariaLabel} style={{ height }} className="w-full overflow-hidden rounded-xl" />;
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function sync(m: MLMap, { points, center, radiusM }: { points: MapPoint[]; center: { lat: number; lon: number }; radiusM?: number }) {
  (m.getSource("stations") as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { id: p.id, color: p.color, radius: p.radius, emphasis: !!p.emphasis, title: p.title, lines: JSON.stringify(p.lines) },
    })),
  });
  (m.getSource("radius") as GeoJSONSource | undefined)?.setData(
    radiusM !== undefined ? { type: "FeatureCollection", features: [circlePolygon(center.lat, center.lon, radiusM)] } : emptyFC(),
  );
}
