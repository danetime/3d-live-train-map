/**
 * The Exeter network — laid out as a STRAIGHT-LINE SCHEMATIC (Traksy / tube-map
 * style) rather than true geography.
 *
 * Stations are placed by hand on straight lines in world space, then converted
 * back to lat/lng (the inverse of geo.project) so the rest of the engine — which
 * positions trains by mileage along each line's spline — keeps working unchanged.
 * The Main Line is one straight spine (Plymouth ↔ Taunton through Exeter); the
 * Avocet branch peels off at Exeter and the Riviera branch at Newton Abbot.
 */
import type { Line, LatLng, Station } from "./types";

/** Central hub. Everything is positioned relative to this. */
export const ORIGIN = { lat: 50.7290, lng: -3.5435 }; // Exeter St David's

// --- Schematic layout → lat/lng -------------------------------------------
// Inverse of geo.project (kept in sync by hand to avoid a circular import).
const WORLD_SCALE = 0.004;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** A world (x, z) point on the schematic → the lat/lng that projects to it. */
const at = (x: number, z: number): LatLng => ({
  lat: ORIGIN.lat - z / (M_PER_DEG_LAT * WORLD_SCALE),
  lng: ORIGIN.lng + x / (M_PER_DEG_LNG * WORLD_SCALE),
});

const SPINE_GAP = 13; // spacing between consecutive spine stations
const BRANCH_GAP = 9; // spacing along a branch

const unit = (x: number, z: number) => {
  const m = Math.hypot(x, z);
  return { x: x / m, z: z / m };
};

// The Main Line spine, Plymouth → Taunton, centred on Exeter St David's.
const SPINE = ["PLY", "IVY", "TOT", "NTA", "TGM", "DWL", "DWW", "SCS", "MRB", "EXT", "EXD", "TVP", "TAU"];
const EXD_INDEX = SPINE.indexOf("EXD");

const LAYOUT: Record<string, { x: number; z: number }> = {};
SPINE.forEach((code, i) => {
  LAYOUT[code] = { x: (i - EXD_INDEX) * SPINE_GAP, z: 0 };
});

/** Lay a branch of stations along a straight ray from a junction station. */
function branch(from: string, dir: { x: number; z: number }, codes: string[]) {
  const o = LAYOUT[from];
  const d = unit(dir.x, dir.z);
  codes.forEach((code, i) => {
    LAYOUT[code] = { x: o.x + d.x * BRANCH_GAP * (i + 1), z: o.z + d.z * BRANCH_GAP * (i + 1) };
  });
}

// Avocet branch peels off Exeter heading down-left; Riviera off Newton Abbot.
branch("EXD", { x: -0.5, z: 1 }, ["EXC", "SJP", "POL", "DIG", "NCO", "TOP", "EXN", "LYC", "LYM", "EXM"]);
branch("NTA", { x: 0.4, z: 1 }, ["TRR", "TQY", "PGN"]);

/** [code, name, hub?] — positions come from the schematic LAYOUT above. */
const STATION_DEFS: [string, string, boolean?][] = [
  ["EXD", "Exeter St David's", true],
  // Avocet line → Exmouth
  ["EXC", "Exeter Central"],
  ["SJP", "St James Park"],
  ["POL", "Polsloe Bridge"],
  ["DIG", "Digby & Sowton"],
  ["NCO", "Newcourt"],
  ["TOP", "Topsham"],
  ["EXN", "Exton"],
  ["LYC", "Lympstone Commando"],
  ["LYM", "Lympstone Village"],
  ["EXM", "Exmouth"],
  // Main line SW → Plymouth (via the Dawlish sea wall)
  ["EXT", "Exeter St Thomas"],
  ["MRB", "Marsh Barton"],
  ["SCS", "Starcross"],
  ["DWW", "Dawlish Warren"],
  ["DWL", "Dawlish"],
  ["TGM", "Teignmouth"],
  ["NTA", "Newton Abbot"],
  ["TOT", "Totnes"],
  ["IVY", "Ivybridge"],
  ["PLY", "Plymouth"],
  // Riviera/Torbay branch → Paignton
  ["TRR", "Torre"],
  ["TQY", "Torquay"],
  ["PGN", "Paignton"],
  // Main line NE → Taunton
  ["TVP", "Tiverton Parkway"],
  ["TAU", "Taunton"],
];

export const STATIONS: Station[] = STATION_DEFS.map(([code, name, hub]) => {
  const p = LAYOUT[code];
  if (!p) throw new Error(`No schematic position for station: ${code}`);
  return { code, name, pos: at(p.x, p.z), ...(hub ? { hub: true } : {}) };
});

const STATION_BY_CODE = new Map(STATIONS.map((s) => [s.code, s]));

export const stationPos = (code: string): LatLng => {
  const s = STATION_BY_CODE.get(code);
  if (!s) throw new Error(`Unknown station code: ${code}`);
  return s.pos;
};

/**
 * Drawing geometry per line. In the schematic, a line is simply the straight
 * polyline through its own stops — no curvy waypoints — so the track runs dead
 * straight and turns only at branch junctions.
 */
function geometryFor(_id: string, stops: string[]): LatLng[] {
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
