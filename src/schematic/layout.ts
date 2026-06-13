/**
 * Schematic (strip-map / metro-diagram) layout for the linear view.
 *
 * Abstract grid coordinates (x → right, y → down) — NOT geographic, but oriented
 * like a map: WEST on the left, EAST on the right. So the through main line is a
 * horizontal spine with Plymouth (west) on the left, through Newton Abbot and
 * Exeter St David's, to Taunton (east) on the right; the Paignton (Riviera) and
 * Exmouth (Avocet) branches drop vertically from their junctions (Newton Abbot
 * and St David's). Trains are placed by interpolating their line param `t`
 * between the schematic positions of the stops they lie between, and segments
 * know whether they're double track (`lineSegments`) — reusing the same live
 * feed + track graph as the 3D world, just drawn as clean straight lines.
 */
import { LINE_BY_ID } from "../data/network";
import { lineStopParams } from "../data/lineCurves";
import { trackGraph } from "../data/trackGraph";

export type Pt = { x: number; y: number };

export const SCHEMATIC_POS: Record<string, Pt> = {
  // Main-line spine (y = 0): Plymouth (west/left) … Newton Abbot … Exeter …
  // Tiverton Parkway … Taunton (east/right).
  PLY: { x: 0, y: 0 },
  IVY: { x: 1.2, y: 0 },
  TOT: { x: 2.2, y: 0 },
  NTA: { x: 3.4, y: 0 }, // junction: Paignton branch drops here
  TGM: { x: 5.0, y: 0 },
  DWL: { x: 5.9, y: 0 },
  DWW: { x: 6.7, y: 0 },
  SCS: { x: 7.5, y: 0 },
  MRB: { x: 8.5, y: 0 },
  EXT: { x: 9.2, y: 0 },
  EXD: { x: 10.4, y: 0 }, // junction: Exmouth branch drops here
  TVP: { x: 12.3, y: 0 },
  TAU: { x: 13.8, y: 0 },

  // Paignton (Riviera) branch — drops from Newton Abbot
  TRR: { x: 3.4, y: 1.3 },
  TQY: { x: 3.4, y: 2.1 },
  PGN: { x: 3.4, y: 2.9 },

  // Exmouth (Avocet) branch — double track runs straight south from St David's
  // through Exeter Central and St James Park to Exmouth Junction; there the
  // single branch peels off to the south-west toward Exmouth (and the
  // unmodelled main line carries on south — see SCHEMATIC_STUBS).
  EXC: { x: 10.4, y: 1.3 },
  SJP: { x: 10.4, y: 2.1 },
  POL: { x: 9.7, y: 2.9 },
  DIG: { x: 9.2, y: 3.7 },
  NCO: { x: 8.7, y: 4.5 },
  TOP: { x: 8.2, y: 5.3 },
  EXN: { x: 7.7, y: 6.1 },
  LYC: { x: 7.3, y: 6.8 },
  LYM: { x: 6.9, y: 7.4 },
  EXM: { x: 6.5, y: 8.1 },
};

/** Junctions drawn as labelled markers (they aren't stations/stops). */
export const SCHEMATIC_JUNCTIONS: { id: string; name: string; x: number; y: number; signal?: string }[] = [
  { id: "XMJ", name: "Exmouth Jn", x: 10.4, y: 2.55, signal: "EJ7" },
];

/** Short stubs for lines that continue off the diagram (not modelled routes). */
export const SCHEMATIC_STUBS: { from: Pt; to: Pt; label: string }[] = [
  // The West of England main line (to Salisbury / London Waterloo) carries on
  // south from Exmouth Junction — shown as a short double stub off the diagram.
  { from: { x: 10.4, y: 2.1 }, to: { x: 10.4, y: 3.8 }, label: "Salisbury / London Waterloo" },
];

/** Passing loops drawn as a short parallel track beside a station (not a full
 *  double-track edge — e.g. Topsham is a short loop, not double to its neighbours). */
export const SCHEMATIC_LOOPS: { lineId: string; at: string }[] = [
  { lineId: "exmouth", at: "TOP" },
];

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

/** A drawn segment between two adjacent stops, flagged double-track or not. */
export type Seg = { a: Pt; b: Pt; double: boolean };

/** Segments to draw for a line, each tagged with its track type from the graph. */
export function lineSegments(lineId: string): Seg[] {
  const stops = lineDrawStops(lineId);
  const out: Seg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = SCHEMATIC_POS[stops[i]];
    const b = SCHEMATIC_POS[stops[i + 1]];
    if (!a || !b) continue;
    const edge = trackGraph.edges.get(`${lineId}:${stops[i]}-${stops[i + 1]}`);
    out.push({ a, b, double: !!edge?.doubleTrack });
  }
  return out;
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
