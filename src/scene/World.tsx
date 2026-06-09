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
import { Stations } from "./Stations";
import { Trains } from "./Trains";
import { useTrainStore } from "../store/useTrainStore";
import { trainPositions } from "../sim/trainPositions";

/** Eases the orbit target toward the selected train so it stays in view. */
function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl> }) {
  const selectedId = useTrainStore((s) => s.selectedId);
  const home = useRef(new THREE.Vector3(0, 0, 0));

  useFrame(() => {
    const ctrl = controls.current;
    if (!ctrl) return;
    const target =
      (selectedId && trainPositions.get(selectedId)) || home.current;
    ctrl.target.lerp(target, 0.06);
    ctrl.update();
  });
  return null;
}

export function World() {
  const controls = useRef<OrbitControlsImpl>(null);
  const clearSelection = useTrainStore((s) => s.select);

  return (
    <Canvas
      shadows
      camera={{ position: [90, 130, 170], fov: 50, near: 0.1, far: 4000 }}
      onPointerMissed={() => clearSelection(null)}
    >
      <color attach="background" args={["#9ad0f0"]} />
      <fog attach="fog" args={["#9ad0f0", 520, 1400]} />

      <Sky sunPosition={[120, 180, 80]} turbidity={4} rayleigh={1.5} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={["#cfe9ff", "#6e9a4f", 0.6]} />
      <directionalLight
        color="#fff3df"
        position={[120, 180, 80]}
        intensity={1.7}
        castShadow
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

      <Ground />
      <Water />
      <Buildings />
      <Clouds />
      <RailNetwork />
      <Stations />
      <Trains />

      <OrbitControls
        ref={controls}
        enableDamping
        dampingFactor={0.08}
        minDistance={20}
        maxDistance={500}
        maxPolarAngle={Math.PI / 2.15}
      />
      <CameraRig controls={controls} />
    </Canvas>
  );
}
