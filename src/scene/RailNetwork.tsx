/** Draws each line as a raised low-poly track ribbon following its spline. */
import { useMemo } from "react";
import * as THREE from "three";
import { LINES } from "../data/network";
import { lineCurve } from "../data/lineCurves";

const TRACK_WIDTH = 1.6;
const TRACK_HEIGHT = 0.35;

function Track({ lineId, color }: { lineId: string; color: string }) {
  const geometry = useMemo(() => {
    const curve = lineCurve(lineId);
    // A flattened tube reads as a chunky, low-poly railway embankment.
    const tube = new THREE.TubeGeometry(curve, 240, TRACK_WIDTH / 2, 4, false);
    tube.scale(1, TRACK_HEIGHT / (TRACK_WIDTH / 2), 1);
    return tube;
  }, [lineId]);

  return (
    <mesh geometry={geometry} position={[0, 0.18, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

export function RailNetwork() {
  return (
    <group>
      {LINES.map((line) => (
        <Track key={line.id} lineId={line.id} color={line.color} />
      ))}
    </group>
  );
}
