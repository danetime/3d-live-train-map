/** Low-poly ground: a flat-shaded grassy plane with scattered blocky trees. */
import { useMemo } from "react";
import * as THREE from "three";

const GROUND_SIZE = 1400;
const TREE_COUNT = 220;

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

function Trees() {
  const { trunks, leaves } = useMemo(() => {
    const rng = mulberry32(1337);
    const trunk = new THREE.Object3D();
    const leaf = new THREE.Object3D();
    const trunkMatrices: THREE.Matrix4[] = [];
    const leafMatrices: THREE.Matrix4[] = [];

    for (let i = 0; i < TREE_COUNT; i++) {
      const x = (rng() - 0.5) * GROUND_SIZE * 0.85;
      const z = (rng() - 0.5) * GROUND_SIZE * 0.85;
      // Keep a clearing around the network so trees don't bury the tracks.
      if (Math.hypot(x, z) < 60) continue;
      const scale = 0.7 + rng() * 1.1;

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

/** Ref callback that writes precomputed matrices into an InstancedMesh. */
function applyMatrices(matrices: THREE.Matrix4[]) {
  return (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
  };
}

export function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial color="#6aa84f" flatShading />
      </mesh>
      <Trees />
    </group>
  );
}
