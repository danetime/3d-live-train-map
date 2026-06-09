/** Draws each line as low-poly track: single rail, or parallel up/down rails. */
import { useMemo } from "react";
import * as THREE from "three";
import { LINES } from "../data/network";
import { lineCurve, lineStopParams, branchOffset } from "../data/lineCurves";
import { useTrainStore } from "../store/useTrainStore";
import type { Line } from "../data/types";

const SINGLE_WIDTH = 0.85;
const RAIL_WIDTH = 0.5; // each rail of a double-track line
export const GAUGE = 0.7; // lateral offset of each rail from the centreline
const TRACK_HEIGHT = 0.26;
const BASE_Y = 0.16;
const Y_STEP = 0.05; // tiny per-line lift to avoid z-fighting where lines cross

/** Build a track ribbon following a line, with a per-point lateral offset. */
function buildTube(lineId: string, tStart: number, offsetFn: (t: number) => number, width: number) {
  const curve = lineCurve(lineId);
  const N = 360;
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = tStart + (1 - tStart) * (i / N);
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
  const tStart = line.drawFrom ? lineStopParams(line.id)[line.stops.indexOf(line.drawFrom)] : 0;

  const geometries = useMemo(() => {
    if (line.doubleTrack) {
      return [
        buildTube(line.id, tStart, () => GAUGE, RAIL_WIDTH),
        buildTube(line.id, tStart, () => -GAUGE, RAIL_WIDTH),
      ];
    }
    return [buildTube(line.id, tStart, (t) => branchOffset(line, t), SINGLE_WIDTH)];
  }, [line, tStart]);

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
  const signal = useTrainStore((s) => s.theme) === "signal";
  return (
    <group>
      {LINES.map((line, i) => (
        <Track key={line.id} line={line} index={i} signal={signal} />
      ))}
    </group>
  );
}
