/** Low-poly station blocks with floating, constant-size name labels. */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { STATIONS } from "../data/network";
import { project } from "../data/geo";

/**
 * A label that keeps a roughly constant on-screen size by scaling with camera
 * distance — so it stays readable far out and doesn't balloon when zoomed in.
 */
function ScaledLabel({
  text,
  y,
  k,
  bold,
}: {
  text: string;
  y: number;
  k: number;
  bold?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const d = camera.position.distanceTo(g.getWorldPosition(world));
    g.scale.setScalar(THREE.MathUtils.clamp(d * k, 0.6, 6));
  });
  return (
    <group ref={ref} position={[0, y, 0]}>
      <Billboard>
        <Text
          fontSize={1}
          color="#1a202c"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={bold ? 0.14 : 0.1}
          outlineColor="#ffffff"
        >
          {text}
        </Text>
      </Billboard>
    </group>
  );
}

export function Stations() {
  return (
    <group>
      {STATIONS.map((station) => {
        const p = project(station.pos);
        const isHub = !!station.hub;
        const size = isHub ? 3.0 : 1.7;
        const height = isHub ? 3.2 : 1.7;
        return (
          <group key={station.code} position={[p.x, 0, p.z]}>
            {/* Green land base — keeps coastal stations sitting on land, not
                floating in the estuary/sea. Blends into the ground inland. */}
            <mesh position={[0, -0.06, 0]} receiveShadow>
              <boxGeometry args={[size * 2.6, 0.3, size * 2.1]} />
              <meshStandardMaterial color="#74ad53" flatShading />
            </mesh>
            {/* Platform slab */}
            <mesh position={[0, 0.18, 0]} receiveShadow>
              <boxGeometry args={[size * 1.7, 0.36, size * 1.1]} />
              <meshStandardMaterial color="#cbd5e0" flatShading />
            </mesh>
            {/* Building */}
            <mesh position={[0, height / 2 + 0.36, 0]} castShadow receiveShadow>
              <boxGeometry args={[size, height, size]} />
              <meshStandardMaterial color={isHub ? "#f6ad55" : "#edf2f7"} flatShading />
            </mesh>
            {/* Shallow roof */}
            <mesh position={[0, height + 0.36 + size * 0.16, 0]} castShadow>
              <coneGeometry args={[size * 0.78, size * 0.42, 4]} />
              <meshStandardMaterial color={isHub ? "#c05621" : "#cbd5e0"} flatShading />
            </mesh>

            <ScaledLabel
              text={isHub ? "Exeter St David's" : station.name}
              y={height + (isHub ? 2.4 : 1.6)}
              k={isHub ? 0.016 : 0.011}
              bold={isHub}
            />
          </group>
        );
      })}
    </group>
  );
}
