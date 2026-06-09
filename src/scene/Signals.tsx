/**
 * Lineside signals with red/green aspects — the defining Traksy feature.
 *
 * Signals are spaced along each drawn line; each protects the block of track
 * ahead of it (up to the next signal). A signal shows RED when a train is in its
 * block, GREEN otherwise — so as trains move, the signals behind them turn red
 * then clear, just like the real railway. Lamps are unlit (self-illuminated)
 * instanced spheres whose colours are updated each frame.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LINES } from "../data/network";
import { lineCurve, lineStopParams } from "../data/lineCurves";
import { useTrainStore } from "../store/useTrainStore";

const SPACING = 7; // world units between signals
const POST_OFFSET = 1.4; // lateral distance from the track centreline
const RED = new THREE.Color("#ff3b30");
const GREEN = new THREE.Color("#22c55e");

type Sig = { lineId: string; t0: number; t1: number };

export function Signals() {
  const { signals, postMatrices, lampMatrices } = useMemo(() => {
    const signals: Sig[] = [];
    const postMatrices: THREE.Matrix4[] = [];
    const lampMatrices: THREE.Matrix4[] = [];
    const o = new THREE.Object3D();
    const p = new THREE.Vector3();
    const tan = new THREE.Vector3();

    for (const line of LINES) {
      const curve = lineCurve(line.id);
      const tStart = line.drawFrom
        ? lineStopParams(line.id)[line.stops.indexOf(line.drawFrom)]
        : 0;
      const count = Math.max(2, Math.floor(curve.getLength() / SPACING));
      for (let i = 1; i < count; i++) {
        const t = i / count;
        if (t < tStart) continue; // don't signal the undrawn shared trunk
        curve.getPointAt(t, p);
        curve.getTangentAt(t, tan);
        const x = p.x + tan.z * POST_OFFSET;
        const z = p.z - tan.x * POST_OFFSET;

        o.position.set(x, 0.7, z);
        o.rotation.set(0, 0, 0);
        o.scale.set(1, 1, 1);
        o.updateMatrix();
        postMatrices.push(o.matrix.clone());

        o.position.set(x, 1.55, z);
        o.updateMatrix();
        lampMatrices.push(o.matrix.clone());

        signals.push({ lineId: line.id, t0: t, t1: (i + 1) / count });
      }
    }
    return { signals, postMatrices, lampMatrices };
  }, []);

  const lampRef = useRef<THREE.InstancedMesh | null>(null);

  const setPosts = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    postMatrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
  };
  const setLamps = (mesh: THREE.InstancedMesh | null) => {
    lampRef.current = mesh;
    if (!mesh) return;
    lampMatrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, GREEN);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  // Throttle aspect updates to a few times a second — they don't need 60fps.
  const acc = useRef(0);
  useFrame((_, delta) => {
    const mesh = lampRef.current;
    if (!mesh) return;
    acc.current += delta;
    if (acc.current < 0.2) return;
    acc.current = 0;

    const trains = useTrainStore.getState().trains;
    const byLine = new Map<string, number[]>();
    for (const tr of trains) {
      const arr = byLine.get(tr.lineId);
      if (arr) arr.push(tr.t);
      else byLine.set(tr.lineId, [tr.t]);
    }
    for (let i = 0; i < signals.length; i++) {
      const s = signals[i];
      const ts = byLine.get(s.lineId);
      let occupied = false;
      if (ts) {
        for (const tt of ts) {
          if (tt >= s.t0 - 0.004 && tt <= s.t1) {
            occupied = true;
            break;
          }
        }
      }
      mesh.setColorAt(i, occupied ? RED : GREEN);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh args={[undefined, undefined, postMatrices.length]} ref={setPosts} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 1.4, 6]} />
        <meshStandardMaterial color="#1f2733" />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, lampMatrices.length]} ref={setLamps}>
        <sphereGeometry args={[0.42, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
