/**
 * Geographic helpers: convert real lat/lng into the flat 3D world.
 *
 * We use a simple local equirectangular projection centred on Exeter. At this
 * latitude (~50.7°N) it's accurate to well within the tolerance of a stylised,
 * "doesn't have to be 100%" map, and it avoids pulling in a heavy projection
 * library. X runs west→east, Z runs north→south (so the camera looks down a
 * conventional map), Y is up.
 */
import * as THREE from "three";
import type { LatLng } from "./types";
import { ORIGIN } from "./network";

/** Metres per degree of latitude (roughly constant). */
const M_PER_DEG_LAT = 111_320;
/** Metres per degree of longitude shrinks with latitude. */
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);

/**
 * World units per metre. The Exeter→Taunton span is ~50km; scaling it down
 * keeps the whole network within a comfortable camera frame.
 */
export const WORLD_SCALE = 0.004;

/** Project a lat/lng to a flat world position (Y = 0), optionally into `target`. */
export function project({ lat, lng }: LatLng, target?: THREE.Vector3): THREE.Vector3 {
  const east = (lng - ORIGIN.lng) * M_PER_DEG_LNG;
  const north = (lat - ORIGIN.lat) * M_PER_DEG_LAT;
  const out = target ?? new THREE.Vector3();
  return out.set(east * WORLD_SCALE, 0, -north * WORLD_SCALE);
}

/** Build a smooth Catmull-Rom curve through a list of geographic points. */
export function curveFromPoints(points: LatLng[]): THREE.CatmullRomCurve3 {
  const pts = points.map((p) => project(p));
  return new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
}
