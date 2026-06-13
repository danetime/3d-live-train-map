/**
 * Draws the network as low-poly track, following the TRACK GRAPH's edges.
 *
 * Each line's drawn edges are grouped into continuous runs (`railRuns`) and each
 * run becomes one ribbon — a single rail, parallel up/down rails for double
 * track, or a branch peeling off the shared trunk. Driving the geometry from the
 * graph (rather than per-line `drawFrom`/`doubleTrack`) is what lets later steps
 * split a line into double track or diverge a junction without touching this
 * renderer. For today's topology each line is one run, so the output is
 * identical to the previous per-line renderer.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { LINES } from "../data/network";
import { lineCurve, branchOffset } from "../data/lineCurves";
import { railRuns } from "../data/trackGraph";
import { useTrainStore } from "../store/useTrainStore";
import type { Line } from "../data/types";

const SINGLE_WIDTH = 0.85;
const RAIL_WIDTH = 0.5; // each rail of a double-track line
export const GAUGE = 0.7; // lateral offset of each rail from the centreline
const TRACK_HEIGHT = 0.26;
const BASE_Y = 0.16;
const Y_STEP = 0.05; // tiny per-line lift to avoid z-fighting where lines cross

/** Build a track ribbon along a line over [tStart,tEnd], with a lateral offset. */
function buildTube(
  lineId: string,
  tStart: number,
  tEnd: number,
  offsetFn: (t: number) => number,
  width: number,
) {
  const curve = lineCurve(lineId);
  const N = 360;
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = tStart + (tEnd - tStart) * (i / N);
    curve.getPointAt(t, p);
    const q = p.clone();
    const offset = offsetFn(t);
    if (offset !== 0) {
      curve.getTangentAt(t, tan); // unit tangent in the XZ plane
      q.x += tan.z * offset;
      q.z += -tan.x * offset;
    }
    pts.push(q);
  }
  const c = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const tube = new THREE.TubeGeometry(c, N, width / 2, 5, false);
  tube.scale(1, TRACK_HEIGHT / (width / 2), 1);
  return tube;
}

function Track({ line, index, signal }: { line: Line; index: number; signal: boolean }) {
  const geometries = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    for (const run of railRuns(line.id)) {
      if (run.doubleTrack) {
        geos.push(buildTube(line.id, run.tStart, run.tEnd, () => GAUGE, RAIL_WIDTH));
        geos.push(buildTube(line.id, run.tStart, run.tEnd, () => -GAUGE, RAIL_WIDTH));
      } else {
        geos.push(buildTube(line.id, run.tStart, run.tEnd, (t) => branchOffset(line, t), SINGLE_WIDTH));
      }
    }
    return geos;
  }, [line]);

  return (
    <group position={[0, BASE_Y + index * Y_STEP, 0]}>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial
            color={line.color}
            flatShading
            emissive={signal ? line.color : "#000000"}
            emissiveIntensity={signal ? 0.5 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}

export function RailNetwork() {
  const signal = useTrainStore((s) => s.theme) === "dev";
  return (
    <group>
      {LINES.map((line, i) => (
        <Track key={line.id} line={line} index={i} signal={signal} />
      ))}
    </group>
  );
}
