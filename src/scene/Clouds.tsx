/** Blocky, slowly drifting clouds — Minecraft-style, built from white boxes. */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const CLOUD_COUNT = 14;
const DRIFT_SPEED = 1.6; // world units / second
const FIELD = 1100; // span the clouds wrap around within

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Puff = { x: number; y: number; z: number; sx: number; sy: number; sz: number };
type Cloud = { x: number; y: number; z: number; puffs: Puff[] };

export function Clouds() {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);

  const clouds = useMemo<Cloud[]>(() => {
    const rng = mulberry32(99);
    return Array.from({ length: CLOUD_COUNT }, () => {
      const puffCount = 3 + Math.floor(rng() * 4);
      const puffs: Puff[] = Array.from({ length: puffCount }, () => ({
        x: (rng() - 0.5) * 34,
        y: (rng() - 0.5) * 6,
        z: (rng() - 0.5) * 22,
        sx: 12 + rng() * 18,
        sy: 6 + rng() * 5,
        sz: 10 + rng() * 14,
      }));
      return {
        x: (rng() - 0.5) * FIELD,
        y: 150 + rng() * 70,
        z: (rng() - 0.5) * FIELD,
        puffs,
      };
    });
  }, []);

  useFrame((_, delta) => {
    for (const g of groupRefs.current) {
      if (!g) continue;
      g.position.x += DRIFT_SPEED * delta;
      if (g.position.x > FIELD / 2) g.position.x = -FIELD / 2;
    }
  });

  return (
    <group>
      {clouds.map((cloud, i) => (
        <group
          key={i}
          position={[cloud.x, cloud.y, cloud.z]}
          ref={(el) => (groupRefs.current[i] = el)}
        >
          {cloud.puffs.map((p, j) => (
            <mesh key={j} position={[p.x, p.y, p.z]}>
              <boxGeometry args={[p.sx, p.sy, p.sz]} />
              <meshStandardMaterial
                color="#ffffff"
                transparent
                opacity={0.92}
                flatShading
                roughness={1}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
