/** Low-poly ground: farmland patchwork, distant hills and scattered trees. */
import { useMemo } from "react";
import * as THREE from "three";
import { isOverWater } from "../data/water";

const GROUND_SIZE = 1600;
const TREE_COUNT = 300;
const FIELD_COUNT = 120;

// Devon palette: mixed field greens with a few golden/harvested ones, varied
// tree greens (plus the odd autumnal one), and hill tones that haze with depth.
const FIELD_COLORS = ["#8fb866", "#7da650", "#a8c46f", "#cdbf64", "#b7a64c", "#6f9b48", "#9cb85e", "#c2b873"];
const LEAF_COLORS = ["#3f8a3a", "#4f9a45", "#357a32", "#5aa850", "#2e6e2c", "#6cae4e", "#b9863a"];
const HILL_COLORS = ["#6f8a55", "#7e8a63", "#5f7d4e", "#869071", "#6a8556"];

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

/** Ref callback: write precomputed matrices into an InstancedMesh. */
function applyMatrices(matrices: THREE.Matrix4[]) {
  return (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** Ref callback: write per-instance matrices AND colours. */
function applyColored(items: { matrix: THREE.Matrix4; color: THREE.Color }[]) {
  return (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.matrix);
      mesh.setColorAt(i, it.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
}

/** Farmland patchwork: flat coloured quads over the green plane, off water. */
function Fields() {
  const items = useMemo(() => {
    const rng = mulberry32(4242);
    const o = new THREE.Object3D();
    const out: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
    let attempts = 0;
    while (out.length < FIELD_COUNT && attempts < FIELD_COUNT * 8) {
      attempts++;
      const x = (rng() - 0.5) * GROUND_SIZE * 0.78;
      const z = (rng() - 0.5) * GROUND_SIZE * 0.78;
      if (Math.hypot(x, z) < 58) continue; // keep the hub clear
      if (isOverWater(x, z)) continue;
      const w = 11 + rng() * 28;
      const d = 11 + rng() * 28;
      o.position.set(x, -0.36, z);
      // Lay the XY plane flat (−90° about X), then spin about world-up (local Z).
      o.rotation.set(-Math.PI / 2, 0, rng() * Math.PI);
      o.scale.set(w, d, 1);
      o.updateMatrix();
      out.push({
        matrix: o.matrix.clone(),
        color: new THREE.Color(FIELD_COLORS[Math.floor(rng() * FIELD_COLORS.length)]),
      });
    }
    return out;
  }, []);

  return (
    <instancedMesh args={[undefined, undefined, items.length]} ref={applyColored(items)} receiveShadow>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        flatShading
        vertexColors
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </instancedMesh>
  );
}

function Trees() {
  const { trunks, leaves } = useMemo(() => {
    const rng = mulberry32(1337);
    const trunk = new THREE.Object3D();
    const leaf = new THREE.Object3D();
    const trunkMatrices: THREE.Matrix4[] = [];
    const leafItems: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];

    let attempts = 0;
    while (leafItems.length < TREE_COUNT && attempts < TREE_COUNT * 6) {
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

      // Vary canopy height/width and colour so the woodland isn't uniform.
      const spread = 2.0 + rng() * 0.9;
      const tall = 2.7 + rng() * 1.4;
      leaf.position.set(x, scale * (2.9 + rng() * 0.8), z);
      leaf.scale.set(scale * spread, scale * tall, scale * spread);
      leaf.rotation.y = rng() * Math.PI;
      leaf.updateMatrix();
      leafItems.push({
        matrix: leaf.matrix.clone(),
        color: new THREE.Color(LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)]),
      });
    }
    return { trunks: trunkMatrices, leaves: leafItems };
  }, []);

  return (
    <group>
      <instancedMesh args={[undefined, undefined, trunks.length]} ref={applyMatrices(trunks)} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#7b4a2d" flatShading />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, leaves.length]} ref={applyColored(leaves)} castShadow>
        <coneGeometry args={[1, 1.4, 5]} />
        <meshStandardMaterial flatShading vertexColors />
      </instancedMesh>
    </group>
  );
}

/** Distant Dartmoor / Exmoor hills ringing the inland arc, with a hazier back row. */
function Hills() {
  const hills = useMemo(() => {
    const rng = mulberry32(7);
    const out: { x: number; z: number; width: number; height: number; color: string }[] = [];
    // Inland arc only (skip the south-eastern sea sector). Two rows for depth:
    // a near ridge and a taller, hazier far ridge.
    const rows = [
      { n: 11, rMin: 220, rMax: 320, hMin: 24, hMax: 46, wMin: 55, wMax: 120, haze: 0 },
      { n: 7, rMin: 380, rMax: 500, hMin: 40, hMax: 70, wMin: 90, wMax: 170, haze: 0.5 },
    ];
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const angle = Math.PI * (0.48 + rng() * 1.04); // ~86°..273°, inland
        const radius = row.rMin + rng() * (row.rMax - row.rMin);
        const base = HILL_COLORS[Math.floor(rng() * HILL_COLORS.length)];
        // Haze the far row toward the sky tone for aerial perspective.
        const color = new THREE.Color(base).lerp(new THREE.Color("#aac4d8"), row.haze).getStyle();
        out.push({
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          width: row.wMin + rng() * (row.wMax - row.wMin),
          height: row.hMin + rng() * (row.hMax - row.hMin),
          color,
        });
      }
    }
    return out;
  }, []);

  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, h.height / 2 - 1, h.z]} castShadow>
          <coneGeometry args={[h.width, h.height, 6]} />
          <meshStandardMaterial color={h.color} flatShading />
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
      <Fields />
      <Hills />
      <Trees />
    </group>
  );
}
