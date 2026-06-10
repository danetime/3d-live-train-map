/**
 * Exeter St David's platform layout, from the GWR sectional diagram 12-12.
 *
 * Kept deliberately minimal so it sits cleanly on the geographic map: just the
 * platform islands (six numbered faces) plus the North Bay, on a thin base, at
 * St David's and rotated to follow the real line tangent there. The coloured
 * network lines themselves serve as the running tracks, so we don't draw any
 * separate rails or throat pointwork (that only added clutter).
 */
import { useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { lineCurve } from "../data/lineCurves";
import { project } from "../data/geo";
import { ORIGIN } from "../data/network";

const PLAT_LEN = 4.6;
const ISLAND_W = 0.62;
const ISLANDS = [-1.7, 0, 1.7]; // local X of the three islands
const FACES: [string, string][] = [
  ["2", "1"],
  ["3", "4"],
  ["5", "6"],
];

function PlatNum({ n, x, z }: { n: string; x: number; z: number }) {
  return (
    <Text
      position={[x, 0.46, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.34}
      color="#3a2410"
      anchorX="center"
      anchorY="middle"
    >
      {n}
    </Text>
  );
}

export function StationDetail() {
  const { pos, rotY } = useMemo(() => {
    const p = project(ORIGIN); // Exeter St David's
    const tan = lineCurve("newton-abbot").getTangentAt(0.004, new THREE.Vector3());
    return { pos: p, rotY: Math.atan2(tan.x, tan.z) };
  }, []);

  return (
    <group position={[pos.x, 0.02, pos.z]} rotation={[0, rotY, 0]}>
      {/* Thin base just under the platforms */}
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <boxGeometry args={[4.6, 0.16, PLAT_LEN + 1.0]} />
        <meshStandardMaterial color="#3a4250" flatShading transparent opacity={0.85} />
      </mesh>

      {/* Three island platforms, six numbered faces */}
      {ISLANDS.map((x, i) => (
        <group key={x}>
          <mesh position={[x, 0.34, 0]} castShadow receiveShadow>
            <boxGeometry args={[ISLAND_W, 0.3, PLAT_LEN]} />
            <meshStandardMaterial color="#f6ad55" flatShading />
          </mesh>
          <PlatNum n={FACES[i][0]} x={x - ISLAND_W / 2 - 0.22} z={-PLAT_LEN / 2 + 0.5} />
          <PlatNum n={FACES[i][1]} x={x + ISLAND_W / 2 + 0.22} z={PLAT_LEN / 2 - 0.5} />
        </group>
      ))}

      {/* North Bay terminal stub at the Cowley Bridge (−Z) end */}
      <mesh position={[-2.5, 0.34, -PLAT_LEN / 2 + 0.9]} castShadow receiveShadow>
        <boxGeometry args={[ISLAND_W * 0.8, 0.3, 1.8]} />
        <meshStandardMaterial color="#ed8936" flatShading />
      </mesh>
      <PlatNum n="NB" x={-3.0} z={-PLAT_LEN / 2 + 0.9} />
    </group>
  );
}
