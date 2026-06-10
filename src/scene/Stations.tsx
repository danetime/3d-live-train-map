/** Stations: low-poly buildings in 'land' mode, clean glowing nodes in 'signal'. */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { STATIONS, LINES } from "../data/network";
import { project } from "../data/geo";
import { useTrainStore } from "../store/useTrainStore";

/** Stations shown even in the zoomed-out overview: hub, junctions, termini. */
const MAJOR = new Set<string>([
  "EXD", // hub
  "NTA", // junction (Plymouth / Paignton)
  ...LINES.map((l) => l.stops[l.stops.length - 1]), // line termini
]);

/**
 * A label that keeps a roughly constant on-screen size by scaling with camera
 * distance — so it stays readable far out and doesn't balloon when zoomed in.
 */
function ScaledLabel({
  text,
  y,
  k,
  bold,
  color,
  outline,
}: {
  text: string;
  y: number;
  k: number;
  bold?: boolean;
  color: string;
  outline: string;
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
          color={color}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={bold ? 0.14 : 0.1}
          outlineColor={outline}
        >
          {text}
        </Text>
      </Billboard>
    </group>
  );
}

function LandStation({ size, height, isHub }: { size: number; height: number; isHub: boolean }) {
  return (
    <group>
      {/* Green land base — keeps coastal stations on land, blends inland. */}
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[size * 2.6, 0.3, size * 2.1]} />
        <meshStandardMaterial color="#74ad53" flatShading />
      </mesh>
      <mesh position={[0, 0.18, 0]} receiveShadow>
        <boxGeometry args={[size * 1.7, 0.36, size * 1.1]} />
        <meshStandardMaterial color="#cbd5e0" flatShading />
      </mesh>
      <mesh position={[0, height / 2 + 0.36, 0]} castShadow receiveShadow>
        <boxGeometry args={[size, height, size]} />
        <meshStandardMaterial color={isHub ? "#f6ad55" : "#edf2f7"} flatShading />
      </mesh>
      <mesh position={[0, height + 0.36 + size * 0.16, 0]} castShadow>
        <coneGeometry args={[size * 0.78, size * 0.42, 4]} />
        <meshStandardMaterial color={isHub ? "#c05621" : "#cbd5e0"} flatShading />
      </mesh>
    </group>
  );
}

function SignalStation({ isHub }: { isHub: boolean }) {
  const color = isHub ? "#f6ad55" : "#dbe6f5";
  const r = isHub ? 1.3 : 0.75;
  return (
    <group position={[0, 1, 0]}>
      <mesh>
        <sphereGeometry args={[r, 16, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
      </mesh>
      {/* Stem down to the line. */}
      <mesh position={[0, -0.6, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 1.2, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

export function Stations() {
  const land = useTrainStore((s) => s.theme) === "land";
  const detailLevel = useTrainStore((s) => s.detailLevel);
  const labelColor = land ? "#1a202c" : "#e8eef7";
  const labelOutline = land ? "#ffffff" : "#0b1220";

  return (
    <group>
      {STATIONS.map((station) => {
        // Zoomed out (level 0) only the major stations show; the rest fade in
        // from level 1.
        if (detailLevel < 1 && !MAJOR.has(station.code)) return null;
        const p = project(station.pos);
        const isHub = !!station.hub;
        const size = isHub ? 3.0 : 1.7;
        const height = isHub ? 3.2 : 1.7;
        return (
          <group key={station.code} position={[p.x, 0, p.z]}>
            {/* The hub's building is replaced by the detailed platform
                layout (StationDetail). */}
            {!isHub &&
              (land ? (
                <LandStation size={size} height={height} isHub={isHub} />
              ) : (
                <SignalStation isHub={isHub} />
              ))}
            <ScaledLabel
              text={isHub ? "Exeter St David's" : station.name}
              y={(land ? height : 2.4) + (isHub ? 2.4 : 1.6)}
              k={isHub ? 0.016 : 0.011}
              bold={isHub}
              color={labelColor}
              outline={labelOutline}
            />
          </group>
        );
      })}
    </group>
  );
}
