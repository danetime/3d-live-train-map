/**
 * Lineside signals with red/green aspects — the defining Traksy feature.
 *
 * Every line gets signals in BOTH directions: the down rail (away from Exeter)
 * and the up rail (towards Exeter) each have their own posts, placed beyond the
 * rail they apply to. Each signal protects the block ahead of it in its
 * direction of travel — RED while a train is in the block, GREEN otherwise.
 * On double-track lines only same-direction trains occupy a signal's rail; on
 * single-track branches any train in the block puts the signal to red.
 *
 * Each signal has a number (e.g. "E218" — down signals even, up signals odd,
 * like real schemes) and is clickable: the HUD shows its id, line, direction
 * and live aspect.
 */
import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { LINES } from "../data/network";
import { lineCurve, lineStopParams, branchOffset } from "../data/lineCurves";
import { useTrainStore } from "../store/useTrainStore";
import { GAUGE } from "./RailNetwork";

const SPACING = 7; // world units between signals (per direction)
const RED = new THREE.Color("#ff3b30");
const GREEN = new THREE.Color("#22c55e");

type Sig = {
  id: string;
  lineId: string;
  dir: 1 | -1;
  /** Block protected by this signal, as [lo, hi] in line t-space. */
  lo: number;
  hi: number;
  doubleTrack: boolean;
};

export function Signals() {
  const { signals, postMatrices, lampMatrices } = useMemo(() => {
    const signals: Sig[] = [];
    const postMatrices: THREE.Matrix4[] = [];
    const lampMatrices: THREE.Matrix4[] = [];
    const o = new THREE.Object3D();
    const p = new THREE.Vector3();
    const tan = new THREE.Vector3();

    LINES.forEach((line, lineIdx) => {
      const curve = lineCurve(line.id);
      const tStart = line.drawFrom
        ? lineStopParams(line.id)[line.stops.indexOf(line.drawFrom)]
        : 0;
      const count = Math.max(2, Math.floor(curve.getLength() / SPACING));

      for (const dir of [1, -1] as const) {
        let seq = 0;
        for (let i = 1; i < count; i++) {
          const t = i / count;
          if (t < tStart) continue; // don't signal the undrawn shared trunk
          curve.getPointAt(t, p);
          curve.getTangentAt(t, tan);

          // Post sits beyond the rail it applies to: the dir-rail is at
          // lateral dir*GAUGE (double track), following any branch offset.
          const lateral =
            (line.doubleTrack ? GAUGE : 0) * dir +
            branchOffset(line, t) +
            dir * 0.95;
          const x = p.x + tan.z * lateral;
          const z = p.z - tan.x * lateral;

          o.position.set(x, 0.7, z);
          o.rotation.set(0, 0, 0);
          o.scale.set(1, 1, 1);
          o.updateMatrix();
          postMatrices.push(o.matrix.clone());

          o.position.set(x, 1.55, z);
          o.updateMatrix();
          lampMatrices.push(o.matrix.clone());

          // Down (dir +1) even numbers, up odd — loosely like real schemes.
          const num = (lineIdx + 1) * 100 + 2 * seq++ + (dir === 1 ? 0 : 1);
          const next = dir === 1 ? (i + 1) / count : (i - 1) / count;
          signals.push({
            id: `E${num}`,
            lineId: line.id,
            dir,
            lo: Math.min(t, next) - 0.004,
            hi: Math.max(t, next) + 0.004,
            doubleTrack: !!line.doubleTrack,
          });
        }
      }
    });
    return { signals, postMatrices, lampMatrices };
  }, []);

  const lampRef = useRef<THREE.InstancedMesh | null>(null);
  const aspects = useRef<Uint8Array>(new Uint8Array(0));

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
    aspects.current = new Uint8Array(signals.length); // 0 = green, 1 = red
  };

  const onClickSignal = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const i = e.instanceId;
    if (i == null || !signals[i]) return;
    const s = signals[i];
    const st = useTrainStore.getState();
    st.selectSignal({ id: s.id, lineId: s.lineId, direction: s.dir });
    st.setSignalAspect(aspects.current[i] ? "red" : "green");
  };

  // Throttle aspect updates to a few times a second — they don't need 60fps.
  const acc = useRef(0);
  useFrame((_, delta) => {
    const mesh = lampRef.current;
    if (!mesh) return;
    acc.current += delta;
    if (acc.current < 0.2) return;
    acc.current = 0;

    const state = useTrainStore.getState();
    const byLine = new Map<string, { t: number; dir: 1 | -1 }[]>();
    for (const tr of state.trains) {
      const arr = byLine.get(tr.lineId);
      const item = { t: tr.t, dir: tr.direction };
      if (arr) arr.push(item);
      else byLine.set(tr.lineId, [item]);
    }

    for (let i = 0; i < signals.length; i++) {
      const s = signals[i];
      const ts = byLine.get(s.lineId);
      let occupied = false;
      if (ts) {
        for (const tr of ts) {
          // Double track: only trains on this signal's rail (same direction).
          if (s.doubleTrack && tr.dir !== s.dir) continue;
          if (tr.t >= s.lo && tr.t <= s.hi) {
            occupied = true;
            break;
          }
        }
      }
      aspects.current[i] = occupied ? 1 : 0;
      mesh.setColorAt(i, occupied ? RED : GREEN);

      const sel = state.selectedSignal;
      if (sel && sel.id === s.id && sel.lineId === s.lineId) {
        const aspect = occupied ? "red" : "green";
        if (state.signalAspect !== aspect) state.setSignalAspect(aspect);
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        args={[undefined, undefined, postMatrices.length]}
        ref={setPosts}
        castShadow
        onClick={onClickSignal}
      >
        <cylinderGeometry args={[0.09, 0.09, 1.4, 6]} />
        <meshStandardMaterial color="#1f2733" />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, lampMatrices.length]}
        ref={setLamps}
        onClick={onClickSignal}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[0.42, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
