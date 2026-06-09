/**
 * Detailed platform layout for Exeter St David's — Traksy-style station detail.
 *
 * The layout is hand-built (like Traksy/OpenTrainTimes hand-draw their station
 * diagrams — there's no open dataset of platform-level track layouts): six
 * platform faces as three island platforms, parallel running lines, and the
 * depot/siding stubs (TMD, CS, Hyde Park Sidings). Live berth→platform data
 * comes from SMART once the Network Rail feed is active.
 */
import { Text } from "@react-three/drei";

/** Rotation aligning the station axis with the trunk through St David's. */
const ROT_Y = 0.26;
/** Running lines, west → east (local X offsets). */
const TRACKS = [-3.75, -2.25, -0.75, 0.75, 2.25, 3.75];
/** Island platforms between pairs of tracks, with their face numbers. */
const ISLANDS: { x: number; nums: [string, string] }[] = [
  { x: -3.0, nums: ["6", "5"] },
  { x: 0, nums: ["4", "3"] },
  { x: 3.0, nums: ["2", "1"] },
];
const TRACK_LEN = 14;
const PLAT_LEN = 9;

function FlatLabel({
  text,
  x,
  z,
  size = 0.55,
  color = "#1a202c",
}: {
  text: string;
  x: number;
  z: number;
  size?: number;
  color?: string;
}) {
  return (
    <Text
      position={[x, 0.66, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={size}
      color={color}
      anchorX="center"
      anchorY="middle"
    >
      {text}
    </Text>
  );
}

function Siding({
  x,
  z,
  angle,
  label,
}: {
  x: number;
  z: number;
  angle: number;
  label: string;
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, angle, 0]}>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.45, 0.12, 3.2]} />
        <meshStandardMaterial color="#8b95a3" flatShading />
      </mesh>
      <Text
        position={[0, 0.3, -2.1]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.55}
        color="#e2e8f0"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

export function StationDetail() {
  return (
    <group rotation={[0, ROT_Y, 0]}>
      {/* Station ground pad */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[11.5, 0.24, 17]} />
        <meshStandardMaterial color="#454e5a" flatShading />
      </mesh>

      {/* Running lines through the platforms */}
      {TRACKS.map((x) => (
        <mesh key={x} position={[x, 0.19, 0]} receiveShadow>
          <boxGeometry args={[0.55, 0.14, TRACK_LEN]} />
          <meshStandardMaterial color="#1f2733" flatShading />
        </mesh>
      ))}

      {/* Island platforms with face numbers (Traksy orange) */}
      {ISLANDS.map(({ x, nums }) => (
        <group key={x}>
          <mesh position={[x, 0.37, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.05, 0.5, PLAT_LEN]} />
            <meshStandardMaterial color="#f6ad55" flatShading />
          </mesh>
          <FlatLabel text={nums[0]} x={x - 0.26} z={-3.6} />
          <FlatLabel text={nums[1]} x={x + 0.26} z={3.6} />
        </group>
      ))}

      {/* Depot & sidings, as on the signalling diagram */}
      <Siding x={-5.3} z={-7.2} angle={0.5} label="TMD" />
      <Siding x={-3.4} z={-8.2} angle={0.25} label="CS" />
      <Siding x={4.6} z={7.6} angle={-0.35} label="Hyde Park Sdg" />
    </group>
  );
}
