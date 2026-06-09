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

const SEA: Poly = [
  { lat: 50.616, lng: -3.404 }, // Exmouth seafront
  { lat: 50.35, lng: -2.0 }, // far ESE, out past the horizon
  { lat: 49.6, lng: -2.7 }, // far south
  { lat: 49.9, lng: -3.9 }, // far SSW
  { lat: 50.54, lng: -3.5 }, // Teignmouth coast
  { lat: 50.578, lng: -3.462 }, // Dawlish
  { lat: 50.606, lng: -3.44 }, // Dawlish Warren
];

const EXE_ESTUARY: Poly = [
  { lat: 50.692, lng: -3.462 }, // Topsham (narrow head)
  { lat: 50.686, lng: -3.48 }, // Exminster, west bank
  { lat: 50.64, lng: -3.47 },
  { lat: 50.61, lng: -3.452 }, // Dawlish Warren side (mouth, west)
  { lat: 50.616, lng: -3.42 }, // mouth, east
  { lat: 50.622, lng: -3.416 }, // Exmouth
  { lat: 50.66, lng: -3.448 }, // east bank
];

const TEIGN_ESTUARY: Poly = [
  { lat: 50.553, lng: -3.497 }, // Teignmouth, coast
  { lat: 50.54, lng: -3.585 }, // inland toward Newton Abbot
  { lat: 50.534, lng: -3.587 },
  { lat: 50.547, lng: -3.499 },
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
