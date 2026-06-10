/** Cached spline curves per line, shared by the track renderer and the trains. */
import * as THREE from "three";
import { curveFromPoints, project } from "./geo";
import { LINES, LINE_MILEAGES, stationPos } from "./network";
import type { Line } from "./types";

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

/** Miles-and-chains → decimal miles (1 mile = 80 chains). */
export function milesChains(miles: number, chains: number): number {
  return miles + chains / 80;
}

// Mileage calibration anchors per line: each station's known mileage paired
// with its arc-length t, sorted by mileage so we can interpolate t for any
// mileage in between. Built from LINE_MILEAGES zipped with the stop params.
const mileageAnchors = new Map<string, { miles: number; t: number }[]>();
for (const ln of LINES) {
  const miles = LINE_MILEAGES[ln.id];
  const ts = stopParams.get(ln.id);
  if (!miles || !ts || miles.length !== ts.length) continue;
  const anchors = miles.map((m, i) => ({ miles: m, t: ts[i] }));
  anchors.sort((a, b) => a.miles - b.miles);
  mileageAnchors.set(ln.id, anchors);
}

/**
 * Convert a real-world mileage (decimal miles — see `milesChains`) to a
 * parameter t (0..1) along the line's spline, by linearly interpolating between
 * the calibrated station anchors. Clamps to the line's anchored mileage range,
 * so a mileage at a station returns exactly that station's t.
 */
export function mileageToT(lineId: string, miles: number): number {
  const anchors = mileageAnchors.get(lineId);
  if (!anchors || anchors.length === 0) {
    throw new Error(`No mileage anchors for line: ${lineId}`);
  }
  if (miles <= anchors[0].miles) return anchors[0].t;
  const last = anchors[anchors.length - 1];
  if (miles >= last.miles) return last.t;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (miles <= b.miles) {
      const f = (miles - a.miles) / (b.miles - a.miles);
      return a.t + (b.t - a.t) * f;
    }
  }
  return last.t;
}

/**
 * Lateral offset for a branch line at curve parameter `t`: ramps from 0 at the
 * branch stop to `drawOffset` shortly after, so the branch peels smoothly off
 * the shared trunk (used by both the track renderer and the trains).
 */
export function branchOffset(line: Line, t: number): number {
  if (!line.drawOffset || !line.drawFrom) return 0;
  const idx = line.stops.indexOf(line.drawFrom);
  if (idx < 0) return 0;
  const tStart = lineStopParams(line.id)[idx];
  const f = THREE.MathUtils.clamp((t - tStart) / 0.06, 0, 1);
  return line.drawOffset * f;
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
