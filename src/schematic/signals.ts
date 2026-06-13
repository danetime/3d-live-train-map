/**
 * Signals for the linear schematic — reuses the real signal roster
 * (`realSignalsFor`, the numbers transcribed from the route diagrams) and the
 * same block model as the 3D `Signals.tsx`: a signal protects the block ahead
 * of it in its direction, up to the next signal on the same rail, and shows RED
 * while a train occupies that block, GREEN otherwise. Position/colour are drawn
 * by `SchematicMap`; this module just produces the per-signal block data.
 */
import { realSignalsFor } from "../data/realSignals";
import { lineTToEdge } from "../data/trackGraph";
import { SCHEMATIC_JUNCTIONS } from "./layout";

/** Signals shown AT a junction marker (not as a dot on the running line). */
const JUNCTION_SIGNALS = new Set(
  SCHEMATIC_JUNCTIONS.map((j) => j.signal).filter((s): s is string => !!s),
);

export type SchematicSignal = {
  id: string;
  lineId: string;
  dir: 1 | -1;
  /** Position along the line (0..1), for placement. */
  t: number;
  /** Block protected by this signal, as [lo, hi] in line t-space. */
  lo: number;
  hi: number;
  /** Double track here → only same-direction trains occupy this signal's rail. */
  double: boolean;
};

export function schematicSignals(lineId: string): SchematicSignal[] {
  const sigs = realSignalsFor(lineId).filter((s) => !JUNCTION_SIGNALS.has(s.id));
  const out: SchematicSignal[] = [];
  for (const dir of [1, -1] as const) {
    const ds = sigs.filter((s) => s.dir === dir).sort((a, b) => a.t - b.t);
    for (let i = 0; i < ds.length; i++) {
      const s = ds[i];
      const aheadT = dir === 1 ? ds[i + 1]?.t : ds[i - 1]?.t;
      const next = aheadT ?? s.t + dir * 0.03;
      out.push({
        id: s.id,
        lineId,
        dir,
        t: s.t,
        lo: Math.min(s.t, next) - 0.004,
        hi: Math.max(s.t, next) + 0.004,
        double: lineTToEdge(lineId, s.t)?.edge.doubleTrack ?? false,
      });
    }
  }
  return out;
}
