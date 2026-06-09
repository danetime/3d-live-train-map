/**
 * REAL signal numbers, transcribed from the GWR sectional route diagrams:
 *   - "Taunton (ECXL) – Plymouth"            (Exeter PSB, E-prefix)
 *   - "Newton Abbot (excl) – Paignton"       (Exeter PSB Panel A, DT/UT-prefix)
 *   - "Exeter (excl) – Barnstaple, Exmouth & Okehampton"
 *        Crediton SB (CN-prefix) and Exmouth Junction SB (EJ-prefix)
 *
 * The diagrams are schematic ("NOT TO SCALE") and each line is measured on a
 * different mileage datum (Paddington for the main line, Waterloo for the
 * Avocet line, etc.), so instead of absolute mileages we anchor each signal to
 * its nearest station and nudge it a little along the route. That keeps the
 * real numbers in the right area on every line without datum juggling.
 *
 * `dir`: +1 = away from Exeter (Down on most of these), -1 = towards Exeter.
 * `nudge`: offset in spline-t from the anchor station (≈0.01 ≈ a few hundred m).
 */
import { lineStopParams } from "./lineCurves";
import { LINE_BY_ID } from "./network";

type RealSig = { id: string; near: string; dir: 1 | -1; nudge?: number };

const DATA: Record<string, RealSig[]> = {
  // Taunton main line — Cowley Bridge Junction (drawing 12-11).
  taunton: [
    { id: "E54", near: "EXD", dir: -1, nudge: 0.06 },
    { id: "E56", near: "EXD", dir: -1, nudge: 0.1 },
    { id: "E660", near: "EXD", dir: 1, nudge: 0.05 },
    { id: "E664", near: "EXD", dir: 1, nudge: 0.09 },
    { id: "E256", near: "EXD", dir: 1, nudge: 0.13 },
  ],
  // Plymouth main line — St David's Jn to Marsh Barton (drawings 12-12/12-13).
  "newton-abbot": [
    { id: "E677", near: "EXD", dir: -1, nudge: 0.02 },
    { id: "E679", near: "EXD", dir: 1, nudge: 0.02 },
    { id: "E62", near: "EXT", dir: 1, nudge: 0.0 },
    { id: "E35", near: "EXT", dir: -1, nudge: 0.01 },
    { id: "E33", near: "EXT", dir: -1, nudge: 0.03 },
    { id: "E31", near: "EXT", dir: -1, nudge: 0.05 },
    { id: "E673", near: "SCS", dir: -1, nudge: -0.02 },
    { id: "DM196", near: "EXT", dir: 1, nudge: 0.06 },
  ],
  // Torbay branch — Aller, Torre, Torquay (drawings 13-1/13-2).
  paignton: [
    { id: "E109R", near: "NTA", dir: -1, nudge: 0.02 },
    { id: "DT218R", near: "NTA", dir: 1, nudge: 0.04 },
    { id: "DT218", near: "NTA", dir: 1, nudge: 0.07 },
    { id: "UT218", near: "TRR", dir: -1, nudge: -0.02 },
    { id: "DT219", near: "TRR", dir: 1, nudge: 0.0 },
    { id: "UT219", near: "TQY", dir: -1, nudge: -0.02 },
    { id: "DT220", near: "TQY", dir: 1, nudge: 0.0 },
  ],
  // Tarka line — Crediton signal box (drawing 24-2).
  barnstaple: [
    { id: "CN4", near: "CDF", dir: -1, nudge: -0.02 },
    { id: "CN2", near: "CDF", dir: 1, nudge: -0.02 },
    { id: "CN2R", near: "CDF", dir: 1, nudge: -0.01 },
    { id: "CN13", near: "CDF", dir: 1, nudge: 0.01 },
    { id: "CN15", near: "CDF", dir: 1, nudge: 0.02 },
    { id: "CN5", near: "CDF", dir: -1, nudge: 0.01 },
  ],
  // Dartmoor line — shares Crediton box; CN14 toward the Okehampton branch.
  okehampton: [{ id: "CN14", near: "CDF", dir: 1, nudge: 0.02 }],
  // Avocet line — Exeter Central & Exmouth Junction (drawings 24-20/24-21).
  exmouth: [
    { id: "E731", near: "EXC", dir: 1, nudge: -0.02 },
    { id: "E730", near: "EXC", dir: -1, nudge: -0.02 },
    { id: "E310", near: "EXC", dir: -1, nudge: -0.01 },
    { id: "E732", near: "EXC", dir: 1, nudge: 0.0 },
    { id: "EJ8", near: "POL", dir: 1, nudge: 0.02 },
    { id: "EJ7", near: "POL", dir: 1, nudge: 0.04 },
    { id: "EJ108", near: "POL", dir: -1, nudge: 0.02 },
    { id: "EJ106", near: "POL", dir: 1, nudge: 0.05 },
    { id: "EJ80", near: "DIG", dir: -1, nudge: -0.02 },
  ],
};

/** Real signals for a line as { id, t, dir }, anchored to their stations. */
export function realSignalsFor(lineId: string): { id: string; t: number; dir: 1 | -1 }[] {
  const list = DATA[lineId];
  const line = LINE_BY_ID.get(lineId);
  if (!list?.length || !line) return [];
  const params = lineStopParams(lineId);
  return list
    .map((s) => {
      const idx = line.stops.indexOf(s.near);
      const base = idx >= 0 ? params[idx] : 0;
      return { id: s.id, t: base + (s.nudge ?? 0), dir: s.dir };
    })
    .filter((s) => s.t > 0.005 && s.t < 0.995);
}
