/**
 * Extract the ordered main-line berth chain (Exeter St David's → Newton Abbot)
 * from Network Rail SMART open data, split by direction (down / up).
 *
 * SMART describes every TD berth step: FROMBERTH → TOBERTH with the STANOX of
 * the location it reports at, and an EVENT code that encodes direction:
 *   A = Arrive Up, B = Depart Up, C = Arrive Down, D = Depart Down
 * (https://wiki.openraildata.com/index.php/SMART)
 *
 * We build a directed graph of berth steps for one direction, then BFS the
 * shortest chain between each consecutive pair of anchor stations (resolved
 * CRS → STANOX via CORPUS). Mileages for intermediate berths are interpolated
 * evenly between the anchors' known mileages — good enough to place trains on
 * the right stretch of curve; refine from route diagrams later if needed.
 *
 * Output:
 *   - an ordered table per direction on stdout
 *   - server/data/mainline-berths.json (machine-readable)
 *   - a ready-to-paste BERTH_MILEAGES snippet for src/data/berthMileages.ts
 *
 * Usage:
 *   npm run berths:mainline              # live (needs NR_USERNAME/PASSWORD in server/.env)
 *   npm run berths:mainline:sample       # offline dry run on the bundled sample
 *   node scripts/extractMainLineBerths.js --direction down --chain EXD,NTA
 *
 * Options:
 *   --sample             use server/data/sample/{smart,corpus}.json (no creds)
 *   --direction down|up|both   (default both)
 *   --area EX            TD area code (default EX)
 *   --chain EXD,EXT,...  override the anchor chain (CRS codes, in down order)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const SAMPLE = join(DATA, "sample");

// ---- CLI ----
const argv = process.argv.slice(2);
const sampleMode = argv.includes("--sample");
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const AREA = opt("area", "EX");
const DIRECTION = opt("direction", "both"); // down | up | both

/**
 * Anchor chain in DOWN order (away from Paddington), with miles·chains on the
 * main-line datum — matches LINE_MILEAGES["newton-abbot"] in src/data/network.ts.
 */
const DEFAULT_CHAIN = [
  { crs: "EXD", miles: 173, chains: 56 }, // Exeter St David's
  { crs: "EXT", miles: 174, chains: 32 }, // Exeter St Thomas
  { crs: "MRB", miles: 175, chains: 8 },  // Marsh Barton
  { crs: "SCS", miles: 181, chains: 40 }, // Starcross
  { crs: "DWW", miles: 184, chains: 24 }, // Dawlish Warren
  { crs: "DWL", miles: 185, chains: 64 }, // Dawlish
  { crs: "TGM", miles: 188, chains: 24 }, // Teignmouth
  { crs: "NTA", miles: 194, chains: 0 },  // Newton Abbot
];
const chainOverride = opt("chain", null);

const dec = (m) => m.miles + m.chains / 80;
const fmtMC = (decimal) => {
  const miles = Math.floor(decimal);
  const chains = Math.round((decimal - miles) * 80);
  return chains === 80 ? `${miles + 1}m 0ch` : `${miles}m ${chains}ch`;
};

// ---- fetch + cache (same conventions as buildBerthCoords.js) ----

function parseMaybeGzipJson(buf) {
  const data = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  return JSON.parse(data.toString("utf8"));
}

