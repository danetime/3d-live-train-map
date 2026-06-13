/**
 * Manual berth → mileage table: the precise-positioning data we transcribe by
 * hand from Network Rail route diagrams (in miles & chains), berth by berth.
 *
 * This is the *most* precise source we have. When a berth has a mileage here we
 * place the train at the exact point along the line (gliding between stations)
 * instead of snapping it to its reporting location. Berths without an entry
 * fall back to the existing behaviour (exact station coordinate, then the demo
 * map) — so adding rows here only ever improves things.
 *
 * Format — key is `${AREA}:${BERTH}` (the TD signalling area + 4-digit berth):
 *
 *   "EX:0187": { line: "newton-abbot", miles: 187, chains: 0 },
 *
 *   line   — one of the line ids in network.ts:
 *            "exmouth" | "newton-abbot" | "paignton" | "taunton"
 *   miles  — whole miles from that line's datum (main line = from Paddington)
 *   chains — 0..79 (80 chains = 1 mile)
 *
 * The two entries below are illustrative seeds so the engine is visibly
 * exercised in live mode — replace/extend them with real berth mileages off the
 * diagrams. (Replay mode demonstrates the same engine via the demo berths.)
 */
import { mileageToT, milesChains } from "./lineCurves";
import type { BerthPos } from "./berths";
import generatedBerths from "./berthMileages.generated.json";

/** `dir`: travel direction this berth serves, where known (SMART splits berth
 *  steps into down/up): 1 = increasing t along the line, -1 = decreasing. On
 *  "newton-abbot" (mileage rises toward Plymouth) down = 1, up = -1. Generated
 *  rows from server/scripts/extractMainLineBerths.js include it.
 *  `crs`/`platform`: the station + platform a train in this berth is standing
 *  at, where known (hand rows from the signal roster; generated rows from
 *  SMART's PLATFORM field) — drives the in-world platform placement. */
export type BerthMileage = {
  line: string;
  miles: number;
  chains: number;
  dir?: 1 | -1;
  crs?: string;
  platform?: string;
};

export const BERTH_MILEAGES: Record<string, BerthMileage> = {
  // --- Real Exeter-panel (TD area EX) main-line berths, from Network Rail
  //     SMART via server/scripts/extractMainLineBerths.js, direction verified
  //     from each berth's own event codes (A/B up, C/D down).
  //     dir 1 = down (toward Plymouth), dir -1 = up (toward Exeter). This panel
  //     reports berths only at the stations on the open line, so a train keeps
  //     its rail while it eases between them.
  // DOWN — Exeter → Teignmouth
  // Exeter St David's platform berths: each platform's TD berth is named after
  // its starting signal (down starters E160/E260/E60/E360/E460 per the §6
  // signal roster), so the berth pins the train to a specific platform.
  "EX:E160": { line: "newton-abbot", miles: 173, chains: 56, dir: 1, crs: "EXD", platform: "1" },
  "EX:E260": { line: "newton-abbot", miles: 173, chains: 56, dir: 1, crs: "EXD", platform: "3" },
  "EX:E060": { line: "newton-abbot", miles: 173, chains: 56, dir: 1, crs: "EXD", platform: "4" }, // (id E60/E060?)
  "EX:E360": { line: "newton-abbot", miles: 173, chains: 56, dir: 1, crs: "EXD", platform: "5" },
  "EX:E460": { line: "newton-abbot", miles: 173, chains: 56, dir: 1, crs: "EXD", platform: "6" },
  "EX:E062": { line: "newton-abbot", miles: 174, chains: 32, dir: 1 }, // Exeter St Thomas P1
  "EX:E072": { line: "newton-abbot", miles: 184, chains: 24, dir: 1 }, // Dawlish Warren P1
  "EX:D206": { line: "newton-abbot", miles: 185, chains: 64, dir: 1 }, // Dawlish P1
  "EX:E276": { line: "newton-abbot", miles: 185, chains: 64, dir: 1 }, // Dawlish P2 (down move)
  "EX:E278": { line: "newton-abbot", miles: 188, chains: 24, dir: 1 }, // Teignmouth P1
  // UP — Newton Abbot → Exeter
  "EX:E011": { line: "newton-abbot", miles: 194, chains: 0, dir: -1 },  // Newton Abbot P3
  "EX:U208": { line: "newton-abbot", miles: 188, chains: 24, dir: -1 }, // Teignmouth P2
  "EX:E017": { line: "newton-abbot", miles: 185, chains: 64, dir: -1 }, // Dawlish P2
  "EX:E025": { line: "newton-abbot", miles: 184, chains: 24, dir: -1 }, // Dawlish Warren P2
  "EX:U202": { line: "newton-abbot", miles: 181, chains: 40, dir: -1 }, // Starcross P2
  "EX:E035": { line: "newton-abbot", miles: 174, chains: 32, dir: -1 }, // Exeter St Thomas P2
  // Exeter St David's up-direction platform berths (up starters per the §6
  // signal roster: E137 P6 · E37 P5 · E237 P4 · E337 P3 · E437 P1 · E537 P2 bay).
  "EX:E137": { line: "newton-abbot", miles: 173, chains: 56, dir: -1, crs: "EXD", platform: "6" },
  "EX:E037": { line: "newton-abbot", miles: 173, chains: 56, dir: -1, crs: "EXD", platform: "5" },
  "EX:E237": { line: "newton-abbot", miles: 173, chains: 56, dir: -1, crs: "EXD", platform: "4" },
  "EX:E337": { line: "newton-abbot", miles: 173, chains: 56, dir: -1, crs: "EXD", platform: "3" },
  "EX:E437": { line: "newton-abbot", miles: 173, chains: 56, dir: -1, crs: "EXD", platform: "1" },
  "EX:E537": { line: "newton-abbot", miles: 173, chains: 56, dir: -1, crs: "EXD", platform: "2" },
};

/**
 * Auto-generated berth → mileage/direction for the whole Exeter panel
 * (server/scripts/buildAllBerths.js, from SMART + CORPUS). Merged UNDER the
 * hand-curated table so verified rows always win; this only adds coverage.
 */
const GENERATED = generatedBerths as Record<string, BerthMileage>;
const ALL_BERTHS: Record<string, BerthMileage> = { ...GENERATED, ...BERTH_MILEAGES };

/** Precise spline position for a berth with a known mileage, else null. */
export function berthMileagePosition(area: string, berth: string): BerthPos | null {
  const m = ALL_BERTHS[`${area}:${berth}`];
  if (!m) return null;
  return {
    lineId: m.line,
    t: mileageToT(m.line, milesChains(m.miles, m.chains)),
    dir: m.dir,
    crs: m.crs,
    platform: m.platform,
  };
}
