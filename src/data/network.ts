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
  { code: "POL", name: "Polsloe Bridge", pos: { lat: 50.7310, lng: -3.5060 } },
  { code: "DIG", name: "Digby & Sowton", pos: { lat: 50.7090, lng: -3.4720 } },
  { code: "TOP", name: "Topsham", pos: { lat: 50.6870, lng: -3.4640 } },
  { code: "EXN", name: "Exton", pos: { lat: 50.6680, lng: -3.4420 } },
  { code: "LYM", name: "Lympstone Village", pos: { lat: 50.6470, lng: -3.4360 } },
  { code: "EXM", name: "Exmouth", pos: { lat: 50.6190, lng: -3.4140 } },

  // Riviera line → Newton Abbot (via the Dawlish sea wall)
  { code: "EXT", name: "Exeter St Thomas", pos: { lat: 50.7160, lng: -3.5380 } },
  { code: "SCS", name: "Starcross", pos: { lat: 50.6280, lng: -3.4490 } },
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
  { code: "EGG", name: "Eggesford", pos: { lat: 50.8870, lng: -3.8780 } },
  { code: "KIG", name: "Kings Nympton", pos: { lat: 50.9420, lng: -3.9080 } },
  { code: "UMB", name: "Umberleigh", pos: { lat: 50.9970, lng: -3.9760 } },
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
const HAND_GEOMETRY: Record<string, LatLng[]> = {
  // Main line beyond Newton Abbot: over Dainton bank, Totnes, the South Devon
  // banks past South Brent/Ivybridge, then Plympton into Plymouth.
  "newton-abbot": [
    { lat: 50.7290, lng: -3.5435 }, // Exeter St David's
    { lat: 50.7160, lng: -3.5380 }, // Exeter St Thomas
    { lat: 50.6850, lng: -3.4990 }, // Exminster, west bank of the Exe
    { lat: 50.6280, lng: -3.4490 }, // Starcross
    { lat: 50.6080, lng: -3.4440 }, // Dawlish Warren
    { lat: 50.5810, lng: -3.4660 }, // Dawlish
    { lat: 50.5470, lng: -3.4960 }, // Teignmouth
    { lat: 50.5460, lng: -3.5430 }, // along the Teign
    { lat: 50.5290, lng: -3.6000 }, // Newton Abbot
    { lat: 50.5100, lng: -3.6480 }, // Dainton bank
    { lat: 50.4660, lng: -3.6850 }, // toward Totnes
    { lat: 50.4255, lng: -3.6888 }, // Totnes
    { lat: 50.4260, lng: -3.7700 }, // Rattery bank
    { lat: 50.4250, lng: -3.8330 }, // South Brent
    { lat: 50.3917, lng: -3.9136 }, // Ivybridge
    { lat: 50.3860, lng: -4.0200 }, // Hemerdon bank
    { lat: 50.3860, lng: -4.0660 }, // Plympton
    { lat: 50.3779, lng: -4.1426 }, // Plymouth
  ],
  // Torbay branch: south from Newton Abbot through Kingskerswell to the coast.
  paignton: [
    { lat: 50.7290, lng: -3.5435 }, // Exeter St David's (shared trunk)
    { lat: 50.7160, lng: -3.5380 },
    { lat: 50.6850, lng: -3.4990 },
    { lat: 50.6280, lng: -3.4490 },
    { lat: 50.6080, lng: -3.4440 },
    { lat: 50.5810, lng: -3.4660 },
    { lat: 50.5470, lng: -3.4960 },
    { lat: 50.5460, lng: -3.5430 },
    { lat: 50.5290, lng: -3.6000 }, // Newton Abbot — branch leaves here
    { lat: 50.5030, lng: -3.5870 }, // Kingskerswell
    { lat: 50.4719, lng: -3.5402 }, // Torre
    { lat: 50.4540, lng: -3.5436 }, // Torquay
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

/**
 * Geometry that overrides even the real OSM track. Used for clean schematic
 * branches: the real Dartmoor line loops via Yeoford/Coleford Junction, which
 * looks tangled on the diagram, so we fork it straight off the trunk at
 * Crediton towards Okehampton.
 */
const FORCE_GEOMETRY: Record<string, LatLng[]> = {
  okehampton: ["EXD", "NTC", "CDF", "SPC", "OKE"].map(stationPos),
};

function geometryFor(id: string, stops: string[]): LatLng[] {
  if (FORCE_GEOMETRY[id]) return FORCE_GEOMETRY[id];
  const osm = osmGeometry[id];
  if (osm && osm.length > 1) {
    // Guard against stale fetched data: if the stored geometry doesn't reach
    // this line's terminus (e.g. fetched before the line was extended), ignore
    // it and fall back, otherwise the line silently stops short.
    const last = osm[osm.length - 1];
    const term = stationPos(stops[stops.length - 1]);
    const far = Math.abs(last[0] - term.lat) + Math.abs(last[1] - term.lng) > 0.04;
    if (!far) return osm.map(([lat, lng]) => ({ lat, lng }));
    console.warn(`[map] lineGeometry.json for "${id}" is stale (stops short) — re-run: npm run fetch:track`);
  }
  if (HAND_GEOMETRY[id]) return HAND_GEOMETRY[id];
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
    ["EXD", "EXC", "POL", "DIG", "TOP", "EXN", "LYM", "EXM"]),
  line("newton-abbot", "Main Line", "Plymouth", "#3182ce",
    ["EXD", "EXT", "SCS", "DWL", "TGM", "NTA", "TOT", "IVY", "PLY"], { doubleTrack: true }),
  line("paignton", "Riviera Line", "Paignton", "#14b8a6",
    ["EXD", "EXT", "SCS", "DWL", "TGM", "NTA", "TRR", "TQY", "PGN"], { drawFrom: "NTA" }),
  line("taunton", "Main Line", "Taunton", "#38a169",
    ["EXD", "TVP", "TAU"], { doubleTrack: true }),
  line("barnstaple", "Tarka Line", "Barnstaple", "#d69e2e",
    ["EXD", "NTC", "CDF", "YEO", "EGG", "KIG", "UMB", "BNP"]),
  // Shares the trunk with the Tarka line out to Crediton, then forks straight
  // off towards Okehampton (Tarka carries on to Barnstaple). Schematic fork —
  // see FORCE_GEOMETRY.
  line("okehampton", "Dartmoor Line", "Okehampton", "#805ad5",
    ["EXD", "NTC", "CDF", "YEO", "SPC", "OKE"], { drawFrom: "CDF" }),
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));
