/**
 * Exeter St David's, modelled on the GWR diagram 12-12 and the Traksy layout.
 *
 * Six platform faces as three islands, laid out parallel to the main line and
 * with it running straight through the middle — like the real diagram — plus
 * the North Bay and Hyde Park Siding at the north end. Compact and aligned to
 * the through-axis (the smooth Taunton↔Plymouth direction at St David's), so it
 * reads as a tidy station rather than bars crossing the lines at an angle.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { lineCurve } from "../data/lineCurves";
import { project } from "../data/geo";
import { ORIGIN } from "../data/network";

const PLAT_LEN = 3.4;
const ISLAND_W = 0.55;
const ISLANDS = [-1.35, 0, 1.35]; // local X of the three islands
const FACES: [string, string][] = [
  ["1", "2"],
  ["3", "4"],
  ["5", "6"],
];

function PlatNum({ n, x, z }: { n: string; x: number; z: number }) {
  return (
    <Text
      position={[x, 0.42, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.46}
      color="#3a2410"
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.04}
      outlineColor="#f6ad55"
    >
      {n}
    </Text>
  );
}

export function StationDetail() {
  const { pos, rotY } = useMemo(() => {
    const p = project(ORIGIN); // Exeter St David's
    // Smooth through-axis: blend the Plymouth-ward and (reversed) Taunton-ward
    // tangents so the platforms line up with the main line both sides.
    const tPly = lineCurve("newton-abbot").getTangentAt(0.004, new THREE.Vector3());
    const tTau = lineCurve("taunton").getTangentAt(0.004, new THREE.Vector3());
    const axis = tPly.sub(tTau).normalize();
    return { pos: p, rotY: Math.atan2(axis.x, axis.z) };
  }, []);

  return (
    <group position={[pos.x, 0.04, pos.z]} rotation={[0, rotY, 0]}>
      {/* Crisp station base, snug around the platforms */}
      <mesh position={[0, 0.18, 0]} receiveShadow>
        <boxGeometry args={[3.7, 0.12, PLAT_LEN + 1.1]} />
        <meshStandardMaterial color="#2f3742" flatShading />
      </mesh>

      {/* Three island platforms, six numbered faces */}
      {ISLANDS.map((x, i) => (
        <group key={x}>
          <mesh position={[x, 0.32, 0]} castShadow receiveShadow>
            <boxGeometry args={[ISLAND_W, 0.26, PLAT_LEN]} />
            <meshStandardMaterial color="#f6ad55" flatShading />
          </mesh>
          <PlatNum n={FACES[i][0]} x={x} z={-PLAT_LEN / 2 + 0.5} />
          <PlatNum n={FACES[i][1]} x={x} z={PLAT_LEN / 2 - 0.5} />
        </group>
      ))}

      {/* North Bay terminal + Hyde Park Siding stub at the north (−Z) end */}
      <mesh position={[-1.35, 0.32, -PLAT_LEN / 2 - 1.0]} castShadow receiveShadow>
        <boxGeometry args={[ISLAND_W, 0.26, 1.4]} />
        <meshStandardMaterial color="#ed8936" flatShading />
      </mesh>
      <mesh position={[-2.1, 0.26, -PLAT_LEN / 2 - 1.0]} receiveShadow>
        <boxGeometry args={[0.5, 0.14, 1.2]} />
        <meshStandardMaterial color="#3a4250" flatShading />
      </mesh>
    </group>
  );
}
