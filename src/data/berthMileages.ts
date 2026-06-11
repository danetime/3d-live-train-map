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

/** `dir`: travel direction this berth serves, where known (SMART splits berth
 *  steps into down/up): 1 = increasing t along the line, -1 = decreasing. On
 *  "newton-abbot" (mileage rises toward Plymouth) down = 1, up = -1. Generated
 *  rows from server/scripts/extractMainLineBerths.js include it. */
export type BerthMileage = { line: string; miles: number; chains: number; dir?: 1 | -1 };

export const BERTH_MILEAGES: Record<string, BerthMileage> = {
  // --- Real Exeter-panel main-line berths, extracted from Network Rail SMART
  //     (server/scripts/extractMainLineBerths.js). dir 1 = down (toward
  //     Plymouth), dir -1 = up (toward Exeter/Paddington). Station-platform
  //     berths so far; intermediate sea-wall berths to follow on re-run.
  // DOWN
  "EX:E360": { line: "newton-abbot", miles: 173, chains: 56, dir: 1 }, // Exeter St David's P5
  "EX:E062": { line: "newton-abbot", miles: 174, chains: 32, dir: 1 }, // Exeter St Thomas P1
  "EX:E072": { line: "newton-abbot", miles: 184, chains: 24, dir: 1 }, // Dawlish Warren P1
  "EX:D206": { line: "newton-abbot", miles: 185, chains: 64, dir: 1 }, // Dawlish P1
  "EX:E276": { line: "newton-abbot", miles: 185, chains: 64, dir: 1 }, // Dawlish P2
  "EX:E278": { line: "newton-abbot", miles: 188, chains: 24, dir: 1 }, // Teignmouth P1
  // UP
  "EX:E025": { line: "newton-abbot", miles: 184, chains: 24, dir: -1 }, // Dawlish Warren P2
  "EX:U202": { line: "newton-abbot", miles: 181, chains: 40, dir: -1 }, // Starcross P2
  "EX:E035": { line: "newton-abbot", miles: 174, chains: 32, dir: -1 }, // Exeter St Thomas P2
  "EX:E137": { line: "newton-abbot", miles: 173, chains: 56, dir: -1 }, // Exeter St David's P6
};

/** Precise spline position for a berth with a known mileage, else null. */
export function berthMileagePosition(area: string, berth: string): BerthPos | null {
  const m = BERTH_MILEAGES[`${area}:${berth}`];
  if (!m) return null;
  return { lineId: m.line, t: mileageToT(m.line, milesChains(m.miles, m.chains)), dir: m.dir };
}
