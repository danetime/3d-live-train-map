/**
 * Low-poly towns: clusters of blocky buildings around each station, denser and
 * taller at the Exeter hub. Sized to match the (stylised) world scale rather
 * than true metres, and kept off the water. Rendered with instancing so a few
 * hundred buildings stay cheap.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { STATIONS } from "../data/network";
import { project } from "../data/geo";
import { isOverWater } from "../data/water";

const WALLS = ["#e3d8c4", "#d8c8aa", "#cfcabb", "#d8b89a", "#c9c1b0", "#e7ded0", "#bcc6cb"];
const ROOFS = ["#9c5a4a", "#7d4a3f", "#8a6d5b", "#5e6b73", "#6b5d52", "#a9665a"];

type Building = { x: number; z: number; w: number; d: number; h: number; wall: number; roof: number };

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateTowns(): Building[] {
  const rng = mulberry32(20240607);
  const out: Building[] = [];
  for (const station of STATIONS) {
    const c = project(station.pos);
    const isHub = !!station.hub;
    const count = isHub ? 52 : 7 + Math.floor(rng() * 11);
    const radius = isHub ? 22 : 9;
    const clearing = isHub ? 5 : 2.6;
    for (let i = 0; i < count; i++) {
      const ang = rng() * Math.PI * 2;
      const r = clearing + rng() * (radius - clearing);
      const x = c.x + Math.cos(ang) * r;
      const z = c.z + Math.sin(ang) * r;
      if (isOverWater(x, z)) continue;
      out.push({
        x,
        z,
        w: 0.6 + rng() * 1.3,
        d: 0.6 + rng() * 1.3,
        h: isHub ? 1.2 + rng() * 4.6 : 0.9 + rng() * 2.2,
        wall: Math.floor(rng() * WALLS.length),
        roof: Math.floor(rng() * ROOFS.length),
      });
    }
  }
  return out;
}

/** Ref callback that writes per-instance matrices and colours. */
function applyInstances(
  items: { matrix: THREE.Matrix4; color: THREE.Color }[],
) {
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

export function Buildings() {
  const { bodies, roofs } = useMemo(() => {
    const buildings = generateTowns();
    const o = new THREE.Object3D();
    const bodies: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
    const roofs: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
    for (const b of buildings) {
      o.position.set(b.x, b.h / 2, b.z);
      o.scale.set(b.w, b.h, b.d);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      bodies.push({ matrix: o.matrix.clone(), color: new THREE.Color(WALLS[b.wall]) });

      o.position.set(b.x, b.h + 0.18, b.z);
      o.scale.set(b.w * 1.04, 0.42, b.d * 1.04);
      o.updateMatrix();
      roofs.push({ matrix: o.matrix.clone(), color: new THREE.Color(ROOFS[b.roof]) });
    }
    return { bodies, roofs };
  }, []);

  return (
    <group>
      <instancedMesh
        args={[undefined, undefined, bodies.length]}
        ref={applyInstances(bodies)}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial flatShading vertexColors />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, roofs.length]} ref={applyInstances(roofs)} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial flatShading vertexColors />
      </instancedMesh>
    </group>
  );
}
