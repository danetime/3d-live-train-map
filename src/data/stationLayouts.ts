/**
 * In-world station platform layouts.
 *
 * A layout gives a station a local frame (origin + rotation, local +Z along the
 * through axis) and, per platform NUMBER, the local X of the track lane serving
 * that platform face. StationDetail draws the islands in this frame and Train
 * parks live trains on these lanes — one source of truth, so a train reported
 * "at platform 4" stands exactly beside the island face labelled "4".
 *
 * Only Exeter St David's so far. The lane Xs are matched to StationDetail's
 * three islands (centres -1.35 / 0 / +1.35, width 0.55): P1 and P6 hug the
 * outer faces, the rest run in the gaps between islands. With local +Z pointing
 * toward Plymouth, negative X is the east (station building / P1) side.
 */
import * as THREE from "three";
import { lineCurve } from "./lineCurves";
import { project } from "./geo";
import { ORIGIN } from "./network";

export type StationLayout = {
  /** World position of the layout origin (the station). */
  pos: THREE.Vector3;
  /** Rotation about Y aligning local +Z with the through axis. */
  rotY: number;
  /** Platform number → local X of its track lane. */
  lanes: Record<string, number>;
};

const EXD_LANES: Record<string, number> = {
  "1": -1.9,
  "2": -0.875,
  "3": -0.475,
  "4": 0.475,
  "5": 0.875,
  "6": 1.9,
};

let exdLayout: StationLayout | null = null;

/** Platform ids arrive in varied forms ("1", "01", "4 "). Normalise for lookup. */
export function normPlatform(p: string): string {
  const s = p.trim().toUpperCase();
  return s.replace(/^0+(?=.)/, "");
}

/** The layout for a station (CRS), or null where we haven't modelled one. */
export function stationLayout(crs: string): StationLayout | null {
  if (crs !== "EXD") return null;
  if (!exdLayout) {
    // Same through-axis StationDetail uses: blend the Plymouth-ward and
    // (reversed) Taunton-ward tangents so the lanes line up with the main line
    // on both sides of the station.
    const tPly = lineCurve("newton-abbot").getTangentAt(0.004, new THREE.Vector3());
    const tTau = lineCurve("taunton").getTangentAt(0.004, new THREE.Vector3());
    const axis = tPly.sub(tTau).normalize();
    exdLayout = {
      pos: project(ORIGIN),
      rotY: Math.atan2(axis.x, axis.z),
      lanes: EXD_LANES,
    };
  }
  return exdLayout;
}

/**
 * World position of the lane a train occupies when standing at `platform`, and
 * the world heading of local +Z (trains face this heading when travelling
 * down, the opposite when travelling up). Null if the station or platform
 * isn't modelled.
 */
export function platformStandWorld(
  crs: string,
  platform: string,
  out: THREE.Vector3,
): { heading: number } | null {
  const lay = stationLayout(crs);
  const x = lay?.lanes[normPlatform(platform)];
  if (!lay || x == null) return null;
  // Local (x, 0) → world via the Y rotation: x' = x·cosθ, z' = −x·sinθ.
  out.set(lay.pos.x + x * Math.cos(lay.rotY), lay.pos.y, lay.pos.z - x * Math.sin(lay.rotY));
  return { heading: lay.rotY };
}
