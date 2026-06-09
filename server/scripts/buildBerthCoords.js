/**
 * Build berth coordinates from Network Rail open data.
 *
 * Network Rail doesn't publish berth lat/long directly, but three reference
 * files chain together to produce them:
 *
 *   SMART   berth (TD area + berth) → STANOX location
 *   CORPUS  STANOX ↔ TIPLOC ↔ CRS
 *   coords  STANOX / TIPLOC → easting/northing or lat/long   (BPLAN/TPS, or an
 *           open community table placed at server/data/locations.csv)
 *
 * The result is written to src/data/berthCoordinates.json, which the client
 * loads into BERTH_COORDS — trains then render at their real positions.
 *
 * Usage:
 *   node scripts/buildBerthCoords.js --sample     # offline dry run (no creds)
 *   npm run build:coords                          # live (needs NR_USERNAME/PASSWORD)
 *
 * Optional: TD_AREAS="EX,SW" restricts output to those TD area codes.
 *
 * Docs: https://wiki.openraildata.com/index.php/SMART  ·  /index.php/ReferenceData
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { osGridToLatLng } from "../../shared/osgb.js";

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, "..", "..");
const DATA = join(DIR, "..", "data");
const SAMPLE = join(DATA, "sample");

const sampleMode = process.argv.includes("--sample");
const areaFilter = (process.env.TD_AREAS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const CACHE_MAX_AGE_H = 24;

// ---- fetch + cache Network Rail reference files ----

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
    if (ageH < CACHE_MAX_AGE_H) return readFileSync(outPath);
  }
  const url = `https://publicdatafeeds.networkrail.co.uk/ntrod/SupportingFileAuthenticate?type=${type}`;
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  // Follow redirects manually so the Basic auth header isn't resent to S3.
  let res = await fetch(url, { headers: { Authorization: auth }, redirect: "manual" });
  let hops = 0;
  while (res.status >= 300 && res.status < 400 && res.headers.get("location") && hops++ < 5) {
    res = await fetch(res.headers.get("location"));
  }
  if (!res.ok) throw new Error(`${type} download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(DATA, { recursive: true });
  writeFileSync(outPath, buf);
  console.log(`[coords] downloaded ${type} (${(buf.length / 1e6).toFixed(1)} MB)`);
  return buf;
}

async function getReference(type, sampleFile) {
  if (sampleMode) return parseMaybeGzipJson(readFileSync(join(SAMPLE, sampleFile)));
  return parseMaybeGzipJson(await downloadNrod(type, join(DATA, `${type}.json`)));
}

// ---- parsers ----

function parseSmart(json) {
  const rows = json.BERTHDATA || json.SMARTBERTHDATA || (Array.isArray(json) ? json : []);
  const berthStanox = new Map(); // "area|berth" → { stanox, score }
  for (const r of rows) {
    const area = r.TD;
    const stanox = (r.STANOX || "").trim();
    if (!area || !stanox || stanox === "00000") continue;
    const isArrival = r.EVENT === "A" || r.EVENT === "C";
    const consider = (berth, score) => {
      if (!berth || /^0+$/.test(berth)) return;
      const key = `${area}|${berth}`;
      const cur = berthStanox.get(key);
      if (!cur || score > cur.score) berthStanox.set(key, { stanox, score });
    };
    // Arrivals into TOBERTH are the strongest position signal for a berth.
    consider(r.TOBERTH, isArrival ? 2 : 1);
    consider(r.FROMBERTH, 0);
  }
  return berthStanox;
}

function parseCorpus(json) {
  const rows = json.TIPLOCDATA || (Array.isArray(json) ? json : []);
  const stanoxToTiploc = new Map();
  for (const r of rows) {
    const stanox = (r.STANOX || "").trim();
    const tiploc = (r.TIPLOC || "").trim();
    if (stanox && stanox !== "00000" && tiploc) stanoxToTiploc.set(stanox, tiploc.toUpperCase());
  }
  return stanoxToTiploc;
}

function parseLocations(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim().toUpperCase());
  const col = (...names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iStanox = col("STANOX");
  const iTiploc = col("TIPLOC");
  const iLat = col("LAT", "LATITUDE");
  const iLon = col("LON", "LONG", "LONGITUDE");
  const iE = col("EASTING", "EASTINGS");
  const iN = col("NORTHING", "NORTHINGS");

  const byStanox = new Map();
  const byTiploc = new Map();
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < 2) continue;
    let ll = null;
    const lat = iLat >= 0 ? parseFloat(c[iLat]) : NaN;
    const lon = iLon >= 0 ? parseFloat(c[iLon]) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      ll = { lat, lng: lon };
    } else {
      const e = iE >= 0 ? parseFloat(c[iE]) : NaN;
      const n = iN >= 0 ? parseFloat(c[iN]) : NaN;
      if (Number.isFinite(e) && Number.isFinite(n)) ll = osGridToLatLng(e, n);
    }
    if (!ll) continue;
    if (iStanox >= 0 && c[iStanox]?.trim()) byStanox.set(c[iStanox].trim(), ll);
    if (iTiploc >= 0 && c[iTiploc]?.trim()) byTiploc.set(c[iTiploc].trim().toUpperCase(), ll);
  }
  return { byStanox, byTiploc };
}

// ---- main ----

async function main() {
  const smart = parseSmart(await getReference("SMART", "smart.json"));

  let corpus = new Map();
  try {
    corpus = parseCorpus(await getReference("CORPUS", "corpus.json"));
  } catch (e) {
    console.warn(`[coords] CORPUS unavailable (${e.message}); STANOX→TIPLOC join disabled`);
  }

  const locPath = sampleMode ? join(SAMPLE, "locations.csv") : join(DATA, "locations.csv");
  if (!existsSync(locPath)) {
    throw new Error(
      `Missing coordinate table at ${locPath}.\n` +
        "Provide a CSV with columns STANOX/TIPLOC and LAT/LON (or EASTING/NORTHING) —\n" +
        "from BPLAN/TPS geography or an open community dataset. See server/README.md.",
    );
  }
  const { byStanox, byTiploc } = parseLocations(readFileSync(locPath, "utf8"));

  const out = [];
  let unresolved = 0;
  for (const [key, { stanox }] of smart) {
    const [area, berth] = key.split("|");
    if (areaFilter.length && !areaFilter.includes(area)) continue;
    let ll = byStanox.get(stanox);
    if (!ll) {
      const tiploc = corpus.get(stanox);
      if (tiploc) ll = byTiploc.get(tiploc);
    }
    if (!ll) {
      unresolved++;
      continue;
    }
    out.push({ area, berth, lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) });
  }
  out.sort((a, b) => (a.area + a.berth).localeCompare(b.area + b.berth));

  const outPath = sampleMode
    ? join(SAMPLE, "output.berthCoordinates.json")
    : join(ROOT, "src", "data", "berthCoordinates.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

  console.log(
    `[coords] berths with a STANOX: ${smart.size}  ·  resolved to coordinates: ${out.length}  ·  unresolved: ${unresolved}`,
  );
  for (const r of out.slice(0, 10)) console.log(`  ${r.area}:${r.berth} → ${r.lat}, ${r.lng}`);
  console.log(`[coords] wrote ${outPath}`);
}

main().catch((e) => {
  console.error("[coords]", e.message);
  process.exit(1);
});
