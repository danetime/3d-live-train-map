/** Cached spline curves per line, shared by the track renderer and the trains. */
import * as THREE from "three";
import { curveFromPoints, project } from "./geo";
import { LINES, stationPos } from "./network";

const cache = new Map<string, THREE.CatmullRomCurve3>();
/** Arc-length-normalised position (0..1) of each stop along its line. */
const stopParams = new Map<string, number[]>();
const STOP_SAMPLES = 500;

for (const ln of LINES) {
  const curve = curveFromPoints(ln.points);
  cache.set(ln.id, curve);

  // The drawing geometry may be denser than the stops (real-route waypoints),
  // so locate each stop by the nearest point on the curve and record its
  // arc-length fraction — the same `t` space curve.getPointAt() uses.
  const sampled: THREE.Vector3[] = [];
  for (let i = 0; i <= STOP_SAMPLES; i++) sampled.push(curve.getPointAt(i / STOP_SAMPLES));
  const params = ln.stops.map((code) => {
    const target = project(stationPos(code));
    let bestT = 0;
    let bestD = Infinity;
    for (let i = 0; i < sampled.length; i++) {
      const d = sampled[i].distanceToSquared(target);
      if (d < bestD) {
        bestD = d;
        bestT = i / STOP_SAMPLES;
      }
    }
    return bestT;
  });
  stopParams.set(ln.id, params);
}

export function lineCurve(lineId: string): THREE.CatmullRomCurve3 {
  const c = cache.get(lineId);
  if (!c) throw new Error(`No curve for line: ${lineId}`);
  return c;
}

/** Arc-length fraction (0..1) for each stop on the line, in `stops` order. */
export function lineStopParams(lineId: string): number[] {
  const p = stopParams.get(lineId);
  if (!p) throw new Error(`No stop params for line: ${lineId}`);
  return p;
}

// Pre-sampled points per line, for nearest-line lookups.
const SAMPLES = 140;
const samples: { lineId: string; t: number; point: THREE.Vector3 }[] = [];
for (const ln of LINES) {
  const curve = cache.get(ln.id)!;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    samples.push({ lineId: ln.id, t, point: curve.getPointAt(t) });
  }
}

/**
 * Nearest point on any line to a world position — used to assign a colour/line
 * (and a `t` for the HUD) to a berth we only have raw coordinates for.
 */
export function nearestOnLines(point: THREE.Vector3): { lineId: string; t: number } {
  let best = { lineId: LINES[0].id, t: 0, d: Infinity };
  for (const s of samples) {
    const d = point.distanceToSquared(s.point);
    if (d < best.d) best = { lineId: s.lineId, t: s.t, d };
  }
  return { lineId: best.lineId, t: best.t };
}
