#!/usr/bin/env node
// Convert a CSV exported from Databricks into data/stations.json for demo mode.
// Usage: node scripts/import-stations.mjs path/to/stations.csv
// Required columns: station_id, name, lat, lon, capacity (header row, any order).
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/import-stations.mjs <stations.csv>");
  process.exit(1);
}

// RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

const [header, ...body] = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
const cols = header.map((h) => h.trim().toLowerCase());
const need = ["station_id", "name", "lat", "lon", "capacity"];
const missing = need.filter((n) => !cols.includes(n));
if (missing.length) {
  console.error(`Missing column(s): ${missing.join(", ")}. Found: ${cols.join(", ")}`);
  process.exit(1);
}
const idx = Object.fromEntries(need.map((n) => [n, cols.indexOf(n)]));
const seen = new Set();
const out = [];
for (const r of body) {
  const s = {
    station_id: r[idx.station_id].trim(),
    name: r[idx.name].trim(),
    lat: Number(r[idx.lat]),
    lon: Number(r[idx.lon]),
    capacity: Math.round(Number(r[idx.capacity])),
  };
  const ok = s.station_id && s.name && s.lat > 40.4 && s.lat < 41 && s.lon > -74.3 && s.lon < -73.6 && s.capacity > 0;
  if (!ok || seen.has(s.station_id)) continue;
  seen.add(s.station_id);
  out.push(s);
}
if (!out.length) {
  console.error("No valid NYC stations found in the file.");
  process.exit(1);
}
writeFileSync(new URL("../data/stations.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`Wrote ${out.length} stations to data/stations.json (skipped ${body.length - out.length}).`);
