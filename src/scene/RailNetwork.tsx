/** Draws each line as a raised low-poly track ribbon following its spline. */
import { useMemo } from "react";
import * as THREE from "three";
import { LINES } from "../data/network";
import { lineCurve } from "../data/lineCurves";

const TRACK_WIDTH = 0.85;
const TRACK_HEIGHT = 0.28;
const BASE_Y = 0.16;
// Stack lines at slightly different heights so shared sections (e.g. Tarka and
// Dartmoor out of Exeter) don't z-fight into a jagged mess.
const Y_STEP = 0.07;

function Track({ lineId, color, index }: { lineId: string; color: string; index: number }) {
  const geometry = useMemo(() => {
    const curve = lineCurve(lineId);
    const tube = new THREE.TubeGeometry(curve, 320, TRACK_WIDTH / 2, 5, false);
    tube.scale(1, TRACK_HEIGHT / (TRACK_WIDTH / 2), 1);
    return tube;
  }, [lineId]);

  return (
    <mesh geometry={geometry} position={[0, BASE_Y + index * Y_STEP, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

export function RailNetwork() {
  return (
    <group>
      {LINES.map((line, i) => (
        <Track key={line.id} lineId={line.id} color={line.color} index={i} />
      ))}
    </group>
  );
}
