/**
 * REAL signal numbers, transcribed from the GWR sectional route diagrams
 * ("Taunton (ECXL) – Plymouth", drawings 12-11 .. 12-13). These are genuine
 * Exeter PSB signal numbers (the E-prefix is the Exeter panel).
 *
 * Positions come from the diagrams' mileages (miles + chains on the
 * Paddington-via-Bristol datum; Exeter St David's = 193m 72c), converted to
 * km-from-Exeter: 1 mile = 1.6093 km, 1 chain = 20.12 m. The diagrams are
 * schematic ("NOT TO SCALE") but the mileposts anchor each signal's true
 * position along the route.
 *
 * Direction conventions differ: on the railway, "Down" = towards Penzance.
 * On the Taunton line that means towards Exeter; on the Plymouth line it
 * means away from Exeter. `dir` below uses the app convention:
 * +1 = away from Exeter, -1 = towards Exeter.
 *
 * Coverage so far: the Exeter end of both main lines. Extend by transcribing
 * further pages of the PDF (and the Barnstaple/Exmouth/Okehampton section
 * 24-20 when available); synthetic signals fill the gaps beyond coverage.
 */
import { lineCurve } from "./lineCurves";

export type RealSignal = {
  /** Real signal number, e.g. "E660". */
  id: string;
  /** Distance from Exeter St David's along the route, in km (from mileages). */
  km: number;
  /** +1 = away from Exeter, -1 = towards Exeter. */
  dir: 1 | -1;
};

export const REAL_SIGNALS: Record<string, RealSignal[]> = {
  taunton: [
    // Cowley Bridge Junction area (drawing 12-11, ~192m 48c .. 193m 30c).
    { id: "E54", km: 2.09, dir: -1 }, // Down Main (towards Exeter)
    { id: "E56", km: 1.25, dir: -1 }, // Down Main
    { id: "E660", km: 2.09, dir: 1 }, // Up Main (towards Taunton)
    { id: "E664", km: 1.25, dir: 1 }, // Up Main
    { id: "E256", km: 0.85, dir: 1 }, // Up Main, ~193m 30c
  ],
  "newton-abbot": [
    // St David's Junction / River Exe (12-12) then St Thomas → Marsh Barton (12-13).
    { id: "E677", km: 0.26, dir: -1 }, // Up Main by the Exe bridges
    { id: "E679", km: 0.36, dir: 1 }, // Down Main, ~194m 10c
    { id: "E35", km: 0.52, dir: -1 }, // Up Main, 194m 18c
    { id: "E33", km: 1.15, dir: -1 }, // Up Main, 194m 49c — last 4-aspect signal
    { id: "E62", km: 1.41, dir: 1 }, // Down Main at Exeter St Thomas
    { id: "E31", km: 2.27, dir: -1 }, // Up Main near City Basin Jn, ~195m 05c
    { id: "E673", km: 2.58, dir: -1 }, // Up Main, 195m 40c
    { id: "DM196", km: 3.38, dir: 1 }, // Down Main at Marsh Barton, ~196m 00c
  ],
};

/** World units per km (WORLD_SCALE is 0.004 units/metre → 4 units/km). */
const UNITS_PER_KM = 4;

/** Real signals for a line, with `t` along its spline computed from km. */
export function realSignalsFor(
  lineId: string,
): { id: string; t: number; dir: 1 | -1 }[] {
  const list = REAL_SIGNALS[lineId];
  if (!list?.length) return [];
  const len = lineCurve(lineId).getLength();
  return list
    .map((s) => ({ id: s.id, t: (s.km * UNITS_PER_KM) / len, dir: s.dir }))
    .filter((s) => s.t > 0 && s.t < 1);
}
