/** Cached spline curves per line, shared by the track renderer and the trains. */
import * as THREE from "three";
import { curveFromPoints } from "./geo";
import { LINES } from "./network";

const cache = new Map<string, THREE.CatmullRomCurve3>();

for (const line of LINES) {
  cache.set(line.id, curveFromPoints(line.points));
}

export function lineCurve(lineId: string): THREE.CatmullRomCurve3 {
  const c = cache.get(lineId);
  if (!c) throw new Error(`No curve for line: ${lineId}`);
  return c;
}
