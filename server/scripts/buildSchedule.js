/**
 * Build `headcode → [{ operator, destination, dep }]` from the Network Rail
 * SCHEDULE (CIF) feed, scoped to trains that call at one of our stations today.
 *
 * The TD feed gives a headcode but never the operator or destination. The daily
 * CIF schedule carries `atoc_code` + the full calling pattern, so we can attach
 * both — from the SAME Network Rail account as the berths, no third-party API.
 *
 * This is the verification pass (like `berths:all`): it writes a table and
 * prints a summary so we can confirm coverage before the live server uses it.
 *
 * Usage:
 *   npm run schedule          # live (needs NR_USERNAME/PASSWORD in server/.env)
 *   npm run schedule:sample   # offline dry run on data/sample/schedule.json.gz
 *
 * Output: data/headcodeSchedule.generated.json
 *   { "2T10": [{ toc: "GW", dest: "Paignton", dep: "0912" }], ... }
 * A headcode can have several workings in a day; the live server picks the one
 * whose timing is active now.
 */
import {
  createWriteStream,
  createReadStream,
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip, gunzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const SAMPLE = join(DATA, "sample");
const OUT = join(DATA, "headcodeSchedule.generated.json");
const sampleMode = process.argv.includes("--sample");

// Our network stations (CRS). A schedule that doesn't touch one of these is
// irrelevant to the map, so we drop it while parsing.
const NETWORK_CRS = new Set(
  "EXD EXT MRB SCS DWW DWL TGM NTA TOT IVY PLY EXC SJP POL DIG NCO TOP EXN LYC LYM EXM TRR TQY PGN TVP TAU".split(" "),
);

// ---- "runs today?" ----
const today = new Date();
const isoToday = today.toISOString().slice(0, 10);
const dowIndex = (today.getDay() + 6) % 7; // CIF days are Mon..Sun; JS Sun=0

function runsToday(s) {
  if (s.schedule_start_date && s.schedule_start_date > isoToday) return false;
  if (s.schedule_end_date && s.schedule_end_date < isoToday) return false;
  const days = s.schedule_days_runs || "";
  if (days.length === 7 && days[dowIndex] !== "1") return false;
  return true;
}

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ---- CORPUS: tiploc → CRS + name (reuses the cache the berths downloaded) ----
function loadCorpus() {
  const path = sampleMode ? join(SAMPLE, "corpus.json") : join(DATA, "corpus.json");
  if (!existsSync(path)) {
    throw new Error(`Need ${path} — run \`npm run berths:all\` first (it downloads CORPUS).`);
  }
  const buf = readFileSync(path);
  const text = (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString("utf8");
  const json = JSON.parse(text);
  const tiplocToCrs = new Map();
  const tiplocToName = new Map();
  for (const r of json.TIPLOCDATA || json) {
    const tiploc = (r.TIPLOC || "").trim();
    if (!tiploc) continue;
    const crs = (r["3ALPHA"] || "").trim().toUpperCase();
    const name = (r.NLCDESC || "").trim();
    if (crs) tiplocToCrs.set(tiploc, crs);
    if (name) tiplocToName.set(tiploc, titleCase(name));
  }
  return { tiplocToCrs, tiplocToName };
}

// ---- schedule download (streaming, cached 12h, memory-safe) ----
function isGzip(path) {
  const fd = openSync(path, "r");
  const b = Buffer.alloc(2);
  readSync(fd, b, 0, 2, 0);
  closeSync(fd);
  return b[0] === 0x1f && b[1] === 0x8b;
}

async function scheduleLineStream() {
  const cache = sampleMode ? join(SAMPLE, "schedule.json.gz") : join(DATA, "schedule.json.gz");
  if (!sampleMode) {
    const fresh = existsSync(cache) && (Date.now() - statSync(cache).mtimeMs) / 3.6e6 < 12;
    if (!fresh) {
      const user = process.env.NR_USERNAME;
      const pass = process.env.NR_PASSWORD;
      if (!user || !pass) throw new Error("Set NR_USERNAME/NR_PASSWORD in server/.env (or use --sample).");
      const url =
        "https://publicdatafeeds.networkrail.co.uk/ntrod/CifFileAuthenticate?type=CIF_ALL_FULL_DAILY&day=toc-full";
      const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
      let res = await fetch(url, { headers: { Authorization: auth }, redirect: "manual" });
      let hops = 0;
      while (res.status >= 300 && res.status < 400 && res.headers.get("location") && hops++ < 5) {
        res = await fetch(res.headers.get("location"));
      }
      if (!res.ok || !res.body) throw new Error(`SCHEDULE download failed: HTTP ${res.status}`);
      mkdirSync(DATA, { recursive: true });
      await pipeline(Readable.fromWeb(res.body), createWriteStream(cache));
      console.log(`[schedule] downloaded CIF (${(statSync(cache).size / 1e6).toFixed(1)} MB)`);
    }
  }
  if (!existsSync(cache)) throw new Error(`No schedule file at ${cache}`);
  const input = isGzip(cache) ? createReadStream(cache).pipe(createGunzip()) : createReadStream(cache);
  return createInterface({ input, crlfDelay: Infinity });
}

// ---- main ----
const { tiplocToCrs, tiplocToName } = loadCorpus();
const rl = await scheduleLineStream();

const byHeadcode = new Map(); // headcode → [{ toc, dest, dep }]
let scanned = 0;
let kept = 0;

for await (const line of rl) {
  if (!line) continue;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }
  const s = obj.JsonScheduleV1;
  if (!s) continue;
  scanned++;
  if (s.transaction_type === "Delete") continue;
  if (s.CIF_stp_indicator === "C") continue; // short-term cancellation — skip for v1
  if (!runsToday(s)) continue;

  const seg = s.schedule_segment || {};
  const headcode = (seg.signalling_id || "").trim();
  if (!headcode) continue;

  const locs = seg.schedule_location || [];
  if (!locs.length) continue;

  let onPatch = false;
  for (const l of locs) {
    const crs = tiplocToCrs.get((l.tiploc_code || "").trim());
    if (crs && NETWORK_CRS.has(crs)) {
      onPatch = true;
      break;
    }
  }
  if (!onPatch) continue;

  const toc = (s.atoc_code || seg.atoc_code || "").trim().toUpperCase();
  const last = locs[locs.length - 1] || {};
  const destTiploc = (last.tiploc_code || "").trim();
  const dest = tiplocToName.get(destTiploc) || destTiploc;
  const origin = locs[0] || {};
  const dep = (origin.public_departure || origin.departure || "").trim();

  const list = byHeadcode.get(headcode) || [];
  list.push({ toc, dest, dep });
  byHeadcode.set(headcode, list);
  kept++;
}

// ---- write + summary ----
const out = {};
for (const [hc, list] of byHeadcode) out[hc] = list;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out) + "\n");

const tocCount = {};
for (const list of byHeadcode.values()) {
  for (const e of list) tocCount[e.toc || "?"] = (tocCount[e.toc || "?"] || 0) + 1;
}
console.log(
  `[schedule] ${scanned} schedules scanned · ${kept} on-patch workings today · ${byHeadcode.size} distinct headcodes → ${OUT}`,
);
console.log(
  "[schedule] operators:",
  Object.entries(tocCount)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}:${n}`)
    .join("  ") || "(none)",
);
