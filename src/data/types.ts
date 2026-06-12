/** Shared domain types for the train map. */

export type LatLng = {
  lat: number;
  lng: number;
};

/** A station / stop on the network. */
export type Station = {
  /** CRS / three-letter code, e.g. EXD for Exeter St David's. */
  code: string;
  name: string;
  pos: LatLng;
  /** Marks the central hub so the scene can highlight it. */
  hub?: boolean;
};

/** One railway line: an ordered list of geographic waypoints. */
export type Line = {
  id: string;
  /** Human friendly name, e.g. "Tarka Line". */
  name: string;
  /** Where the line terminates (the far end from Exeter). */
  destination: string;
  /** Hex colour used to draw the track and trains. */
  color: string;
  /** Ordered CRS station codes from Exeter outwards (matches `points`). */
  stops: string[];
  /** Ordered lat/lng points from Exeter outwards, smoothed into a spline. */
  points: LatLng[];
  /** Main lines are double-track (drawn as parallel up & down rails). */
  doubleTrack?: boolean;
  /** Only draw the track from this stop outwards (the rest is shared trunk). */
  drawFrom?: string;
  /** Lateral offset (world units) so a branch peels cleanly off a shared trunk. */
  drawOffset?: number;
};

/** Real formation data from the Darwin push port (attached server-side). */
export type TrainFormation = {
  /** Actual number of coaches in the unit(s) working this service. */
  coaches: number;
  /** How many of those are First class (or composite), when known. */
  first?: number;
  /** Average loading across coaches, 0–100 %, from the latest calling point. */
  loading?: number;
  /** Data source tag, e.g. "darwin". */
  src?: string;
};

/** A train currently somewhere on the network. */
export type Train = {
  id: string;
  /** The line this train is travelling along. */
  lineId: string;
  /** Service headcode / identifier shown in the HUD, e.g. "2T10". */
  headcode: string;
  /** Operator or service label, e.g. "GWR" / "SWR". */
  operator: string;
  /** Progress along the line, 0..1. */
  t: number;
  /** +1 travelling outbound (away from Exeter), -1 inbound. */
  direction: 1 | -1;
  /** Units of t per second — how fast it moves along the spline. */
  speed: number;
  /** Where it is heading right now, for the info panel. */
  headingTo: string;
  /** TD berth the train currently occupies (live feed only). */
  berth?: string;
  /** Real coach count / loading from Darwin (live feed only, when available). */
  formation?: TrainFormation;
  /** Platform the train is standing at, from SMART berth data (live only). */
  platform?: string;
  /**
   * Exact geographic position, when we have real berth coordinates. If set, the
   * train is rendered here (and faces its direction of travel) instead of being
   * placed along its line's spline by `t`.
   */
  pos?: LatLng;
};
