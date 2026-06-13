/**
 * The track GRAPH — the durable network model (step 1 of the migration).
 *
 * Today every line is an independent spline, so where routes share metals or
 * meet at a junction they merely overlap on screen. The graph replaces that with
 * the real shape of a railway:
 *
 *   - NODES   — stations, junctions, termini. Keyed by CRS and SHARED across
 *               lines, so Newton Abbot is one node the main line and the Paignton
 *               branch both touch (degree 3 ⇒ flagged a junction), not two dots
 *               sitting on top of each other.
 *   - EDGES   — a track segment between two adjacent nodes on a line. An edge
 *               owns its geometry, its up/down (double-track) capability and its
 *               mileage range. Edges are what trains will ride and what signal
 *               blocks will map to in later steps.
 *
 * STEP 1 SCOPE: build the graph from the existing line data and prove it
 * reproduces today's positions exactly — nothing here renders yet (that's
 * step 2) and no train/signal code is touched. To stay byte-faithful, an edge's
 * geometry is expressed as an arc-length t-range on the line's CURRENT spline;
 * later steps can swap that for independent per-edge geometry (e.g. aligned to
 * the imported 3D model) behind the same interface.
 *
 * The shared trunk (Exeter→Newton Abbot, used by both the main line and the
 * Paignton branch) is represented for now as parallel edges between the shared
 * nodes, with the branch's copy marked `drawn: false` exactly as `drawFrom`
 * does today. Merging those into single shared edges is deliberately deferred
 * to step 5 (the St David's / Exeter Central junction rework).
 */
import * as THREE from "three";
import { LINES, LINE_MILEAGES, stationPos } from "./network";
import { lineCurve, lineStopParams } from "./lineCurves";
import { project } from "./geo";
import type { LatLng } from "./types";

export type NodeId = string; // station CRS, e.g. "NTA"
export type EdgeId = string; // `${lineId}:${from}-${to}`

export type TrackNode = {
  id: NodeId;
  /** World position (projected from the station's lat/lng). */
  pos: THREE.Vector3;
  ll: LatLng;
  /** Incident edge ids. */
  edges: EdgeId[];
  /** Distinct neighbouring nodes (dedupes parallel trunk edges). */
  neighbors: Set<NodeId>;
  /** terminus (deg 1) · through (deg 2) · junction (deg ≥ 3). */
  kind: "terminus" | "through" | "junction";
};

export type TrackEdge = {
  id: EdgeId;
  lineId: string;
  from: NodeId;
  to: NodeId;
  /** Geometry as an arc-length range on the line's current spline (tFrom<tTo). */
  tFrom: number;
  tTo: number;
  /** Arc length in world units. */
  length: number;
  /** Drawn as two parallel rails (up/down) when true. */
  doubleTrack: boolean;
  /** False for a branch's shared trunk it doesn't redraw (mirrors `drawFrom`). */
  drawn: boolean;
  /** Mileage (decimal miles) of the two endpoint stations, in edge order. */
  milesFrom: number;
  milesTo: number;
};

export type TrackGraph = {
  nodes: Map<NodeId, TrackNode>;
  edges: Map<EdgeId, TrackEdge>;
  /** Edge ids per line, in stop order (Exeter outwards). */
  byLine: Map<string, EdgeId[]>;
};

/**
 * Per-edge track-type overrides for sections that differ from their line's
 * default. The Avocet (Exmouth) branch is double track on the climb from Exeter
 * St David's to Exeter Central, then single beyond Exmouth Junction — so the
 * single-track `exmouth` line is double over just its first edge.
 */
const DOUBLE_TRACK_EDGES = new Set<EdgeId>(["exmouth:EXD-EXC"]);

function build(): TrackGraph {
  const nodes = new Map<NodeId, TrackNode>();
  const edges = new Map<EdgeId, TrackEdge>();
  const byLine = new Map<string, EdgeId[]>();

  const nodeFor = (crs: NodeId): TrackNode => {
    let n = nodes.get(crs);
    if (!n) {
      const ll = stationPos(crs);
      n = { id: crs, pos: project(ll), ll, edges: [], neighbors: new Set(), kind: "through" };
      nodes.set(crs, n);
    }
    return n;
  };

  for (const line of LINES) {
    const params = lineStopParams(line.id);
    const miles = LINE_MILEAGES[line.id] ?? [];
    const totalLen = lineCurve(line.id).getLength();
    // `drawFrom` means draw from that stop outwards; the stops before it are the
    // shared trunk this line doesn't redraw.
    const trunkEnd = line.drawFrom ? line.stops.indexOf(line.drawFrom) : -1;
    const ids: EdgeId[] = [];

    for (let i = 0; i < line.stops.length - 1; i++) {
      const from = line.stops[i];
      const to = line.stops[i + 1];
      const a = nodeFor(from);
      const b = nodeFor(to);
      const id: EdgeId = `${line.id}:${from}-${to}`;
      const tFrom = params[i];
      const tTo = params[i + 1];

      edges.set(id, {
        id,
        lineId: line.id,
        from,
        to,
        tFrom,
        tTo,
        length: Math.abs(tTo - tFrom) * totalLen,
        doubleTrack: DOUBLE_TRACK_EDGES.has(id) || !!line.doubleTrack,
        drawn: trunkEnd < 0 ? true : i >= trunkEnd,
        milesFrom: miles[i],
        milesTo: miles[i + 1],
      });
      ids.push(id);
      a.edges.push(id);
      b.edges.push(id);
      a.neighbors.add(to);
      b.neighbors.add(from);
    }
    byLine.set(line.id, ids);
  }

  for (const n of nodes.values()) {
    const deg = n.neighbors.size;
    n.kind = deg <= 1 ? "terminus" : deg === 2 ? "through" : "junction";
  }

  return { nodes, edges, byLine };
}

