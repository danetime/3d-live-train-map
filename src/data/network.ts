/**
 * The Exeter test network.
 *
 * Coordinates are approximate real-world lat/lng for stations and a few
 * intermediate bends, traced from OpenStreetMap / OpenRailwayMap. They don't
 * need to be perfect — the scene smooths each line into a spline, so a handful
 * of waypoints is enough to capture the shape of each route.
 *
 * To make these more accurate later, pull the `railway=rail` ways for each
 * route from the Overpass API (https://overpass-turbo.eu) and drop the
 * coordinate list in here.
 */
import type { Line, LatLng, Station } from "./types";
import lineGeometryJson from "./lineGeometry.json";

/** Central hub. Everything is positioned relative to this. */
export const ORIGIN = { lat: 50.7290, lng: -3.5435 }; // Exeter St David's

export const STATIONS: Station[] = [
  { code: "EXD", name: "Exeter St David's", pos: { lat: 50.7290, lng: -3.5435 }, hub: true },

  // Avocet line → Exmouth
  { code: "EXC", name: "Exeter Central", pos: { lat: 50.7250, lng: -3.5320 } },
  { code: "SJP", name: "St James Park", pos: { lat: 50.7273, lng: -3.5165 } },
  { code: "POL", name: "Polsloe Bridge", pos: { lat: 50.7310, lng: -3.5060 } },
  { code: "DIG", name: "Digby & Sowton", pos: { lat: 50.7090, lng: -3.4720 } },
  { code: "NCO", name: "Newcourt", pos: { lat: 50.6990, lng: -3.4660 } },
  { code: "TOP", name: "Topsham", pos: { lat: 50.6870, lng: -3.4640 } },
  { code: "EXN", name: "Exton", pos: { lat: 50.6680, lng: -3.4420 } },
  { code: "LYC", name: "Lympstone Commando", pos: { lat: 50.6580, lng: -3.4400 } },
  { code: "LYM", name: "Lympstone Village", pos: { lat: 50.6470, lng: -3.4360 } },
  { code: "EXM", name: "Exmouth", pos: { lat: 50.6190, lng: -3.4140 } },

  // Riviera line → Newton Abbot (via the Dawlish sea wall)
  { code: "EXT", name: "Exeter St Thomas", pos: { lat: 50.7160, lng: -3.5380 } },
  { code: "MRB", name: "Marsh Barton", pos: { lat: 50.7060, lng: -3.5260 } },
  { code: "SCS", name: "Starcross", pos: { lat: 50.6280, lng: -3.4490 } },
  { code: "DWW", name: "Dawlish Warren", pos: { lat: 50.5990, lng: -3.4430 } },
  { code: "DWL", name: "Dawlish", pos: { lat: 50.5810, lng: -3.4660 } },
  { code: "TGM", name: "Teignmouth", pos: { lat: 50.5470, lng: -3.4960 } },
  { code: "NTA", name: "Newton Abbot", pos: { lat: 50.5290, lng: -3.6000 } },

  // Main line SW → Plymouth (continues beyond Newton Abbot)
  { code: "TOT", name: "Totnes", pos: { lat: 50.4255, lng: -3.6888 } },
  { code: "IVY", name: "Ivybridge", pos: { lat: 50.3917, lng: -3.9136 } },
  { code: "PLY", name: "Plymouth", pos: { lat: 50.3779, lng: -4.1426 } },

  // Riviera/Torbay branch → Paignton (branches at Newton Abbot)
  { code: "TRR", name: "Torre", pos: { lat: 50.4719, lng: -3.5402 } },
  { code: "TQY", name: "Torquay", pos: { lat: 50.4540, lng: -3.5436 } },
  { code: "PGN", name: "Paignton", pos: { lat: 50.4352, lng: -3.5606 } },

  // Main line NE → Taunton
  { code: "TVP", name: "Tiverton Parkway", pos: { lat: 50.9170, lng: -3.3640 } },
  { code: "TAU", name: "Taunton", pos: { lat: 51.0250, lng: -3.1015 } },

  // Tarka line → Barnstaple
  { code: "NTC", name: "Newton St Cyres", pos: { lat: 50.7790, lng: -3.5870 } },
  { code: "CDF", name: "Crediton", pos: { lat: 50.7900, lng: -3.6480 } },
  { code: "YEO", name: "Yeoford", pos: { lat: 50.7790, lng: -3.7080 } },
  { code: "COP", name: "Copplestone", pos: { lat: 50.8060, lng: -3.7510 } },
  { code: "MRD", name: "Morchard Road", pos: { lat: 50.8270, lng: -3.7790 } },
  { code: "LAP", name: "Lapford", pos: { lat: 50.8580, lng: -3.8030 } },
  { code: "EGG", name: "Eggesford", pos: { lat: 50.8870, lng: -3.8780 } },
  { code: "KIG", name: "Kings Nympton", pos: { lat: 50.9420, lng: -3.9080 } },
  { code: "POR", name: "Portsmouth Arms", pos: { lat: 50.9650, lng: -3.9400 } },
  { code: "UMB", name: "Umberleigh", pos: { lat: 50.9970, lng: -3.9760 } },
  { code: "CPN", name: "Chapelton", pos: { lat: 51.0300, lng: -4.0100 } },
  { code: "BNP", name: "Barnstaple", pos: { lat: 51.0760, lng: -4.0640 } },

  // Dartmoor line → Okehampton (branches off the Tarka line at Coleford Jn)
  { code: "SPC", name: "Sampford Courtenay", pos: { lat: 50.7740, lng: -3.9100 } },
  { code: "OKE", name: "Okehampton", pos: { lat: 50.7340, lng: -4.0000 } },
];

