/**
 * Realtime Trains (RTT) API client — Phase 2 scaffold.
 *
 * RTT gives schedule + last-reported timing point for services (NOT GPS), so the
 * plan is: fetch services calling at Exeter St David's and the branch stations,
 * then interpolate each train's progress `t` along its baked line between the
 * last reported station and the next expected one. That maps cleanly onto the
 * `Train` shape the 3D layer already consumes.
 *
 * Auth: RTT uses HTTP Basic auth. Do NOT ship credentials in the client — call
 * this through a small proxy (Vite dev proxy now; a serverless function later)
 * that injects the Authorization header. See README "Phase 2".
 *
 * Docs: https://api-portal.rtt.io/  ·  https://www.realtimetrains.co.uk/about/developer/
 */
import type { Train } from "../data/types";

/** Proxy path that forwards to api.rtt.io with auth attached server-side. */
const RTT_PROXY_BASE = "/api/rtt";

export type RttServiceLite = {
  serviceUid: string;
  headcode: string;
  operator: string;
  originName: string;
  destinationName: string;
};

/**
 * Placeholder fetch. Wire up against the proxy once credentials exist, e.g.
 *   GET /api/rtt/json/search/EXD  → list of services at Exeter St David's.
 */
export async function fetchExeterServices(): Promise<RttServiceLite[]> {
  const res = await fetch(`${RTT_PROXY_BASE}/json/search/EXD`);
  if (!res.ok) throw new Error(`RTT request failed: ${res.status}`);
  // TODO: parse res.json() into RttServiceLite[].
  return [];
}

/**
 * Map RTT services onto trains positioned on our lines. To be implemented in
 * Phase 2: match each service's calling points to a Line in network.ts, then
 * set `t` from timetable interpolation and `speed` to 0 so Train.tsx eases to
 * the externally-supplied position instead of self-propelling.
 */
export function toTrains(_services: RttServiceLite[]): Train[] {
  return [];
}
