/**
 * Maps Train Describer berths to a position on our network.
 *
 * Network Rail's TD feed reports which *berth* a train is in, but there is no
 * open dataset of berth coordinates — so (exactly like Traksy / OpenTrainTimes)
 * we hand-map each berth onto a line. A berth's position is given as a line id
 * plus `t` (0..1 along that line's spline).
 *
 * Two sources of berths:
 *  1. DEMO berths — generated to match the server's replay mode, so the whole
 *     pipeline works with no credentials.
 *  2. REAL berths — added to REAL_BERTHS once discovered from the live feed
 *     (run the server with CAPTURE=1, then map the IDs from
 *     server/data/observed-berths.json onto lines here).
 */
import { LINES } from "./network";

export type BerthPos = { lineId: string; t: number };

const berths = new Map<string, BerthPos>();
const key = (area: string, berth: string) => `${area}:${berth}`;

// --- 1. DEMO berths (must match server/lib/replay.js) ---
const DEMO_PREFIX: Record<string, string> = {
  exmouth: "EXM",
  "newton-abbot": "NAB",
  taunton: "TAU",
  barnstaple: "BNP",
  okehampton: "OKE",
};
const DEMO_K = 10;
for (const line of LINES) {
  const prefix = DEMO_PREFIX[line.id];
  if (!prefix) continue;
  for (let i = 0; i < DEMO_K; i++) {
    const id = `${prefix}${String(i + 1).padStart(2, "0")}`;
    berths.set(key("DEMO", id), { lineId: line.id, t: i / (DEMO_K - 1) });
  }
}

// --- 2. REAL berths (fill in from captured live data) ---
// Example once you know the IDs (area "SW" is the South West signalling area):
//   ["SW:0123", { lineId: "newton-abbot", t: 0.12 }],
const REAL_BERTHS: [string, BerthPos][] = [
  // [key("SW", "XXXX"), { lineId: "...", t: 0.0 }],
];
for (const [k, pos] of REAL_BERTHS) berths.set(k, pos);

/** Look up a berth's position, or null if we haven't mapped it yet. */
export function berthPosition(area: string, berth: string): BerthPos | null {
  return berths.get(key(area, berth)) ?? null;
}
