/** Stations: low-poly buildings in 'land' mode, clean glowing nodes in 'signal'. */
import { useRef } from "react";
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
 * A label that keeps a roughly constant on-screen size. Under the orthographic
 * camera, screen size = world size × zoom, so we scale inversely with zoom
 * (camera distance is a useless constant for ortho). fontSize is 1 world unit,
 * so `px` is roughly the target height in screen pixels.
 */
function ScaledLabel({
  text,
  y,
  px,
  bold,
  color,
  outline,
}: {
  text: string;
  y: number;
  px: number;
  bold?: boolean;
  color: string;
  outline: string;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
    g.scale.setScalar(THREE.MathUtils.clamp(px / zoom, 0.4, 40));
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

/**
 * Temporary minimal marker: a flat white disc UNDER the track (track rides at
 * BASE_Y ≈ 0.16) so stations read as map nodes without blocking the view of
 * trains. The old glowing sphere-on-stem is parked until the design pass.
 */
function SignalStation({ isHub }: { isHub: boolean }) {
  const r = isHub ? 1.8 : 1.1;
  // A schematic node that reads on the light board: dark disc, pale centre.
  return (
    <group position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <circleGeometry args={[r, 24]} />
        <meshBasicMaterial color="#2b3340" />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[r * 0.5, 20]} />
        <meshBasicMaterial color="#f3eee2" />
      </mesh>
    </group>
  );
}

export function Stations() {
  const land = useTrainStore((s) => s.theme) === "land";
  const detailLevel = useTrainStore((s) => s.detailLevel);
  const labelColor = land ? "#1a202c" : "#26303c";
  const labelOutline = land ? "#ffffff" : "#efe9db";

  return (
    <group>
      {STATIONS.map((station) => {
        // Zoomed out (level 0) only the major stations show; the rest fade in
        // from level 1.
        if (detailLevel < 1 && !MAJOR.has(station.code)) return null;
        const p = project(station.pos);
        const isHub = !!station.hub;
        const isMajor = MAJOR.has(station.code);
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
            {/* Labels declutter by zoom: major stations always, the rest only
                once you've zoomed in (level 2+). */}
            {(isMajor || detailLevel >= 2) && (
              <ScaledLabel
                text={isHub ? "Exeter St David's" : station.name}
                y={(land ? height : 2.4) + (isHub ? 2.4 : 1.6)}
                px={isHub ? 26 : 14}
                bold={isHub}
                color={labelColor}
                outline={labelOutline}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