async function downloadNrod(type, outPath) {
  const user = process.env.NR_USERNAME;
  const pass = process.env.NR_PASSWORD;
  if (!user || !pass) {
    throw new Error(`Set NR_USERNAME/NR_PASSWORD in server/.env (or use --sample) to download ${type}`);
  }
  if (existsSync(outPath)) {
    const ageH = (Date.now() - statSync(outPath).mtimeMs) / 3.6e6;
    if (ageH < 24) return readFileSync(outPath);
  }
  const url = `https://publicdatafeeds.networkrail.co.uk/ntrod/SupportingFileAuthenticate?type=${type}`;
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  let res = await fetch(url, { headers: { Authorization: auth }, redirect: "manual" });
  let hops = 0;
  while (res.status >= 300 && res.status < 400 && res.headers.get("location") && hops++ < 5) {
    res = await fetch(res.headers.get("location"));
  }
  if (!res.ok) throw new Error(`${type} download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(DATA, { recursive: true });
  writeFileSync(outPath, buf);
  console.log(`[berths] downloaded ${type} (${(buf.length / 1e6).toFixed(1)} MB)`);
  return buf;
}

async function getReference(type, sampleFile) {
  if (sampleMode) return parseMaybeGzipJson(readFileSync(join(SAMPLE, sampleFile)));
  return parseMaybeGzipJson(await downloadNrod(type, join(DATA, `${type}.json`)));
}

// ---- main ----

const smartJson = await getReference("SMART", "smart.json");
const corpusJson = await getReference("CORPUS", "corpus.json");

const smartRows = (smartJson.BERTHDATA || smartJson.SMARTBERTHDATA || smartJson).filter(
  (r) => r.TD === AREA,
);
if (smartRows.length === 0) {
  console.error(`[berths] no SMART rows for TD area "${AREA}"`);
  process.exit(1);
}

// CORPUS: STANOX → CRS and human name.
const corpusRows = corpusJson.TIPLOCDATA || corpusJson;
const stanoxToCrs = new Map();
const stanoxName = new Map();
const crsToStanox = new Map();
for (const r of corpusRows) {
  const stanox = (r.STANOX || "").trim();
  if (!stanox || stanox === "00000") continue;
  const crs = (r["3ALPHA"] || r.CRS || "").trim().toUpperCase();
  if (crs) {
    stanoxToCrs.set(stanox, crs);
    if (!crsToStanox.has(crs)) crsToStanox.set(crs, stanox);
  }
  const name = (r.NLCDESC || "").trim();
  if (name && !stanoxName.has(stanox)) stanoxName.set(stanox, name);
}

// Berth → most-plausible STANOX/platform (arrivals into TOBERTH score highest).
const berthInfo = new Map(); // berth → { stanox, score, platform }
const isReal = (b) => b && !/^0+$/.test(b);
for (const r of smartRows) {
  const stanox = (r.STANOX || "").trim();
  if (!stanox || stanox === "00000") continue;
  const isArrival = r.EVENT === "A" || r.EVENT === "C";
  const platform = (r.PLATFORM || "").trim() || undefined;
  const consider = (berth, score) => {
    if (!isReal(berth)) return;
    const cur = berthInfo.get(berth);
    if (!cur || score > cur.score) berthInfo.set(berth, { stanox, score, platform });
  };
  consider(r.TOBERTH, isArrival ? 2 : 1);
  consider(r.FROMBERTH, 0);
}

// Direction-filtered step graphs. EVENT: A/B = up, C/D = down.
function graphFor(direction) {
  const next = new Map(); // berth → Set(berth)
  for (const r of smartRows) {
    const isDown = r.EVENT === "C" || r.EVENT === "D";
    const isUp = r.EVENT === "A" || r.EVENT === "B";
    if (direction === "down" && !isDown) continue;
    if (direction === "up" && !isUp) continue;
    if (!isReal(r.FROMBERTH) || !isReal(r.TOBERTH)) continue;
    if (!next.has(r.FROMBERTH)) next.set(r.FROMBERTH, new Set());
    next.get(r.FROMBERTH).add(r.TOBERTH);
  }
  return next;
}

/** Shortest berth path (BFS) from any berth at stanox A to any at stanox B. */
function shortestPath(graph, fromStanox, toStanox) {
  const starts = [...berthInfo.entries()]
    .filter(([, v]) => v.stanox === fromStanox)
    .map(([b]) => b);
  const isGoal = (b) => berthInfo.get(b)?.stanox === toStanox;
  const prev = new Map();
  const queue = [...starts];
  const seen = new Set(starts);
  while (queue.length) {
    const cur = queue.shift();
    if (isGoal(cur)) {
      const path = [cur];
      while (prev.has(path[0])) path.unshift(prev.get(path[0]));
      return path;
    }
    for (const nb of graph.get(cur) ?? []) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      prev.set(nb, cur);
      queue.push(nb);
    }
  }
  return null;
}

function extract(direction) {
  // Anchors in travel order for this direction.
  let chain = chainOverride
    ? chainOverride.split(",").map((crs) => {
        const hit = DEFAULT_CHAIN.find((c) => c.crs === crs.trim().toUpperCase());
        return hit ?? { crs: crs.trim().toUpperCase(), miles: 0, chains: 0 };
      })
    : DEFAULT_CHAIN;
  if (direction === "up") chain = [...chain].reverse();

  const graph = graphFor(direction);

  // Only anchor on stations that actually report a berth — otherwise a station
  // with no berth (e.g. Marsh Barton, a new station) breaks the BFS before it
  // can walk the intermediate signal berths. Pathing EXT → Dawlish Warren
  // directly, skipping the berth-less stations, collects the sea-wall berths
  // in between.
  const stanoxHasBerth = new Set([...berthInfo.values()].map((v) => v.stanox));
  const survivors = chain
    .map((a) => ({ ...a, stanox: crsToStanox.get(a.crs) }))
    .filter((a) => a.stanox && stanoxHasBerth.has(a.stanox));
  const dropped = chain
    .filter((a) => {
      const s = crsToStanox.get(a.crs);
      return !s || !stanoxHasBerth.has(s);
    })
    .map((a) => a.crs);
  if (dropped.length) {
    console.log(`[berths] ${direction}: skipped (no berth in area ${AREA}): ${dropped.join(", ")}`);
  }

  const out = []; // { berth, stanox, miles (decimal), location, platform }
  const add = (berth, miles) => {
    if (out.some((o) => o.berth === berth)) return; // global de-dup
    const info = berthInfo.get(berth);
    out.push({
      berth,
      stanox: info?.stanox,
      crs: info ? stanoxToCrs.get(info.stanox) : undefined,
      location: info ? stanoxName.get(info.stanox) : undefined,
      platform: info?.platform,
      miles,
    });
  };
  const berthAt = (stanox) =>
    [...berthInfo.entries()].find(([, v]) => v.stanox === stanox)?.[0];

  for (let i = 0; i < survivors.length - 1; i++) {
    const a = survivors[i];
    const b = survivors[i + 1];
    const mA = dec(a);
    const mB = dec(b);
    const path = shortestPath(graph, a.stanox, b.stanox);
    if (!path) {
      // Keep the station berths even when the in-between chain is missing.
      console.warn(`[berths] ${direction}: no berth path ${a.crs} → ${b.crs} — keeping station berths only`);
      const ab = berthAt(a.stanox);
      const bb = berthAt(b.stanox);
      if (ab) add(ab, mA);
      if (bb) add(bb, mB);
      continue;
    }
    path.forEach((berth, idx) => {
      const f = path.length === 1 ? 0 : idx / (path.length - 1);
      add(berth, mA + (mB - mA) * f);
    });
  }
  return out;
}

const directions = DIRECTION === "both" ? ["down", "up"] : [DIRECTION];
const result = {};
for (const direction of directions) {
  const list = extract(direction);
  result[direction] = list;

  console.log(`\n=== ${AREA} main line — ${direction.toUpperCase()} direction (${list.length} berths) ===`);
  console.log("  #  berth   est. mileage   location");
  list.forEach((r, i) => {
    const loc = r.location ?? "(between stations)";
    const plat = r.platform ? `  plat ${r.platform}` : "";
    console.log(
      `${String(i + 1).padStart(4)}  ${r.berth.padEnd(6)} ${fmtMC(r.miles).padEnd(13)} ${loc}${plat}`,
    );
  });

  if (list.length) {
    // Down = increasing mileage = increasing t on the "newton-abbot" line → dir 1.
    const dirVal = direction === "down" ? 1 : -1;
    console.log(`\n--- paste into BERTH_MILEAGES (src/data/berthMileages.ts) — ${direction} ---`);
    for (const r of list) {
      const miles = Math.floor(r.miles);
      const chains = Math.round((r.miles - miles) * 80);
      const loc = r.location ? ` // ${r.location}${r.platform ? ` P${r.platform}` : ""}` : "";
      console.log(
        `  "${AREA}:${r.berth}": { line: "newton-abbot", miles: ${miles}, chains: ${chains}, dir: ${dirVal} },${loc}`,
      );
    }
  }
}

mkdirSync(DATA, { recursive: true });
const outPath = join(DATA, "mainline-berths.json");
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\n[berths] written ${outPath}`);
