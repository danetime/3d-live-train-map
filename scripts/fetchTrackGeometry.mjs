/**
 * Fetch real railway geometry from OpenStreetMap and write src/data/lineGeometry.json,
 * which the app uses to draw each line along its true route (instead of a smooth
 * line through the stations).
 *
 * Run it on your own machine (this project's cloud sandbox can't reach the
 * Overpass API):
 *
 *   node scripts/fetchTrackGeometry.mjs
 *   node scripts/fetchTrackGeometry.mjs --selftest   # offline algorithm check
 *
 * How it works: for each line it downloads the railway=rail ways in a bounding
 * box, builds a graph of track segments, and traces the shortest path along the
 * rails between each pair of consecutive stations — giving the real curves.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "lineGeometry.json");
// Several public Overpass mirrors; we try them in turn. Override with OVERPASS_URL.
const ENDPOINTS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.openstreetmap.fr/api/interpreter",
    ];

// Station coordinates [lat, lng] and the ordered stops per line (CRS codes).
const S = {
  EXD: [50.729, -3.5435], EXC: [50.725, -3.532], POL: [50.731, -3.506], DIG: [50.709, -3.472],
  TOP: [50.687, -3.464], EXN: [50.668, -3.442], LYM: [50.647, -3.436], EXM: [50.619, -3.414],
  EXT: [50.716, -3.538], SCS: [50.628, -3.449], DWL: [50.581, -3.466], TGM: [50.547, -3.496],
  NTA: [50.529, -3.6], TVP: [50.917, -3.364], TAU: [51.025, -3.1015], NTC: [50.779, -3.587],
  CDF: [50.79, -3.648], YEO: [50.779, -3.708], EGG: [50.887, -3.878], KIG: [50.942, -3.908],
  UMB: [50.997, -3.976], BNP: [51.076, -4.064], SPC: [50.774, -3.91], OKE: [50.734, -4.0],
  TOT: [50.4255, -3.6888], IVY: [50.3917, -3.9136], PLY: [50.3779, -4.1426],
  TRR: [50.4719, -3.5402], TQY: [50.454, -3.5436], PGN: [50.4352, -3.5606],
};
const LINES = {
  exmouth: ["EXD", "EXC", "POL", "DIG", "TOP", "EXN", "LYM", "EXM"],
  "newton-abbot": ["EXD", "EXT", "SCS", "DWL", "TGM", "NTA", "TOT", "IVY", "PLY"],
  paignton: ["EXD", "EXT", "SCS", "DWL", "TGM", "NTA", "TRR", "TQY", "PGN"],
  taunton: ["EXD", "TVP", "TAU"],
  barnstaple: ["EXD", "NTC", "CDF", "YEO", "EGG", "KIG", "UMB", "BNP"],
  okehampton: ["EXD", "NTC", "CDF", "YEO", "SPC", "OKE"],
};

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const la1 = toRad(a[0]);
  const la2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Tiny binary min-heap keyed by number priority.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].d <= a[i].d) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < a.length && a[l].d < a[s].d) s = l;
        if (r < a.length && a[r].d < a[s].d) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}

const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

/** Build an undirected graph from OSM ways (each way = array of [lat,lng]). */
function buildGraph(ways) {
  const adj = new Map(); // key → [{ key, coord, w }]
  const coordOf = new Map(); // key → [lat,lng]
  const add = (ak, a, bk, b) => {
    if (!adj.has(ak)) adj.set(ak, []);
    adj.get(ak).push({ key: bk, coord: b, w: haversine(a, b) });
  };
  for (const way of ways) {
    for (let i = 0; i + 1 < way.length; i++) {
      const a = way[i], b = way[i + 1];
      const ak = key(a), bk = key(b);
      coordOf.set(ak, a);
      coordOf.set(bk, b);
      add(ak, a, bk, b);
      add(bk, b, ak, a);
    }
  }
  return { adj, coordOf };
}

