/** Low-poly ground: grassy plane, distant hills and scattered blocky trees. */
import { useMemo } from "react";
import * as THREE from "three";
import { isOverWater } from "../data/water";

const GROUND_SIZE = 1600;
const TREE_COUNT = 110;
const HILL_COUNT = 9;

/** Deterministic pseudo-random so the scenery is stable between reloads. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ref callback that writes precomputed matrices into an InstancedMesh. */
function applyMatrices(matrices: THREE.Matrix4[]) {
  return (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
  };
}

function Trees() {
  const { trunks, leaves } = useMemo(() => {
    const rng = mulberry32(1337);
    const trunk = new THREE.Object3D();
    const leaf = new THREE.Object3D();
    const trunkMatrices: THREE.Matrix4[] = [];
    const leafMatrices: THREE.Matrix4[] = [];

    let attempts = 0;
    while (leafMatrices.length < TREE_COUNT && attempts < TREE_COUNT * 6) {
      attempts++;
      const x = (rng() - 0.5) * GROUND_SIZE * 0.8;
      const z = (rng() - 0.5) * GROUND_SIZE * 0.8;
      // Keep a clearing around the hub, and never plant trees on water.
      if (Math.hypot(x, z) < 55) continue;
      if (isOverWater(x, z)) continue;
      const scale = 0.7 + rng() * 1.2;

      trunk.position.set(x, scale * 1.2, z);
      trunk.scale.set(scale, scale * 2.4, scale);
      trunk.updateMatrix();
      trunkMatrices.push(trunk.matrix.clone());

      leaf.position.set(x, scale * 3.4, z);
      leaf.scale.set(scale * 2.4, scale * 3.2, scale * 2.4);
      leaf.rotation.y = rng() * Math.PI;
      leaf.updateMatrix();
      leafMatrices.push(leaf.matrix.clone());
    }
    return { trunks: trunkMatrices, leaves: leafMatrices };
  }, []);

  return (
    <group>
      <instancedMesh args={[undefined, undefined, trunks.length]} ref={applyMatrices(trunks)}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#7b4a2d" flatShading />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, leaves.length]} ref={applyMatrices(leaves)}>
        <coneGeometry args={[1, 1.4, 5]} />
        <meshStandardMaterial color="#3f8a3a" flatShading />
      </instancedMesh>
    </group>
  );
}

/** Distant Dartmoor / Exmoor backdrop hills to the west. */
function Hills() {
  const hills = useMemo(() => {
    const rng = mulberry32(7);
    return Array.from({ length: HILL_COUNT }, () => {
      // Spread across the western half (angles ~100°..260°).
      const angle = Math.PI * (0.55 + rng() * 0.9);
      const radius = 240 + rng() * 130;
      const width = 60 + rng() * 70;
      const height = 26 + rng() * 26;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        width,
        height,
        tint: rng(),
      };
    });
  }, []);

  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, h.height / 2 - 1, h.z]} castShadow>
          <coneGeometry args={[h.width, h.height, 6]} />
          <meshStandardMaterial color={h.tint > 0.5 ? "#6f8a55" : "#7e8a63"} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial color="#74ad53" flatShading />
      </mesh>
      <Hills />
      <Trees />
    </group>
  );
}
