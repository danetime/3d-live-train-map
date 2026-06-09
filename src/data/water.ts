/**
 * Water bodies around Exeter, traced (roughly) from the coastline: the Exe
 * Estuary that the Avocet line runs down, the sea the Riviera line hugs along
 * the Dawlish sea wall, and the Teign estuary into Newton Abbot.
 *
 * Defined as lat/lng polygons and projected once into flat world {x,z} points,
 * used both to draw the water and to keep trees from spawning on it.
 */
import type { LatLng } from "./types";
import { project } from "./geo";

type Poly = LatLng[];

// Coastal edges sit just seaward of the coast stations so they aren't submerged.
const SEA: Poly = [
  { lat: 50.612, lng: -3.4 }, // off Exmouth seafront
  { lat: 50.35, lng: -2.0 }, // far ESE, out past the horizon
  { lat: 49.6, lng: -2.7 }, // far south
  { lat: 49.9, lng: -3.9 }, // far SSW
  { lat: 50.535, lng: -3.485 }, // off Teignmouth
  { lat: 50.572, lng: -3.45 }, // off Dawlish
  { lat: 50.6, lng: -3.428 }, // off Dawlish Warren
];

// A funnel down the middle of the estuary, inset from both banks so the
// east-bank (Avocet) and west-bank (Riviera) stations stay on dry land.
const EXE_ESTUARY: Poly = [
  { lat: 50.69, lng: -3.47 }, // head, by Topsham
  { lat: 50.66, lng: -3.462 }, // west bank
  { lat: 50.632, lng: -3.447 }, // west bank, by Starcross
  { lat: 50.614, lng: -3.435 }, // west of the mouth
  { lat: 50.612, lng: -3.422 }, // east of the mouth
  { lat: 50.64, lng: -3.44 }, // east bank, by Lympstone
  { lat: 50.668, lng: -3.448 }, // east bank, by Exton
  { lat: 50.688, lng: -3.466 }, // east bank, by Topsham
];

const TEIGN_ESTUARY: Poly = [
  { lat: 50.549, lng: -3.502 }, // off Teignmouth
  { lat: 50.54, lng: -3.585 }, // inland toward Newton Abbot
  { lat: 50.534, lng: -3.587 },
  { lat: 50.545, lng: -3.504 },
];

/** Projected water polygons as flat {x, z} rings. */
export const WATER_POLYGONS: { x: number; z: number }[][] = [
  SEA,
  EXE_ESTUARY,
  TEIGN_ESTUARY,
].map((poly) => poly.map((p) => {
  const v = project(p);
  return { x: v.x, z: v.z };
}));

/** Ray-casting point-in-polygon test on the flat (x, z) plane. */
export function pointInPolygon(x: number, z: number, poly: { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True if a point sits in (or near) any water body. */
export function isOverWater(x: number, z: number): boolean {
  return WATER_POLYGONS.some((poly) => pointInPolygon(x, z, poly));
}
