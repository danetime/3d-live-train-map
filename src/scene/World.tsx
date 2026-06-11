/** The R3F canvas: sky, sun, camera controls and the whole scene graph. */
import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { STATIONS } from "../data/network";
import { project } from "../data/geo";
import { Ground } from "./Ground";
import { Water } from "./Water";
import { Buildings } from "./Buildings";
import { Clouds } from "./Clouds";
import { RailNetwork } from "./RailNetwork";
import { Signals } from "./Signals";
import { Stations } from "./Stations";
import { StationDetail } from "./StationDetail";
import { Trains } from "./Trains";
import { PixelEffect } from "./PixelEffect";
import { useTrainStore } from "../store/useTrainStore";
import { trainPositions } from "../sim/trainPositions";

/**
 * Isometric camera behaviour (the 2.5D pixel-art direction):
 * - Fixed isometric angle — pan and zoom only, no free tilt/orbit.
 * - Nothing selected → the whole network is framed; pan/zoom freely.
 * - Train selected → glide the view over that train and zoom in to follow it.
 */
const ISO = new THREE.Vector3(1, 1, 1).normalize();
const CAM_DIST = 1600; // ortho: sets only the view direction + near/far, not scale
const FOLLOW_ZOOM = 7; // multiple of the whole-network fit zoom

// Network bounds in world space, from the station positions (computed once).
const BOUNDS = (() => {
  const v = new THREE.Vector3();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of STATIONS) {
    project(s.pos, v);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
  }
  return {
    center: new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
    diag: maxX - minX + (maxZ - minZ), // iso footprint ≈ the X+Z diagonal
  };
})();

/** Orthographic zoom that frames the whole network for the current canvas. */
function fitZoom(w: number, h: number): number {
  return (0.78 * Math.min(w, h * 1.6)) / Math.max(BOUNDS.diag, 1);
}

/** Map zoom (relative to the fit zoom) onto a detail level (0 far … 3 close). */
function levelForZoom(ratio: number): number {
  if (ratio < 2) return 0;
  if (ratio < 4.5) return 1;
  if (ratio < 9) return 2;
  return 3;
}

function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl> }) {
  const selectedId = useTrainStore((s) => s.selectedId);
  const setDetailLevel = useTrainStore((s) => s.setDetailLevel);
  const { size } = useThree();
  const inited = useRef(false);
  const goal = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    const ctrl = controls.current;
    if (!ctrl) return;
    const cam = camera as THREE.OrthographicCamera;
    const fz = fitZoom(size.width, size.height);

    // First frame: frame the whole network at the isometric angle, and make
    // both mouse buttons pan (no orbit in a fixed-iso view).
    if (!inited.current) {
      ctrl.target.copy(BOUNDS.center);
      cam.position.copy(BOUNDS.center).addScaledVector(ISO, CAM_DIST);
      cam.zoom = fz;
      cam.updateProjectionMatrix();
      ctrl.mouseButtons.LEFT = THREE.MOUSE.PAN;
      ctrl.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      ctrl.touches.ONE = THREE.TOUCH.PAN;
      inited.current = true;
    }

    // Follow a selected train: glide the view across and zoom in.
    const target = selectedId ? trainPositions.get(selectedId) : null;
    if (target) {
      ctrl.target.lerp(target, 0.08);
      goal.current.copy(ctrl.target).addScaledVector(ISO, CAM_DIST);
      cam.position.lerp(goal.current, 0.08);
      cam.zoom += (fz * FOLLOW_ZOOM - cam.zoom) * 0.08;
      cam.updateProjectionMatrix();
    }

    setDetailLevel(levelForZoom(cam.zoom / fz));
    ctrl.update();
  });
  return null;
}

export function World() {
  const controls = useRef<OrbitControlsImpl>(null);
  const clearSelection = useTrainStore((s) => s.select);
  const clearSignal = useTrainStore((s) => s.selectSignal);
  const detailLevel = useTrainStore((s) => s.detailLevel);
  const land = useTrainStore((s) => s.theme) === "land";

  const bg = land ? "#9ad0f0" : "#0b1220";

  return (
    <Canvas
      shadows
      orthographic
      camera={{ position: [1600, 1600, 1600], near: 0.1, far: 6000, zoom: 6 }}
      onPointerMissed={() => {
        clearSelection(null);
        clearSignal(null);
      }}
    >
      <color attach="background" args={[bg]} />
      {/* No fog: under an orthographic iso camera everything sits at roughly the
          same camera distance, so distance fog would just tint the scene flatly. */}

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
      {detailLevel >= 2 && <Signals />}
      <Stations />
      {detailLevel >= 3 && <StationDetail />}
      <Trains />

      <OrbitControls
        ref={controls}
        enableDamping
        dampingFactor={0.08}
        enableRotate={false}
        enablePan
        screenSpacePanning
        panSpeed={1.1}
        minZoom={0.6}
        maxZoom={600}
      />
      <CameraRig controls={controls} />
      <PixelEffect pixelSize={5} />
    </Canvas>
  );
}
