/** Low-poly station blocks with floating name labels. */
import { Billboard, Text } from "@react-three/drei";
import { STATIONS } from "../data/network";
import { project } from "../data/geo";

export function Stations() {
  return (
    <group>
      {STATIONS.map((station) => {
        const p = project(station.pos);
        const isHub = !!station.hub;
        const size = isHub ? 3.2 : 1.8;
        const height = isHub ? 3.6 : 2.0;
        return (
          <group key={station.code} position={[p.x, 0, p.z]}>
            {/* Building */}
            <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[size, height, size]} />
              <meshStandardMaterial color={isHub ? "#f6ad55" : "#e2e8f0"} flatShading />
            </mesh>
            {/* Roof */}
            <mesh position={[0, height + size * 0.28, 0]} castShadow>
              <coneGeometry args={[size * 0.85, size * 0.7, 4]} />
              <meshStandardMaterial color={isHub ? "#c05621" : "#a0aec0"} flatShading />
            </mesh>

            {/* Label */}
            <Billboard position={[0, height + size * 0.9 + (isHub ? 1.2 : 0.6), 0]}>
              <Text
                fontSize={isHub ? 2.6 : 1.5}
                color="#1a202c"
                anchorX="center"
                anchorY="bottom"
                outlineWidth={isHub ? 0.16 : 0.1}
                outlineColor="#ffffff"
              >
                {isHub ? "Exeter St David's" : station.name}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}
