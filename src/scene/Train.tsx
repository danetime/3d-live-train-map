/** A single low-poly train that rides its line's spline. */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Train as TrainModel } from "../data/types";
import { LINE_BY_ID } from "../data/network";
import { branchOffset, lineStopParams } from "../data/lineCurves";
import { lineTToEdge, edgePointAt, edgeTangentAt } from "../data/trackGraph";
import { project } from "../data/geo";
import { platformStandWorld } from "../data/stationLayouts";
import { GAUGE } from "./RailNetwork";
import { useTrainStore } from "../store/useTrainStore";
import { trainPositions } from "../sim/trainPositions";

const RIDE_HEIGHT = 0.9;
const SYNC_INTERVAL = 0.4; // seconds between store updates for the HUD
const CARRIAGE_Z = [-2.2, 0, 2.2];

/** Three blocky carriages on bogies, with a cab nose at the front. Faces +Z. */
function TrainBody({ color, selected }: { color: string; selected: boolean }) {
  const emissive = selected ? color : "#000000";
  const emissiveIntensity = selected ? 0.65 : 0;
  const roof = useMemo(() => new THREE.Color(color).multiplyScalar(0.72), [color]);

  return (
    <group>
      {/* Continuous dark underframe running the length of the train */}
      <mesh position={[0, -0.02, 0]} castShadow>
        <boxGeometry args={[1.18, 0.28, 6.7]} />
        <meshStandardMaterial color="#2d3748" flatShading />
      </mesh>

      {CARRIAGE_Z.map((z, i) => {
        const isFront = i === CARRIAGE_Z.length - 1;
        return (
          <group key={z} position={[0, 0, z]}>
            {/* Carriage body */}
            <mesh position={[0, 0.5, 0]} castShadow>
              <boxGeometry args={[1.3, 1.0, isFront ? 1.7 : 1.95]} />
              <meshStandardMaterial
                color={color}
                flatShading
                emissive={emissive}
                emissiveIntensity={emissiveIntensity}
              />
            </mesh>
            {/* Roof cap */}
            <mesh position={[0, 1.06, 0]} castShadow>
              <boxGeometry args={[1.12, 0.18, isFront ? 1.55 : 1.8]} />
              <meshStandardMaterial color={roof} flatShading />
            </mesh>
            {/* Window strip (pokes through both sides) */}
            <mesh position={[0, 0.62, 0]}>
              <boxGeometry args={[1.36, 0.4, isFront ? 1.2 : 1.45]} />
              <meshStandardMaterial color="#cfe8ff" flatShading />
            </mesh>
            {/* Bogies */}
            {[-0.62, 0.62].map((bz) => (
              <mesh key={bz} position={[0, -0.18, bz]} castShadow>
                <boxGeometry args={[1.04, 0.34, 0.5]} />
                <meshStandardMaterial color="#1a202c" flatShading />
              </mesh>
            ))}

            {/* Cab nose + headlights on the leading carriage */}
            {isFront && (
              <group>
                <mesh position={[0, 0.42, 1.0]} castShadow>
                  <boxGeometry args={[1.26, 0.84, 0.6]} />
                  <meshStandardMaterial
                    color={color}
                    flatShading
                    emissive={emissive}
                    emissiveIntensity={emissiveIntensity}
                  />
                </mesh>
                {/* Sloped windscreen */}
                <mesh position={[0, 0.78, 0.92]} rotation={[-0.5, 0, 0]}>
                  <boxGeometry args={[1.18, 0.46, 0.18]} />
                  <meshStandardMaterial color="#1f2937" flatShading />
                </mesh>
                {[-0.42, 0.42].map((hx) => (
                  <mesh key={hx} position={[hx, 0.18, 1.32]}>
                    <boxGeometry args={[0.2, 0.2, 0.12]} />
                    <meshStandardMaterial color="#fff6c0" emissive="#fff2a0" emissiveIntensity={1.2} />
                  </mesh>
                ))}
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Single-carriage pill used in the Signal theme — proportionate to the map
 * (a true-scale carriage would be invisible; a detailed loco ~1.5 km long).
 * Faces +Z. Detail builds with the camera's `detailLevel` (the same 0–3 zoom
 * levels that drive signals/station detail): far away it's a clean coloured
 * pill, closer in it gains a window band and head/tail lights so you can read
 * the direction of travel. Later: carriage count from the NR feed.
 */
function PillCarriage({
  color,
  selected,
  detail,
}: {
  color: string;
  selected: boolean;
  detail: number;
}) {
  const roof = useMemo(() => new THREE.Color(color).multiplyScalar(0.6), [color]);
  return (
    <group position={[0, -0.3, 0]}>
      {/* Carriage body: a pill lying along the direction of travel. Modest
          emissive so the line colour reads instead of blowing out to white. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.3, 1.5, 6, 14]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.9 : 0.3}
        />
      </mesh>

      {detail >= 2 && (
        <group>
          {/* Window band poking through both flanks */}
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.64, 0.16, 1.35]} />
            <meshStandardMaterial color="#d7e7f8" emissive="#9fc4e8" emissiveIntensity={0.35} />
          </mesh>
          {/* Headlight (front, +Z) and tail light (rear) */}
          <mesh position={[0, 0, 1.06]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#fff6c0" emissive="#ffefa0" emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[0, 0, -1.06]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#ff5a5a" emissive="#ff3030" emissiveIntensity={1.2} />
          </mesh>
        </group>
      )}

      {detail >= 3 && (
        /* Roof stripe — a darker top line that sells "carriage" up close */
        <mesh position={[0, 0.26, 0]}>
          <boxGeometry args={[0.34, 0.08, 1.45]} />
          <meshStandardMaterial color={roof} />
        </mesh>
      )}
    </group>
  );
}

/** Traksy-style headcode plate that floats above the train and faces the camera. */
function HeadcodeLabel({ code, selected }: { code: string; selected: boolean }) {
  const width = useMemo(() => code.length * 0.62 + 0.7, [code]);
  return (
    <Billboard position={[0, 2.7, 0]}>
      <mesh>
        <planeGeometry args={[width, 1.15]} />
        <meshBasicMaterial color={selected ? "#143d16" : "#0c0c0c"} transparent opacity={0.88} />
      </mesh>
      <Text
        position={[0, 0, 0.01]}
        fontSize={0.82}
        color="#3dff62"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.06}
      >
        {code}
      </Text>
    </Billboard>
  );
}

/** Ease an angle toward a target by fraction k, taking the short way round. */
function easeAngle(cur: number, target: number, k: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return cur + d * k;
}

export function Train({ train }: { train: TrainModel }) {
  const groupRef = useRef<THREE.Group>(null);
  const tRef = useRef(train.t);
  const dirRef = useRef<1 | -1>(train.direction);
  const sinceSync = useRef(0);
  const placed = useRef(false);

  const selectedId = useTrainStore((s) => s.selectedId);
  const signal = useTrainStore((s) => s.theme) === "dev";
  const detailLevel = useTrainStore((s) => s.detailLevel);
  const advance = useTrainStore((s) => s.advance);
  const select = useTrainStore((s) => s.select);

  const line = LINE_BY_ID.get(train.lineId)!;
  const selected = selectedId === train.id;

  // Scratch vectors reused each frame to avoid allocations.
  const pos = useMemo(() => new THREE.Vector3(), []);
  const tangent = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    let syncHeading = train.headingTo;

    // Standing at a modelled station platform? Park on that platform's lane
    // (overrides the spline point, where every berth of the station collapses
    // onto one dot and trains stack).
    const stand =
      !train.pos && train.station && train.platform
        ? platformStandWorld(train.station, train.platform, pos)
        : null;

    if (train.pos) {
      // Point mode: we have exact berth coordinates. Ease to the position and
      // face the direction of travel (derived from how it's moving).
      project(train.pos, pos);
      if (!placed.current) {
        group.position.set(pos.x, RIDE_HEIGHT, pos.z);
        placed.current = true;
      }
      const dx = pos.x - group.position.x;
      const dz = pos.z - group.position.z;
      const k = Math.min(delta * 1.8, 1);
      group.position.set(group.position.x + dx * k, RIDE_HEIGHT, group.position.z + dz * k);
      if (Math.hypot(dx, dz) > 0.02) {
        group.rotation.y = easeAngle(group.rotation.y, Math.atan2(dx, dz), 0.25);
      }
    } else if (stand) {
      // Platform mode: glide from wherever we are onto the platform lane and
      // settle facing the through axis (by direction of travel). Keep tRef
      // tracking the feed so departure resumes the spline without a jump.
      if (!placed.current) {
        group.position.set(pos.x, RIDE_HEIGHT, pos.z);
        placed.current = true;
      }
      const dx = pos.x - group.position.x;
      const dz = pos.z - group.position.z;
      const k = Math.min(delta * 1.8, 1);
      group.position.set(group.position.x + dx * k, RIDE_HEIGHT, group.position.z + dz * k);
      dirRef.current = train.direction;
      tRef.current += (train.t - tRef.current) * Math.min(delta * 2, 1);
      const heading = stand.heading + (dirRef.current === 1 ? 0 : Math.PI);
      group.rotation.y = easeAngle(group.rotation.y, heading, Math.min(delta * 4, 1));
    } else {
      // Spline mode. Mock trains self-propel (speed > 0); a live feed sets
      // speed 0 and updates train.t externally, which we ease toward.
      if (train.speed > 0) {
        tRef.current += dirRef.current * train.speed * Math.min(delta, 0.1);
      } else {
        tRef.current += (train.t - tRef.current) * Math.min(delta * 2, 1);
        dirRef.current = train.direction;
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
      // Resolve position + tangent via the track graph's edge for this (line, t)
      // — trains ride the graph, not the monolithic line spline, so when edges
      // gain their own geometry (junction rework) trains follow without changes
      // here. Identical today: edges are t-ranges on the same curve. The lateral
      // rail offset stays line/t-based for now (revisited with edge geometry).
      const { edge, s } = lineTToEdge(line.id, t)!;
      edgePointAt(edge, s, pos);
      edgeTangentAt(edge, s, tangent); // raw tangent
      const dir = dirRef.current;
      // Double-track EDGES ride the rail for the current direction (so a
      // part-double line like Exmouth splits onto rails only where it's double).
      // A branch that shares the double-track trunk (the Riviera line, Exeter→
      // Newton Abbot) rides the trunk's up/down rail until it peels off at its
      // branch stop; beyond that it follows the single-track centreline.
      let lat: number;
      if (edge.doubleTrack) {
        lat = GAUGE * dir;
      } else if (line.drawFrom) {
        const tBranch = lineStopParams(line.id)[line.stops.indexOf(line.drawFrom)];
        lat = t < tBranch ? GAUGE * dir : branchOffset(line, t);
      } else {
        lat = 0;
      }
      if (lat !== 0) {
        pos.x += tangent.z * lat;
        pos.z += -tangent.x * lat;
      }
      group.position.set(pos.x, RIDE_HEIGHT, pos.z);
      group.rotation.y = Math.atan2(tangent.x * dir, tangent.z * dir);
      placed.current = true; // a later platform/point mode glides from here

      // Mock trains flip heading at the termini; live trains keep the feed's.
      syncHeading =
        train.speed > 0
          ? dirRef.current === 1
            ? line.destination
            : "Exeter St David's"
          : train.headingTo;
    }

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
          t: train.pos ? train.t : tRef.current,
          direction: train.pos ? train.direction : dirRef.current,
          headingTo: syncHeading,
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
      {signal ? (
        <PillCarriage color={line.color} selected={selected} detail={detailLevel} />
      ) : (
        <TrainBody color={line.color} selected={selected} />
      )}
      <HeadcodeLabel code={train.headcode} selected={selected} />
    </group>
  );
}
