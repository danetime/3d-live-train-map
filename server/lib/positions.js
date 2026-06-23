/**
 * Resolve a TD berth to a position on the network, so the server can hand
 * clients a render-ready location instead of a raw berth code. Reads the same
 * berth→mileage table the web client uses (src/data/berthMileages.generated.json,
 * built by scripts/buildAllBerths.js), which maps each Exeter-panel berth to a
 * line, mileage, direction, station (CRS) and platform.
 *
 * Clients then just draw — no berth/mileage tables needed app-side. (Demo/replay
 * berths aren't in this table, so they resolve to null; run live for positions.)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const TABLE_PATH = join(DIR, "..", "..", "src", "data", "berthMileages.generated.json");

let table = {};
try {
  table = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
  console.log(`[pos] loaded ${Object.keys(table).length} berth positions`);
} catch (e) {
  console.warn(`[pos] no berth position table (${e.message}) — trains will have no pos`);
}

/**
 * @returns {{line:string, station:string, miles:number, dir?:1|-1, platform?:string}|null}
 */
export function berthPosition(area, berth) {
  const m = table[`${area}:${berth}`];
  if (!m) return null;
  return {
    line: m.line,
    station: m.crs,
    miles: m.miles + (m.chains || 0) / 80,
    ...(m.dir ? { dir: m.dir } : {}),
    ...(m.platform ? { platform: m.platform } : {}),
  };
}
