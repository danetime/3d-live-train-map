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
import type { Line, Station } from "./types";

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
  { code: "STA", name: "Starcross", pos: { lat: 50.6280, lng: -3.4490 } },
  { code: "DWL", name: "Dawlish", pos: { lat: 50.5810, lng: -3.4660 } },
  { code: "TGM", name: "Teignmouth", pos: { lat: 50.5470, lng: -3.4960 } },
  { code: "NTA", name: "Newton Abbot", pos: { lat: 50.5290, lng: -3.6000 } },

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

const stationPos = (code: string) => {
  const s = STATIONS.find((st) => st.code === code);
  if (!s) throw new Error(`Unknown station code: ${code}`);
  return s.pos;
};

/** Build a line's point list from a sequence of station codes. */
const route = (codes: string[]) => codes.map(stationPos);

export const LINES: Line[] = [
  {
    id: "exmouth",
    name: "Avocet Line",
    destination: "Exmouth",
    color: "#e53e3e",
    points: route(["EXD", "EXC", "POL", "DIG", "TOP", "EXN", "LYM", "EXM"]),
  },
  {
    id: "newton-abbot",
    name: "Riviera Line",
    destination: "Newton Abbot",
    color: "#3182ce",
    points: route(["EXD", "EXT", "STA", "DWL", "TGM", "NTA"]),
  },
  {
    id: "taunton",
    name: "Main Line",
    destination: "Taunton",
    color: "#38a169",
    points: route(["EXD", "TVP", "TAU"]),
  },
  {
    id: "barnstaple",
    name: "Tarka Line",
    destination: "Barnstaple",
    color: "#d69e2e",
    points: route(["EXD", "NTC", "CDF", "YEO", "EGG", "KIG", "UMB", "BNP"]),
  },
  {
    id: "okehampton",
    name: "Dartmoor Line",
    destination: "Okehampton",
    color: "#805ad5",
    points: route(["EXD", "NTC", "CDF", "YEO", "SPC", "OKE"]),
  },
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));
