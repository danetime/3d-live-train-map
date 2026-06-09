/** Cached spline curves per line, shared by the track renderer and the trains. */
import * as THREE from "three";
import { curveFromPoints } from "./geo";
import { LINES } from "./network";

const cache = new Map<string, THREE.CatmullRomCurve3>();
/** Arc-length-normalised position (0..1) of each stop along its line. */
const stopParams = new Map<string, number[]>();

for (const ln of LINES) {
  const curve = curveFromPoints(ln.points);
  cache.set(ln.id, curve);

  // A non-closed Catmull-Rom curve passes through control point i at curve
  // parameter i/(n-1); convert that to an arc-length fraction so trains can be
  // placed between stations using the same `t` space as curve.getPointAt().
  const divisions = 600;
  const lengths = curve.getLengths(divisions);
  const total = lengths[divisions] || 1;
  const n = ln.points.length;
  const params = ln.points.map((_, i) => {
    const k = Math.round((i / (n - 1)) * divisions);
    return lengths[k] / total;
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
