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

export type BerthMileage = { line: string; miles: number; chains: number };

export const BERTH_MILEAGES: Record<string, BerthMileage> = {
  // Out on the Dawlish sea wall, between Dawlish (185m 64ch) and Teignmouth
  // (188m 24ch) — clearly mid-section, not on a station.
  "EX:0187": { line: "newton-abbot", miles: 187, chains: 0 },
  // Rounding the Teign estuary on the approach to Newton Abbot (194m 0ch).
  "EX:0192": { line: "newton-abbot", miles: 192, chains: 40 },
};

/** Precise spline position for a berth with a known mileage, else null. */
export function berthMileagePosition(area: string, berth: string): BerthPos | null {
  const m = BERTH_MILEAGES[`${area}:${berth}`];
  if (!m) return null;
  return { lineId: m.line, t: mileageToT(m.line, milesChains(m.miles, m.chains)) };
}
