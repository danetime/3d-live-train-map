/** The R3F canvas: sky, sun, camera controls and the whole scene graph. */
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Ground } from "./Ground";
import { Water } from "./Water";
import { Buildings } from "./Buildings";
import { Clouds } from "./Clouds";
import { RailNetwork } from "./RailNetwork";
import { Signals } from "./Signals";
import { Stations } from "./Stations";
import { StationDetail } from "./StationDetail";
import { Trains } from "./Trains";
import { useTrainStore } from "../store/useTrainStore";
import { trainPositions } from "../sim/trainPositions";

/**
 * Camera behaviour:
 * - Nothing selected → hands off: orbit, zoom and PAN freely anywhere.
 * - Train selected → fly to a top-down view of that train and follow it.
 */
const FOLLOW_OFFSET = new THREE.Vector3(0, 52, 9);

function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl> }) {
  const selectedId = useTrainStore((s) => s.selectedId);
  const goal = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    const ctrl = controls.current;
    if (!ctrl) return;
    const target = selectedId ? trainPositions.get(selectedId) : null;
    if (target) {
      ctrl.target.lerp(target, 0.08);
      goal.current.copy(target).add(FOLLOW_OFFSET);
      camera.position.lerp(goal.current, 0.06);
    }
    ctrl.update();
  });
  return null;
}

export function World() {
  const controls = useRef<OrbitControlsImpl>(null);
  const clearSelection = useTrainStore((s) => s.select);
  const clearSignal = useTrainStore((s) => s.selectSignal);
  const land = useTrainStore((s) => s.theme) === "land";

  const bg = land ? "#9ad0f0" : "#0b1220";

  return (
    <Canvas
      shadows
      camera={{ position: [90, 130, 170], fov: 50, near: 0.1, far: 4000 }}
      onPointerMissed={() => {
        clearSelection(null);
        clearSignal(null);
      }}
    >
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={land ? [bg, 520, 1400] : [bg, 900, 2600]} />

      {land && <Sky sunPosition={[120, 180, 80]} turbidity={4} rayleigh={1.5} />}
      <ambientLight intensity={land ? 0.6 : 0.95} />
      <hemisphereLight args={land ? ["#cfe9ff", "#6e9a4f", 0.6] : ["#3a4a66", "#0b1220", 0.6]} />
      <directionalLight
        color={land ? "#fff3df" : "#dce6ff"}
        position={[120, 180, 80]}
        intensity={land ? 1.7 : 0.8}
        castShadow={land}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
        shadow-camera-far={800}
        shadow-bias={-0.0004}
        shadow-radius={4}
      />
      {/* Soft fill from the opposite side so shadowed faces aren't muddy. */}
      <directionalLight color="#bcd6ff" position={[-110, 70, -90]} intensity={0.35} />

      {land ? (
        <>
          <Ground />
          <Water />
          <Buildings />
          <Clouds />
        </>
      ) : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
            <planeGeometry args={[3000, 3000]} />
            <meshStandardMaterial color="#0e1626" />
          </mesh>
          <gridHelper args={[1800, 60, "#27395a", "#16223a"]} position={[0, -0.46, 0]} />
        </>
      )}
      <RailNetwork />
      <Signals />
      <Stations />
      <StationDetail />
      <Trains />

      <OrbitControls
        ref={controls}
        enableDamping
        dampingFactor={0.08}
        enablePan
        screenSpacePanning={false}
        panSpeed={1.1}
        minDistance={12}
        maxDistance={600}
        maxPolarAngle={Math.PI / 2.15}
      />
      <CameraRig controls={controls} />
    </Canvas>
  );
}