const STATION_BY_CODE = new Map(STATIONS.map((s) => [s.code, s]));

export const stationPos = (code: string): LatLng => {
  const s = STATION_BY_CODE.get(code);
  if (!s) throw new Error(`Unknown station code: ${code}`);
  return s.pos;
};

/**
 * Drawing geometry per line, denser than the stops so the track follows the
 * real route's curves. Generated geometry from OpenStreetMap (lineGeometry.json,
 * produced by scripts/fetchTrackGeometry.mjs) wins; then these hand-traced
 * points; otherwise we fall back to a straightish line through the stops.
 */
/**
 * Shared Exeter→Newton Abbot trunk: down the west bank of the Exe, along the
 * Dawlish sea wall, then up the Teign estuary. Used by both SW lines.
 */
const TRUNK_SW: LatLng[] = [
  { lat: 50.7290, lng: -3.5435 }, // Exeter St David's
  { lat: 50.7160, lng: -3.5380 }, // Exeter St Thomas
  { lat: 50.7060, lng: -3.5260 }, // Marsh Barton
  { lat: 50.6920, lng: -3.5050 }, // Countess Wear
  { lat: 50.6790, lng: -3.4950 }, // Exminster
  { lat: 50.6520, lng: -3.4620 }, // Powderham
  { lat: 50.6280, lng: -3.4490 }, // Starcross
  { lat: 50.5990, lng: -3.4430 }, // Dawlish Warren
  { lat: 50.5900, lng: -3.4480 }, // the sea wall
  { lat: 50.5810, lng: -3.4660 }, // Dawlish
  { lat: 50.5660, lng: -3.4800 }, // Parson's Tunnel
  { lat: 50.5470, lng: -3.4960 }, // Teignmouth
  { lat: 50.5450, lng: -3.5260 }, // Teign north bank
  { lat: 50.5400, lng: -3.5640 }, // Bishopsteignton
  { lat: 50.5290, lng: -3.6000 }, // Newton Abbot
];

