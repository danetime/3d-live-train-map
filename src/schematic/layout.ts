/**
 * Schematic (strip-map / metro-diagram) layout for the linear view.
 *
 * Abstract grid coordinates (x → right, y → down) — NOT geographic. The through
 * main line is a single horizontal spine, Taunton on the left through Exeter
 * St David's and Newton Abbot to Plymouth on the right; the Exmouth (Avocet) and
 * Paignton (Riviera) branches drop vertically from their junction stations
 * (St David's and Newton Abbot). Trains are placed by interpolating their line
 * param `t` between the schematic positions of the stops it lies between — so
 * this view reuses the same live feed + line data as the 3D world, just drawn
 * as clean straight lines.
 */
import { LINE_BY_ID } from "../data/network";
import { lineStopParams } from "../data/lineCurves";

export type Pt = { x: number; y: number };

export const SCHEMATIC_POS: Record<string, Pt> = {
  // Main-line spine (y = 0): Taunton … Exeter … Newton Abbot … Plymouth
  TAU: { x: 0, y: 0 },
  TVP: { x: 1.5, y: 0 },
  EXD: { x: 3.4, y: 0 }, // junction: Exmouth branch drops here
  EXT: { x: 4.6, y: 0 },
  MRB: { x: 5.3, y: 0 },
  SCS: { x: 6.3, y: 0 },
  DWW: { x: 7.1, y: 0 },
  DWL: { x: 7.9, y: 0 },
  TGM: { x: 8.8, y: 0 },
  NTA: { x: 10.4, y: 0 }, // junction: Paignton branch drops here
  TOT: { x: 11.6, y: 0 },
  IVY: { x: 12.6, y: 0 },
  PLY: { x: 13.8, y: 0 },

  // Exmouth (Avocet) branch — drops from St David's
  EXC: { x: 3.4, y: 1.3 },
  SJP: { x: 3.4, y: 2.1 },
  POL: { x: 3.4, y: 2.9 },
  DIG: { x: 3.4, y: 3.7 },
  NCO: { x: 3.4, y: 4.5 },
  TOP: { x: 3.4, y: 5.3 },
  EXN: { x: 3.4, y: 6.1 },
  LYC: { x: 3.4, y: 6.9 },
  LYM: { x: 3.4, y: 7.7 },
  EXM: { x: 3.4, y: 8.5 },

  // Paignton (Riviera) branch — drops from Newton Abbot
  TRR: { x: 10.4, y: 1.3 },
  TQY: { x: 10.4, y: 2.1 },
  PGN: { x: 10.4, y: 2.9 },
};

/** Bounding box of the schematic, for sizing the SVG viewBox. */
export const SCHEMATIC_BOUNDS = (() => {
  const xs = Object.values(SCHEMATIC_POS).map((p) => p.x);
  const ys = Object.values(SCHEMATIC_POS).map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
})();

/** Stops a line draws, skipping the shared trunk a branch doesn't redraw. */
export function lineDrawStops(lineId: string): string[] {
  const line = LINE_BY_ID.get(lineId);
  if (!line) return [];
  const start = line.drawFrom ? line.stops.indexOf(line.drawFrom) : 0;
  return line.stops.slice(Math.max(0, start));
}

/** Schematic point for a train at line param `t` (0..1), by interpolating
 *  between the stops it sits between. */
export function schematicPos(lineId: string, t: number): Pt {
  const line = LINE_BY_ID.get(lineId);
  if (!line) return { x: 0, y: 0 };
  const stops = line.stops;
  const sp = lineStopParams(lineId);
  const tc = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < sp.length - 2 && tc > sp[i + 1]) i++;
  const a = SCHEMATIC_POS[stops[i]];
  const b = SCHEMATIC_POS[stops[i + 1]];
  if (!a || !b) return a ?? b ?? { x: 0, y: 0 };
  const span = sp[i + 1] - sp[i] || 1;
  const f = Math.max(0, Math.min(1, (tc - sp[i]) / span));
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