/** The singleton graph, built once from the network data at load. */
export const trackGraph: TrackGraph = build();

/** World point at fraction `s` (0..1) along an edge. */
export function edgePointAt(edge: TrackEdge, s: number, target = new THREE.Vector3()): THREE.Vector3 {
  const t = edge.tFrom + (edge.tTo - edge.tFrom) * THREE.MathUtils.clamp(s, 0, 1);
  return lineCurve(edge.lineId).getPointAt(THREE.MathUtils.clamp(t, 0, 1), target);
}

/** Unit tangent (direction of increasing s) at fraction `s` along an edge. */
export function edgeTangentAt(edge: TrackEdge, s: number, target = new THREE.Vector3()): THREE.Vector3 {
  const t = edge.tFrom + (edge.tTo - edge.tFrom) * THREE.MathUtils.clamp(s, 0, 1);
  return lineCurve(edge.lineId).getTangentAt(THREE.MathUtils.clamp(t, 0, 1), target);
}

/** Sample an edge into a polyline (used by the step-2 rail renderer). */
export function sampleEdge(edge: TrackEdge, segments = 24): THREE.Vector3[] {
  const curve = lineCurve(edge.lineId);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = edge.tFrom + (edge.tTo - edge.tFrom) * (i / segments);
    pts.push(curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1)));
  }
  return pts;
}

/**
 * Map a legacy (lineId, t) position to (edge, s) on the graph — the bridge the
 * train/signal migrations (steps 3–4) will use so they can move over without a
 * jump. Clamps to the first/last edge for t beyond the stop range.
 */
export function lineTToEdge(lineId: string, t: number): { edge: TrackEdge; s: number } | null {
  const ids = trackGraph.byLine.get(lineId);
  if (!ids || !ids.length) return null;
  const firstId = ids[0];
  const lastId = ids[ids.length - 1];
  for (const id of ids) {
    const e = trackGraph.edges.get(id)!;
    if (t >= e.tFrom - 1e-9 && t <= e.tTo + 1e-9) {
      const span = e.tTo - e.tFrom;
      const s = span === 0 ? 0 : (t - e.tFrom) / span;
      return { edge: e, s: THREE.MathUtils.clamp(s, 0, 1) };
    }
  }
  const first = trackGraph.edges.get(firstId)!;
  if (t < first.tFrom) return { edge: first, s: 0 };
  return { edge: trackGraph.edges.get(lastId)!, s: 1 };
}

/** Junction nodes (degree ≥ 3) — where routes actually diverge. */
export function junctions(): TrackNode[] {
  return [...trackGraph.nodes.values()].filter((n) => n.kind === "junction");
}

/** Summary counts, for verification logging and a future debug overlay. */
export function trackGraphStats() {
  let drawn = 0;
  let undrawn = 0;
  let totalLength = 0;
  for (const e of trackGraph.edges.values()) {
    e.drawn ? drawn++ : undrawn++;
    totalLength += e.length;
  }
  return {
    nodes: trackGraph.nodes.size,
    edges: trackGraph.edges.size,
    drawnEdges: drawn,
    undrawnEdges: undrawn,
    junctions: junctions().map((n) => `${n.id}(${[...n.neighbors].join("/")})`),
    totalLength,
  };
}

/** A continuous stretch of rail to draw as one ribbon, as a t-range on the line. */
export type RailRun = { tStart: number; tEnd: number; doubleTrack: boolean };

/**
 * Group a line's DRAWN edges into continuous runs for the rail renderer — one
 * ribbon per run, so there are no seams mid-run, only where rail treatment
 * actually changes (a junction, a single/double transition, or the trunk a
 * branch skips). Adjacent edges merge while their `doubleTrack` matches.
 *
 * The first/last edge of a line clamps to t 0/1 so a run reaches the spline ends
 * exactly as the original per-line renderer did — keeping step 2 pixel-identical.
 * (Once edges carry their own independent geometry in a later step, the clamp
 * goes away.)
 */
export function railRuns(lineId: string): RailRun[] {
  const ids = trackGraph.byLine.get(lineId) ?? [];
  const edges = ids.map((id) => trackGraph.edges.get(id)!);
  const n = edges.length;
  const runs: RailRun[] = [];
  let start = -1;

  const flush = (endIdx: number) => {
    if (start < 0) return;
    runs.push({
      tStart: start === 0 ? 0 : edges[start].tFrom,
      tEnd: endIdx === n - 1 ? 1 : edges[endIdx].tTo,
      doubleTrack: edges[start].doubleTrack,
    });
    start = -1;
  };

  for (let i = 0; i < n; i++) {
    if (!edges[i].drawn) {
      flush(i - 1);
    } else if (start < 0) {
      start = i;
    } else if (edges[i].doubleTrack !== edges[start].doubleTrack) {
      flush(i - 1);
      start = i;
    }
  }
  flush(n - 1);
  return runs;
}
