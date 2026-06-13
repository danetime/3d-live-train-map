/**
 * Exeter St David's, modelled on the GWR diagram 12-12 and the Traksy layout.
 *
 * Six platform faces as three islands, laid out parallel to the main line and
 * with it running straight through the middle — like the real diagram — plus
 * the North Bay and Hyde Park Siding at the north end. Compact and aligned to
 * the through-axis (the smooth Taunton↔Plymouth direction at St David's), so it
 * reads as a tidy station rather than bars crossing the lines at an angle.
 *
 * The frame (origin + rotation) and the per-platform track lanes live in
 * data/stationLayouts.ts — shared with the Train renderer, so trains park
 * exactly beside the face whose number they carry. Each number is drawn at the
 * island edge of the face it labels. Clicking the station opens the platform
 * panel and the bird's-eye camera.
 */
import { Text } from "@react-three/drei";
import { stationLayout } from "../data/stationLayouts";
import { useTrainStore } from "../store/useTrainStore";

const PLAT_LEN = 3.4;
const ISLAND_W = 0.55;
const ISLANDS = [-1.35, 0, 1.35]; // local X of the three islands
/** Each platform face: its number, the island it's on, and which side (−1 =
 *  east/P1 side, +1 = west) — matching the lanes in stationLayouts.ts. */
const FACES: { n: string; island: number; side: -1 | 1 }[] = [
  { n: "1", island: -1.35, side: -1 },
  { n: "2", island: -1.35, side: 1 },
  { n: "3", island: 0, side: -1 },
  { n: "4", island: 0, side: 1 },
  { n: "5", island: 1.35, side: -1 },
  { n: "6", island: 1.35, side: 1 },
];

function PlatNum({ n, x, z }: { n: string; x: number; z: number }) {
  return (
    <Text
      position={[x, 0.42, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.46}
      color="#3a2410"
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.04}
      outlineColor="#f6ad55"
    >
      {n}
    </Text>
  );
}

export function StationDetail() {
  const selectStation = useTrainStore((s) => s.selectStation);
  const lay = stationLayout("EXD")!;
  const { pos, rotY } = lay;

  return (
    <group
      position={[pos.x, 0.04, pos.z]}
      rotation={[0, rotY, 0]}
      onClick={(e) => {
        e.stopPropagation();
        selectStation("EXD");
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      {/* Crisp station base, snug around the platforms */}
      <mesh position={[0, 0.18, 0]} receiveShadow>
        <boxGeometry args={[3.7, 0.12, PLAT_LEN + 1.1]} />
        <meshStandardMaterial color="#2f3742" flatShading />
      </mesh>

      {/* Three island platforms */}
      {ISLANDS.map((x) => (
        <mesh key={x} position={[x, 0.32, 0]} castShadow receiveShadow>
          <boxGeometry args={[ISLAND_W, 0.26, PLAT_LEN]} />
          <meshStandardMaterial color="#f6ad55" flatShading />
        </mesh>
      ))}
      {/* Numbers sit on the island edge beside the track they serve, staggered
          along the platform so neighbouring numbers don't collide. */}
      {FACES.map((f) => (
        <PlatNum key={f.n} n={f.n} x={f.island + f.side * 0.16} z={f.side * 0.9} />
      ))}

      {/* North Bay terminal + Hyde Park Siding stub at the north (−Z) end */}
      <mesh position={[-1.35, 0.32, -PLAT_LEN / 2 - 1.0]} castShadow receiveShadow>
        <boxGeometry args={[ISLAND_W, 0.26, 1.4]} />
        <meshStandardMaterial color="#ed8936" flatShading />
      </mesh>
      <mesh position={[-2.1, 0.26, -PLAT_LEN / 2 - 1.0]} receiveShadow>
        <boxGeometry args={[0.5, 0.14, 1.2]} />
        <meshStandardMaterial color="#3a4250" flatShading />
      </mesh>
    </group>
  );
}