const HAND_GEOMETRY: Record<string, LatLng[]> = {
  // Avocet line: out through Exeter Central, then south down the east bank of
  // the Exe estuary, hugging the shore through Lympstone.
  exmouth: [
    { lat: 50.7290, lng: -3.5435 }, // Exeter St David's
    { lat: 50.7265, lng: -3.5370 },
    { lat: 50.7250, lng: -3.5320 }, // Exeter Central
    { lat: 50.7273, lng: -3.5165 }, // St James' Park
    { lat: 50.7310, lng: -3.5060 }, // Polsloe Bridge
    { lat: 50.7280, lng: -3.4920 },
    { lat: 50.7180, lng: -3.4790 },
    { lat: 50.7090, lng: -3.4720 }, // Digby & Sowton
    { lat: 50.6990, lng: -3.4660 }, // Newcourt
    { lat: 50.6870, lng: -3.4640 }, // Topsham
    { lat: 50.6760, lng: -3.4585 }, // estuary east bank
    { lat: 50.6680, lng: -3.4420 }, // Exton
    { lat: 50.6580, lng: -3.4400 }, // Lympstone Commando
    { lat: 50.6470, lng: -3.4360 }, // Lympstone Village
    { lat: 50.6330, lng: -3.4250 }, // shore curve
    { lat: 50.6190, lng: -3.4140 }, // Exmouth
  ],
  // Main line beyond Newton Abbot: over Dainton bank, Totnes, the South Devon
  // banks past South Brent/Ivybridge, then Plympton and Laira into Plymouth.
  "newton-abbot": [
    ...TRUNK_SW,
    { lat: 50.5150, lng: -3.6300 }, // Aller
    { lat: 50.5050, lng: -3.6650 }, // Dainton bank
    { lat: 50.4830, lng: -3.6900 }, // Stoneycombe
    { lat: 50.4500, lng: -3.6870 },
    { lat: 50.4255, lng: -3.6888 }, // Totnes
    { lat: 50.4230, lng: -3.7350 }, // Rattery climb
    { lat: 50.4290, lng: -3.7900 }, // Rattery
    { lat: 50.4250, lng: -3.8330 }, // South Brent
    { lat: 50.4090, lng: -3.8780 }, // Wrangaton
    { lat: 50.3917, lng: -3.9136 }, // Ivybridge
    { lat: 50.3870, lng: -3.9700 },
    { lat: 50.3855, lng: -4.0200 }, // Hemerdon bank
    { lat: 50.3860, lng: -4.0660 }, // Plympton
    { lat: 50.3690, lng: -4.1050 }, // Laira, along the Plym
    { lat: 50.3720, lng: -4.1300 }, // Lipson curve
    { lat: 50.3779, lng: -4.1426 }, // Plymouth
  ],
  // Torbay branch: south from Newton Abbot through Kingskerswell to the coast.
  paignton: [
    ...TRUNK_SW, // shared trunk — branch leaves at Newton Abbot
    { lat: 50.5160, lng: -3.5930 }, // Aller Jn, curving south
    { lat: 50.5030, lng: -3.5870 }, // Kingskerswell
    { lat: 50.4870, lng: -3.5680 }, // Edginswell
    { lat: 50.4719, lng: -3.5402 }, // Torre
    { lat: 50.4540, lng: -3.5436 }, // Torquay
    { lat: 50.4450, lng: -3.5560 }, // Hollicombe shore
    { lat: 50.4352, lng: -3.5606 }, // Paignton
  ],
  // Tarka line: out of Exeter to Cowley Bridge Jn, up the Creedy valley to
  // Crediton/Yeoford, then north over the watershed and down the Taw valley.
  barnstaple: [
    { lat: 50.7290, lng: -3.5435 }, // Exeter St David's
    { lat: 50.7430, lng: -3.5505 }, // Cowley Bridge Jn
    { lat: 50.7560, lng: -3.5650 }, // Creedy valley
    { lat: 50.7690, lng: -3.5760 },
    { lat: 50.7790, lng: -3.5870 }, // Newton St Cyres
    { lat: 50.7840, lng: -3.6150 },
    { lat: 50.7900, lng: -3.6480 }, // Crediton
    { lat: 50.7870, lng: -3.6800 },
    { lat: 50.7790, lng: -3.7080 }, // Yeoford
    { lat: 50.7920, lng: -3.7400 }, // turning north at Coleford Jn
    { lat: 50.8060, lng: -3.7510 }, // Copplestone
    { lat: 50.8270, lng: -3.7790 }, // Morchard Road
    { lat: 50.8580, lng: -3.8030 }, // Lapford
    { lat: 50.8720, lng: -3.8400 }, // Taw valley
    { lat: 50.8870, lng: -3.8780 }, // Eggesford
    { lat: 50.9100, lng: -3.8900 },
    { lat: 50.9420, lng: -3.9080 }, // Kings Nympton
    { lat: 50.9650, lng: -3.9398 }, // Portsmouth Arms
    { lat: 50.9970, lng: -3.9760 }, // Umberleigh
    { lat: 51.0300, lng: -4.0100 }, // Chapelton
    { lat: 51.0550, lng: -4.0500 },
    { lat: 51.0760, lng: -4.0640 }, // Barnstaple
  ],
  // GWR main line up the Culm valley — the stops alone made it near-straight.
  taunton: [
    { lat: 50.7290, lng: -3.5435 }, // Exeter St David's
    { lat: 50.7430, lng: -3.5505 }, // Cowley Bridge Jn
    { lat: 50.7570, lng: -3.5050 }, // Stoke Canon
    { lat: 50.7900, lng: -3.4750 }, // Silverton
    { lat: 50.8120, lng: -3.4520 }, // Hele & Bradninch
    { lat: 50.8550, lng: -3.3920 }, // Cullompton
    { lat: 50.9170, lng: -3.3640 }, // Tiverton Parkway
    { lat: 50.9400, lng: -3.3250 }, // Whiteball
    { lat: 50.9750, lng: -3.2250 }, // Wellington
    { lat: 51.0150, lng: -3.1500 }, // Norton Fitzwarren
    { lat: 51.0250, lng: -3.1015 }, // Taunton
  ],
};

