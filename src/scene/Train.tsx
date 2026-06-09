/** A single low-poly train that rides its line's spline. */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Train as TrainModel } from "../data/types";
import { LINE_BY_ID } from "../data/network";
import { lineCurve } from "../data/lineCurves";
import { useTrainStore } from "../store/useTrainStore";
import { trainPositions } from "../sim/trainPositions";

const RIDE_HEIGHT = 1.2;
const SYNC_INTERVAL = 0.4; // seconds between store updates for the HUD

/** Three blocky carriages with a cab at the front. Faces +Z. */
function TrainBody({ color, selected }: { color: string; selected: boolean }) {
  const emissive = selected ? color : "#000000";
  const emissiveIntensity = selected ? 0.6 : 0;
  return (
    <group>
      {[-2.1, 0, 2.1].map((z, i) => (
        <group key={z} position={[0, 0, z]}>
          {/* Carriage body */}
          <mesh castShadow>
            <boxGeometry args={[1.3, 1.3, 1.9]} />
            <meshStandardMaterial
              color={color}
              flatShading
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* Window strip */}
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[1.34, 0.45, 1.4]} />
            <meshStandardMaterial color="#cfe8ff" flatShading />
          </mesh>
          {/* Cab wedge on the leading carriage */}
          {i === 2 && (
            <mesh position={[0, 0.1, 1.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.65, 0.65, 1.3, 4]} />
              <meshStandardMaterial color={color} flatShading />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

export function Train({ train }: { train: TrainModel }) {
  const groupRef = useRef<THREE.Group>(null);
  const tRef = useRef(train.t);
  const dirRef = useRef<1 | -1>(train.direction);
  const sinceSync = useRef(0);

  const selectedId = useTrainStore((s) => s.selectedId);
  const advance = useTrainStore((s) => s.advance);
  const select = useTrainStore((s) => s.select);

  const curve = useMemo(() => lineCurve(train.lineId), [train.lineId]);
  const line = LINE_BY_ID.get(train.lineId)!;
  const selected = selectedId === train.id;

  // Scratch vectors reused each frame to avoid allocations.
  const pos = useMemo(() => new THREE.Vector3(), []);
  const tangent = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // Advance along the spline. Mock trains self-propel (speed > 0); a real
    // feed would set speed 0 and update train.t externally, which we'd ease to.
    if (train.speed > 0) {
      tRef.current += dirRef.current * train.speed * Math.min(delta, 0.1);
    } else {
      tRef.current += (train.t - tRef.current) * Math.min(delta * 2, 1);
    }

    // Bounce off the ends of the line (turnaround at the termini).
    if (tRef.current >= 1) {
      tRef.current = 1;
      dirRef.current = -1;
    } else if (tRef.current <= 0) {
      tRef.current = 0;
      dirRef.current = 1;
    }

    const t = THREE.MathUtils.clamp(tRef.current, 0.0001, 0.9999);
    curve.getPointAt(t, pos);
    curve.getTangentAt(t, tangent).multiplyScalar(dirRef.current);

    group.position.set(pos.x, RIDE_HEIGHT, pos.z);
    group.rotation.y = Math.atan2(tangent.x, tangent.z);

    let entry = trainPositions.get(train.id);
    if (!entry) {
      entry = new THREE.Vector3();
      trainPositions.set(train.id, entry);
    }
    entry.copy(group.position);

    // Periodically publish state for the HUD / camera focus.
    sinceSync.current += delta;
    if (sinceSync.current >= SYNC_INTERVAL) {
      sinceSync.current = 0;
      advance([
        {
          id: train.id,
          t: tRef.current,
          direction: dirRef.current,
          headingTo: dirRef.current === 1 ? line.destination : "Exeter St David's",
        },
      ]);
    }
  });

  return (
    <group
      ref={groupRef}
      scale={selected ? 1.25 : 1}
      onClick={(e) => {
        e.stopPropagation();
        select(train.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <TrainBody color={line.color} selected={selected} />
    </group>
  );
}
