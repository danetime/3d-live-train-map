/**
 * Exeter St David's platform layout, built from the GWR sectional diagram 12-12.
 *
 * Six platform faces as three islands, threaded by the running lines (Relief,
 * Main, Platform Loop), with the North Bay and Hyde Park Siding at the Cowley
 * Bridge (north) end and a pointwork throat fanning out at each end. The whole
 * thing is positioned at St David's and rotated to follow the real line tangent
 * there, and scaled to the trains (a platform ≈ a train length) so a train sits
 * along a platform face.
 *
 * Local axes: +Z runs "down" the line (towards Newton Abbot), so the north
 * (Taunton) end with the bay/siding is at −Z. +X is the east side of the layout.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { lineCurve } from "../data/lineCurves";
import { project } from "../data/geo";
import { ORIGIN } from "../data/network";

const PLAT_LEN = 6.4;
const TRACK_LEN = 8.4;
const TRACK_W = 0.42;
const ISLAND_W = 0.95;

// Running lines (local X) and the three islands sitting between them.
const TRACKS = [-3.9, -1.3, 1.3, 3.9];
const ISLANDS = [-2.6, 0, 2.6];
// Face numbers: [west face, east face] per island (diagram order 2/1, 3/4, 5/6).
const FACES: [string, string][] = [
  ["2", "1"],
  ["3", "4"],
  ["5", "6"],
];

function Rail({ x, len = TRACK_LEN, z = 0 }: { x: number; len?: number; z?: number }) {
  return (
    <mesh position={[x, 0.26, z]} receiveShadow>
      <boxGeometry args={[TRACK_W, 0.12, len]} />
      <meshStandardMaterial color="#222a35" flatShading />
    </mesh>
  );
}

function PlatNum({ n, x, z }: { n: string; x: number; z: number }) {
  return (
    <Text
      position={[x, 0.56, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.42}
      color="#3a2410"
      anchorX="center"
      anchorY="middle"
    >
      {n}
    </Text>
  );
}

/** A short angled connector suggesting the pointwork throat. */
function Point({ x, z, angle }: { x: number; z: number; angle: number }) {
  return (
    <mesh position={[x, 0.26, z]} rotation={[0, angle, 0]} receiveShadow>
      <boxGeometry args={[TRACK_W, 0.12, 2.2]} />
      <meshStandardMaterial color="#222a35" flatShading />
    </mesh>
  );
}

export function StationDetail() {
  const { pos, rotY } = useMemo(() => {
    const pos = project(ORIGIN); // Exeter St David's
    const tan = lineCurve("newton-abbot").getTangentAt(0.004, new THREE.Vector3());
    return { pos, rotY: Math.atan2(tan.x, tan.z) };
  }, []);

  const half = TRACK_LEN / 2;

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, rotY, 0]}>
      {/* Station pad */}
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[10.4, 0.22, TRACK_LEN + 1.4]} />
        <meshStandardMaterial color="#5b6470" flatShading />
      </mesh>

      {/* Running lines */}
      {TRACKS.map((x) => (
        <Rail key={x} x={x} />
      ))}

      {/* Island platforms with their two numbered faces */}
      {ISLANDS.map((x, i) => (
        <group key={x}>
          <mesh position={[x, 0.42, 0]} castShadow receiveShadow>
            <boxGeometry args={[ISLAND_W, 0.4, PLAT_LEN]} />
            <meshStandardMaterial color="#f6ad55" flatShading />
          </mesh>
          <PlatNum n={FACES[i][0]} x={x - ISLAND_W / 2 - 0.3} z={-PLAT_LEN / 2 + 0.7} />
          <PlatNum n={FACES[i][1]} x={x + ISLAND_W / 2 + 0.3} z={PLAT_LEN / 2 - 0.7} />
        </group>
      ))}

      {/* North Bay (terminal) + Hyde Park Siding stub, north (−Z) end */}
      <Rail x={-4.85} len={3.2} z={-half + 1.6} />
      <mesh position={[-4.85, 0.42, -half + 1.6]} castShadow>
        <boxGeometry args={[ISLAND_W * 0.8, 0.4, 2.6]} />
        <meshStandardMaterial color="#ed8936" flatShading />
      </mesh>
      <PlatNum n="NB" x={-5.45} z={-half + 1.6} />
      <mesh position={[-5.7, 0.3, -half + 0.4]} receiveShadow>
        <boxGeometry args={[0.4, 0.1, 2.2]} />
        <meshStandardMaterial color="#7a828d" flatShading />
      </mesh>

      {/* Throat pointwork at both ends */}
      {[-1, 1].map((end) =>
        TRACKS.map((x) => (
          <Point
            key={`${end}-${x}`}
            x={x * 0.78}
            z={end * (half + 0.6)}
            angle={-x * 0.05 * end}
          />
        )),
      )}
    </group>
  );
}