const osmGeometry = lineGeometryJson as Record<string, [number, number][]>;

/**
 * Geometry that overrides even the real OSM track. Used for clean schematic
 * branches: the real Dartmoor line shares rails with the Tarka line through
 * Yeoford to Coleford Junction, which looks tangled on the diagram — so we
 * fork it cleanly off the trunk at Crediton and run it just south of Yeoford
 * through Bow and North Tawton to Okehampton.
 */
const FORCE_GEOMETRY: Record<string, LatLng[]> = {
  okehampton: [
    { lat: 50.7290, lng: -3.5435 }, // Exeter St David's (shared trunk)
    { lat: 50.7430, lng: -3.5505 }, // Cowley Bridge Jn
    { lat: 50.7560, lng: -3.5650 },
    { lat: 50.7690, lng: -3.5760 },
    { lat: 50.7790, lng: -3.5870 }, // Newton St Cyres
    { lat: 50.7840, lng: -3.6150 },
    { lat: 50.7900, lng: -3.6480 }, // Crediton — fork left here
    { lat: 50.7800, lng: -3.6900 }, // peeling south-west
    { lat: 50.7740, lng: -3.7300 }, // south of Yeoford
    { lat: 50.7800, lng: -3.7900 }, // Bow
    { lat: 50.7860, lng: -3.8600 }, // North Tawton
    { lat: 50.7740, lng: -3.9100 }, // Sampford Courtenay
    { lat: 50.7500, lng: -3.9700 },
    { lat: 50.7340, lng: -4.0000 }, // Okehampton
  ],
};

function geometryFor(id: string, stops: string[]): LatLng[] {
  // Verified, baked geometry is the source of truth — reliable and independent
  // of the (flaky) OSM fetch. OSM is only a fallback for any line we haven't
  // hand-traced, and only if it actually reaches that line's terminus.
  if (FORCE_GEOMETRY[id]) return FORCE_GEOMETRY[id];
  if (HAND_GEOMETRY[id]) return HAND_GEOMETRY[id];
  const osm = osmGeometry[id];
  if (osm && osm.length > 1) {
    const last = osm[osm.length - 1];
    const term = stationPos(stops[stops.length - 1]);
    const reaches = Math.abs(last[0] - term.lat) + Math.abs(last[1] - term.lng) <= 0.04;
    if (reaches) return osm.map(([lat, lng]) => ({ lat, lng }));
    console.warn(`[map] lineGeometry.json for "${id}" stops short — using fallback`);
  }
  return stops.map(stationPos);
}

/** Define a line from an ordered list of CRS codes (Exeter outwards). */
const line = (
  id: string,
  name: string,
  destination: string,
  color: string,
  stops: string[],
  opts: { doubleTrack?: boolean; drawFrom?: string; drawOffset?: number } = {},
): Line => ({ id, name, destination, color, stops, points: geometryFor(id, stops), ...opts });

export const LINES: Line[] = [
  line("exmouth", "Avocet Line", "Exmouth", "#e53e3e",
    ["EXD", "EXC", "SJP", "POL", "DIG", "NCO", "TOP", "EXN", "LYC", "LYM", "EXM"]),
  line("newton-abbot", "Main Line", "Plymouth", "#3182ce",
    ["EXD", "EXT", "MRB", "SCS", "DWW", "DWL", "TGM", "NTA", "TOT", "IVY", "PLY"],
    { doubleTrack: true }),
  line("paignton", "Riviera Line", "Paignton", "#14b8a6",
    ["EXD", "EXT", "MRB", "SCS", "DWW", "DWL", "TGM", "NTA", "TRR", "TQY", "PGN"],
    { drawFrom: "NTA" }),
  // Same blue as the Plymouth direction — it's one main line, Taunton ↔
  // Exeter ↔ Plymouth, with the other routes branching off it.
  line("taunton", "Main Line", "Taunton", "#3182ce",
    ["EXD", "TVP", "TAU"], { doubleTrack: true }),
  line("barnstaple", "Tarka Line", "Barnstaple", "#d69e2e",
    ["EXD", "NTC", "CDF", "YEO", "COP", "MRD", "LAP", "EGG", "KIG", "POR", "UMB", "CPN", "BNP"]),
  // Shares the trunk with the Tarka line out to Crediton, then forks straight
  // off towards Okehampton (Tarka carries on to Barnstaple). Schematic fork —
  // see FORCE_GEOMETRY.
  line("okehampton", "Dartmoor Line", "Okehampton", "#805ad5",
    ["EXD", "NTC", "CDF", "YEO", "SPC", "OKE"], { drawFrom: "CDF" }),
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));