function nearestKey(coordOf, target) {
  let best = null, bestD = Infinity;
  for (const [k, c] of coordOf) {
    const d = haversine(c, target);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

/** Dijkstra shortest path; returns array of [lat,lng] from src to dst. */
function shortestPath(graph, srcKey, dstKey) {
  const { adj, coordOf } = graph;
  const dist = new Map([[srcKey, 0]]);
  const prev = new Map();
  const heap = new Heap();
  heap.push({ key: srcKey, d: 0 });
  while (heap.size) {
    const { key: u, d } = heap.pop();
    if (u === dstKey) break;
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const e of adj.get(u) ?? []) {
      const nd = d + e.w;
      if (nd < (dist.get(e.key) ?? Infinity)) {
        dist.set(e.key, nd);
        prev.set(e.key, u);
        heap.push({ key: e.key, d: nd });
      }
    }
  }
  if (!dist.has(dstKey)) return null;
  const path = [];
  for (let k = dstKey; k; k = prev.get(k)) {
    path.push(coordOf.get(k));
    if (k === srcKey) break;
  }
  return path.reverse();
}

/** Drop points closer than `minM` metres to the previous kept point. */
function decimate(points, minM = 18) {
  const out = [];
  for (const p of points) {
    if (!out.length || haversine(out[out.length - 1], p) >= minM) out.push(p);
  }
  if (out.length && points.length) out[out.length - 1] = points[points.length - 1];
  return out;
}

async function fetchWays(stations) {
  const lats = stations.map((s) => s[0]);
  const lngs = stations.map((s) => s[1]);
  const pad = 0.03;
  const bbox = [Math.min(...lats) - pad, Math.min(...lngs) - pad, Math.max(...lats) + pad, Math.max(...lngs) + pad];
  const q = `[out:json][timeout:90];way["railway"="rail"](${bbox.join(",")});out geom;`;
  // Overpass mirrors reject anonymous requests (HTTP 406/403), so identify
  // ourselves and try each mirror until one answers.
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    "User-Agent": "3d-live-train-map/0.1 (OSM track geometry fetch)",
  };
  let lastErr = "";
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers });
      if (!res.ok) {
        lastErr = `HTTP ${res.status} from ${new URL(url).host}`;
        continue;
      }
      const json = await res.json();
      return (json.elements || [])
        .filter((e) => e.type === "way" && Array.isArray(e.geometry))
        .map((e) => e.geometry.map((g) => [g.lat, g.lon]));
    } catch (e) {
      lastErr = `${new URL(url).host}: ${e.message}`;
    }
  }
  throw new Error(lastErr || "all Overpass mirrors failed");
}

async function buildLine(stops) {
  const stations = stops.map((c) => S[c]);
  const graph = buildGraph(await fetchWays(stations));
  const full = [];
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = nearestKey(graph.coordOf, stations[i]);
    const b = nearestKey(graph.coordOf, stations[i + 1]);
    const seg = a && b ? shortestPath(graph, a, b) : null;
    if (!seg) {
      console.warn(`  ! no rail path ${stops[i]}→${stops[i + 1]} (using straight line)`);
      full.push(stations[i], stations[i + 1]);
      continue;
    }
    for (const p of seg) {
      if (!full.length || key(full[full.length - 1]) !== key(p)) full.push(p);
    }
  }
  return decimate(full).map(([lat, lng]) => [+lat.toFixed(6), +lng.toFixed(6)]);
}

async function main() {
  const out = {};
  for (const [id, stops] of Object.entries(LINES)) {
    process.stdout.write(`Fetching ${id} … `);
    try {
      out[id] = await buildLine(stops);
      console.log(`${out[id].length} points`);
    } catch (e) {
      console.warn(`failed (${e.message})`);
    }
    await new Promise((r) => setTimeout(r, 1500)); // be polite to Overpass
  }
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${OUT}`);
}

function selftest() {
  // Square graph A-B-C-D with a shortcut; check the traced path.
  const ways = [
    [[0, 0], [0, 1]], // A→B
    [[0, 1], [1, 1]], // B→C
    [[1, 1], [1, 0]], // C→D
    [[0, 0], [1, 0]], // A→D (direct)
  ];
  const g = buildGraph(ways);
  const path = shortestPath(g, key([0, 0]), key([1, 0]));
  const ok = path && path.length === 2 && key(path[0]) === key([0, 0]) && key(path[1]) === key([1, 0]);
  const dec = decimate([[0, 0], [0, 0.00001], [0, 1]], 18);
  const decOk = dec.length === 2;
  console.log(`shortestPath direct edge: ${ok ? "PASS" : "FAIL"}`);
  console.log(`decimate drops near-dupes: ${decOk ? "PASS" : "FAIL"}`);
  process.exit(ok && decOk ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
else main();
