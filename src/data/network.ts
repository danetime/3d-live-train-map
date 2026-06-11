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

function geometryFor(id: string, stops: string[]): LatLng[] {
  // Verified, baked geometry is the source of truth — reliable and independent
  // of the (flaky) OSM fetch. OSM is only a fallback for any line we haven't
  // hand-traced, and only if it actually reaches that line's terminus.
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
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));

/**
 * Station mileages (decimal miles) per line, aligned 1:1 with each line's
 * `stops` order — the calibration anchors for precise mileage positioning
 * (see mileageToT in lineCurves.ts). A berth's miles-and-chains is interpolated
 * between the two stations it sits between, so we only ever compare mileages
 * *within* one line — each line keeps its own datum (the main line measures
 * from Paddington; the Avocet line uses a local datum here).
 *
 * NOTE: these are approximate seed values — good enough to prove the engine and
 * roughly correct in spacing. Replace them with surveyed mileages off the route
 * diagrams when we have them. 1 mile = 80 chains.
 */
const mc = (miles: number, chains: number) => miles + chains / 80;

export const LINE_MILEAGES: Record<string, number[]> = {
  // Avocet line — local datum from Exeter St David's out to Exmouth (~10¼ mi).
  exmouth: [
    mc(0, 0),   // EXD
    mc(0, 44),  // EXC  Exeter Central
    mc(1, 24),  // SJP  St James Park
    mc(1, 72),  // POL  Polsloe Bridge
    mc(3, 64),  // DIG  Digby & Sowton
    mc(4, 32),  // NCO  Newcourt
    mc(5, 24),  // TOP  Topsham
    mc(6, 64),  // EXN  Exton
    mc(7, 48),  // LYC  Lympstone Commando
    mc(8, 32),  // LYM  Lympstone Village
    mc(10, 20), // EXM  Exmouth
  ],
  // Main line SW (Paddington datum), Exeter St David's → Plymouth.
  "newton-abbot": [
    mc(173, 56), // EXD
    mc(174, 32), // EXT  Exeter St Thomas
    mc(175, 8),  // MRB  Marsh Barton
    mc(181, 40), // SCS  Starcross
    mc(184, 24), // DWW  Dawlish Warren
    mc(185, 64), // DWL  Dawlish
    mc(188, 24), // TGM  Teignmouth
    mc(194, 0),  // NTA  Newton Abbot
    mc(202, 48), // TOT  Totnes
    mc(215, 0),  // IVY  Ivybridge
    mc(225, 56), // PLY  Plymouth
  ],
  // Torbay branch — shared main-line datum to Newton Abbot, then on to Paignton.
  paignton: [
    mc(173, 56), // EXD
    mc(174, 32), // EXT
    mc(175, 8),  // MRB
    mc(181, 40), // SCS
    mc(184, 24), // DWW
    mc(185, 64), // DWL
    mc(188, 24), // TGM
    mc(194, 0),  // NTA
    mc(197, 48), // TRR  Torre
    mc(198, 48), // TQY  Torquay
    mc(200, 8),  // PGN  Paignton
  ],
  // Main line NE (Paddington datum) — mileage decreases toward Taunton.
  taunton: [
    mc(173, 56), // EXD
    mc(159, 16), // TVP  Tiverton Parkway
    mc(143, 0),  // TAU  Taunton
  ],
};
