/**
 * Build the WHOLE Exeter-panel berth → mileage/direction table.
 *
 * Goal: get most of the live feed onto the map (coverage) AND on the right
 * rail (direction), in one pass. For every TD berth in area EX, SMART gives the
 * STANOX it reports at and the event code (A/B up, C/D down); CORPUS turns the
 * STANOX into a CRS. If that CRS is one of our network stations we emit the
 * berth at that station's mileage, with its direction.
 *
 * Output: src/data/berthMileages.generated.json — merged UNDER the hand-curated
 * BERTH_MILEAGES (which always wins), so this is purely additive coverage.
 *
 * Usage:
 *   npm run berths:all            # live (needs NR_USERNAME/PASSWORD in server/.env)
 *   npm run berths:all:sample     # offline dry run on the bundled sample
 *
 * Direction is included only when the berth's event codes are unambiguous;
 * otherwise it's omitted and the live feed infers it from movement.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const SAMPLE = join(DATA, "sample");
const OUT = join(DIR, "..", "..", "src", "data", "berthMileages.generated.json");

const sampleMode = process.argv.includes("--sample");
const AREA = "EX";

// Our network stations → the line + mileage we position them at. Shared
// Exeter→Newton Abbot trunk stations use the main "newton-abbot" line; branches
// use their own. Mileages match LINE_MILEAGES in src/data/network.ts.
// `fwd` = does increasing mileage mean increasing t on that line? (false for the
// Taunton line, whose mileage falls toward Taunton).
const STATION = {
  // Main line (newton-abbot), trunk + on to Plymouth
  EXD: { line: "newton-abbot", miles: 173, chains: 56 },
  EXT: { line: "newton-abbot", miles: 174, chains: 32 },
  SCS: { line: "newton-abbot", miles: 181, chains: 40 },
  DWW: { line: "newton-abbot", miles: 184, chains: 24 },
  DWL: { line: "newton-abbot", miles: 185, chains: 64 },
  TGM: { line: "newton-abbot", miles: 188, chains: 24 },
  NTA: { line: "newton-abbot", miles: 194, chains: 0 },
  TOT: { line: "newton-abbot", miles: 202, chains: 48 },
  IVY: { line: "newton-abbot", miles: 215, chains: 0 },
  PLY: { line: "newton-abbot", miles: 225, chains: 56 },
  // Avocet line (exmouth)
  EXC: { line: "exmouth", miles: 0, chains: 44 },
  SJP: { line: "exmouth", miles: 1, chains: 24 },
  POL: { line: "exmouth", miles: 1, chains: 72 },
  DIG: { line: "exmouth", miles: 3, chains: 64 },
  NCO: { line: "exmouth", miles: 4, chains: 32 },
  TOP: { line: "exmouth", miles: 5, chains: 24 },
  EXN: { line: "exmouth", miles: 6, chains: 64 },
  LYC: { line: "exmouth", miles: 7, chains: 48 },
  LYM: { line: "exmouth", miles: 8, chains: 32 },
  EXM: { line: "exmouth", miles: 10, chains: 20 },
  // Torbay branch (paignton)
  TRR: { line: "paignton", miles: 197, chains: 48 },
  TQY: { line: "paignton", miles: 198, chains: 48 },
  PGN: { line: "paignton", miles: 200, chains: 8 },
  // Main line NE (taunton) — mileage falls toward Taunton
  TVP: { line: "taunton", miles: 159, chains: 16 },
  TAU: { line: "taunton", miles: 143, chains: 0 },
};
// On these lines increasing mileage = increasing t (down/away from Exeter); the
// Taunton line runs the other way.
const FORWARD_IS_DOWN = { "newton-abbot": true, exmouth: true, paignton: true, taunton: false };

// ---- fetch + cache (same conventions as the other scripts) ----
function parseMaybeGzipJson(buf) {
  const data = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  return JSON.parse(data.toString("utf8"));
}
async function downloadNrod(type, outPath) {
  const user = process.env.NR_USERNAME;
  const pass = process.env.NR_PASSWORD;
  if (!user || !pass) throw new Error(`Set NR_USERNAME/NR_PASSWORD in server/.env (or use --sample) to download ${type}`);
  if (existsSync(outPath) && (Date.now() - statSync(outPath).mtimeMs) / 3.6e6 < 24) return readFileSync(outPath);
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
async function getRef(type, sampleFile) {
  if (sampleMode) return parseMaybeGzipJson(readFileSync(join(SAMPLE, sampleFile)));
  return parseMaybeGzipJson(await downloadNrod(type, join(DATA, `${type}.json`)));
}

// ---- main ----
const smartJson = await getRef("SMART", "smart.json");
const corpusJson = await getRef("CORPUS", "corpus.json");
const smartRows = (smartJson.BERTHDATA || smartJson.SMARTBERTHDATA || smartJson).filter((r) => r.TD === AREA);

// STANOX → CRS
const stanoxToCrs = new Map();
for (const r of corpusJson.TIPLOCDATA || corpusJson) {
  const stanox = (r.STANOX || "").trim();
  const crs = (r["3ALPHA"] || r.CRS || "").trim().toUpperCase();
  if (stanox && stanox !== "00000" && crs) stanoxToCrs.set(stanox, crs);
}

const isReal = (b) => b && !/^0+$/.test(b);

// Best STANOX + platform per berth (arrivals into TOBERTH score highest).
const berthInfo = new Map();
// Direction votes per berth from event codes into it.
const votes = new Map();
for (const r of smartRows) {
  const stanox = (r.STANOX || "").trim();
  if (!stanox || stanox === "00000") continue;
  const platform = (r.PLATFORM || "").trim() || undefined;
  const isArr = r.EVENT === "A" || r.EVENT === "C";
  const consider = (berth, score) => {
    if (!isReal(berth)) return;
    const cur = berthInfo.get(berth);
    if (!cur || score > cur.score) berthInfo.set(berth, { stanox, score, platform });
  };
  consider(r.TOBERTH, isArr ? 2 : 1);
  consider(r.FROMBERTH, 0);
  if (isReal(r.TOBERTH)) {
    const v = votes.get(r.TOBERTH) ?? { down: 0, up: 0 };
    if (r.EVENT === "C" || r.EVENT === "D") v.down++;
    else if (r.EVENT === "A" || r.EVENT === "B") v.up++;
    votes.set(r.TOBERTH, v);
  }
}

const out = {};
let mapped = 0;
const byStation = {};
const leftover = new Map(); // resolved CRS we don't (yet) map → berth count
for (const [berth, info] of berthInfo) {
  const crs = stanoxToCrs.get(info.stanox);
  const st = crs && STATION[crs];
  if (!st) {
    if (crs) leftover.set(crs, (leftover.get(crs) || 0) + 1);
    continue; // not one of our network stations — skip
  }
  let dir;
  const v = votes.get(berth);
  if (v && v.down !== v.up) {
    const eventDown = v.down > v.up;
    dir = eventDown === FORWARD_IS_DOWN[st.line] ? 1 : -1;
  }
  out[`${AREA}:${berth}`] = { line: st.line, miles: st.miles, chains: st.chains, ...(dir ? { dir } : {}) };
  mapped++;
  byStation[crs] = (byStation[crs] || 0) + 1;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`[berths] mapped ${mapped} berths across ${Object.keys(byStation).length} stations → ${OUT}`);
console.log("[berths] per station:", Object.entries(byStation).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join("  "));
// Audit: EX-area berths that resolved to a real CRS we don't map. These are the
// candidates worth adding to STATION (Marsh Barton, etc.) — sorted by berth count.
const leftoverList = Object.entries(Object.fromEntries(leftover)).sort((a, b) => b[1] - a[1]);
console.log(`[berths] unmapped CRS (${leftoverList.length}):`, leftoverList.map(([c, n]) => `${c}:${n}`).join("  ") || "(none)");
