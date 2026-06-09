/** Stylised low-poly water for the Exe estuary, the sea and the Teign estuary. */
import { useMemo } from "react";
import * as THREE from "three";
import { WATER_POLYGONS } from "../data/water";

const WATER_LEVEL = -0.18;

function waterGeometry(poly: { x: number; z: number }[]) {
  const shape = new THREE.Shape();
  poly.forEach((p, i) => {
    // Shape lives in XY; map z -> -y so a -90° X rotation lands it flat in XZ.
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  });
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export function Water() {
  const geometries = useMemo(() => WATER_POLYGONS.map(waterGeometry), []);

  return (
    <group>
      {geometries.map((geo, i) => (
        <mesh
          key={i}
          geometry={geo}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, WATER_LEVEL, 0]}
          receiveShadow
        >
          <meshStandardMaterial
            color="#2f86c5"
            transparent
            opacity={0.86}
            roughness={0.25}
            metalness={0.05}
            emissive="#15466b"
            emissiveIntensity={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
