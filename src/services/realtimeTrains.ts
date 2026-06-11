/**
 * Realtime Trains (RTT) API client — Phase 2.
 *
 * RTT gives schedule + last-reported timing points (NOT GPS), so we fetch the
 * services calling at Exeter St David's, pull each one's calling points, match
 * them to one of our lines by CRS code, and interpolate the train's progress
 * `t` along that line's spline from its real timetable. The result is the same
 * `Train` shape the 3D layer already consumes.
 *
 * Auth: RTT uses HTTP Basic auth. Credentials must NOT live in the client — all
 * requests go through a proxy (the Vite dev proxy now; a serverless function in
 * production) that attaches the Authorization header. See README "Phase 2".
 *
 * Docs: https://api-portal.rtt.io/  ·  https://www.realtimetrains.co.uk/about/developer/
 */
import type { Train } from "../data/types";
import { STATIONS, LINES } from "../data/network";
import { lineStopParams } from "../data/lineCurves";

const BASE = "/api/rtt/json";
/** Cap on detail fetches per refresh, to stay within RTT fair-use. */
const MAX_SERVICES = 20;

const STATION_CODES = new Set(STATIONS.map((s) => s.code));

// ---- RTT response shapes (the subset we use) ----

type RttPair = { tiploc?: string; description?: string };

type RttLocation = {
  crs?: string;
  description?: string;
  isCall?: boolean;
  gbttBookedArrival?: string;
  gbttBookedDeparture?: string;
  realtimeArrival?: string;
  realtimeDeparture?: string;
  realtimeArrivalActual?: boolean;
  realtimeDepartureActual?: boolean;
};

type RttSearchService = {
  serviceUid: string;
  runDate: string;
  isPassenger?: boolean;
  serviceType?: string;
  trainIdentity?: string;
  locationDetail?: { destination?: RttPair[] };
};

type RttSearchResponse = { services?: RttSearchService[] | null };

type RttServiceDetail = {
  serviceUid: string;
  runDate: string;
  atocCode?: string;
  atocName?: string;
  trainIdentity?: string;
  isPassenger?: boolean;
  destination?: RttPair[];
  locations?: RttLocation[];
};

// ---- HTTP ----

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`RTT ${path} → ${res.status}`);
  return (await res.json()) as T;
}

function serviceDetail(uid: string, runDate: string): Promise<RttServiceDetail> {
  const [y, m, d] = runDate.split("-");
  return getJson<RttServiceDetail>(`${BASE}/service/${uid}/${y}/${m}/${d}`);
}

// ---- Time helpers (RTT times are local "HHMM" strings) ----

function hhmmToMinutes(s: string | undefined): number | null {
  if (!s || !/^\d{4}$/.test(s)) return null;
  return parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2), 10);
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

// ---- Map one service onto a line + position it ----

type Point = { crs: string; arr: number | null; dep: number | null };

/** Pick the line whose stops best overlap the service's calling points. */
function chooseLine(crsList: string[]) {
  const set = new Set(crsList);
  let best: (typeof LINES)[number] | null = null;
  let bestScore = 0;
  for (const ln of LINES) {
    const score = ln.stops.reduce((n, c) => n + (set.has(c) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = ln;
    }
  }
  return bestScore >= 2 ? best : null;
}

export function mapServiceToTrain(detail: RttServiceDetail): Train | null {
  const locs = detail.locations ?? [];
  const onNetwork = locs
    .filter((l) => l.crs && STATION_CODES.has(l.crs))
    .map<Point>((l) => ({
      crs: l.crs!,
      arr: hhmmToMinutes(l.realtimeArrival ?? l.gbttBookedArrival),
      dep: hhmmToMinutes(l.realtimeDeparture ?? l.gbttBookedDeparture),
    }));

  const ln = chooseLine(onNetwork.map((p) => p.crs));
  if (!ln) return null;

  const sByCrs = new Map(ln.stops.map((c, i) => [c, lineStopParams(ln.id)[i]]));
  // Keep only points that sit on the chosen line, in service order.
  const seq = onNetwork.filter((p) => sByCrs.has(p.crs));
  if (seq.length === 0) return null;

  // Make times monotonic to ride through midnight rollovers.
  let prev = -Infinity;
  let off = 0;
  const fix = (x: number | null): number | null => {
    if (x == null) return null;
    let v = x + off;
    if (v < prev) {
      off += 1440;
      v = x + off;
    }
    prev = v;
    return v;
  };
  for (const p of seq) {
    p.arr = fix(p.arr);
    p.dep = fix(p.dep);
  }

  const sFirst = sByCrs.get(seq[0].crs)!;
  const sLast = sByCrs.get(seq[seq.length - 1].crs)!;
  const overallDir: 1 | -1 = sLast >= sFirst ? 1 : -1;

  let now = nowMinutes();
  const firstTime = seq[0].dep ?? seq[0].arr ?? now;
  if (firstTime > 1440 && now < 200) now += 1440; // we're past midnight

  // Find the segment the train is currently on.
  let t = sFirst;
  let direction = overallDir;
  for (let i = 0; i < seq.length - 1; i++) {
    const leave = seq[i].dep ?? seq[i].arr;
    const arrive = seq[i + 1].arr ?? seq[i + 1].dep;
    if (leave == null || arrive == null) continue;
    const sFrom = sByCrs.get(seq[i].crs)!;
    const sTo = sByCrs.get(seq[i + 1].crs)!;
    if (now < leave) {
      t = sFrom; // waiting at / not yet left this stop
      break;
    }
    if (now <= arrive || i === seq.length - 2) {
      const f = arrive > leave ? Math.min(Math.max((now - leave) / (arrive - leave), 0), 1) : 0;
      t = sFrom + (sTo - sFrom) * f;
      direction = sTo >= sFrom ? 1 : -1;
      break;
    }
    t = sTo; // already past this segment, keep walking
  }

  return {
    id: detail.serviceUid,
    lineId: ln.id,
    headcode: detail.trainIdentity || detail.serviceUid,
    operator: detail.atocCode || "",
    t: Math.min(Math.max(t, 0), 1),
    direction,
    speed: 0, // externally positioned; Train.tsx eases toward this t
    headingTo: detail.destination?.[0]?.description || ln.destination,
  };
}

// ---- Public entry points ----

/**
 * Build a `headcode → real destination` map from a single RTT search at Exeter.
 * Used to enrich the TD feed (which has headcodes but no destinations). One
 * request, so it's fair-use friendly enough to poll alongside the TD feed.
 */
export async function fetchHeadcodeDestinations(): Promise<Map<string, string>> {
  const search = await getJson<RttSearchResponse>(`${BASE}/search/EXD`);
  const map = new Map<string, string>();
  for (const s of search.services ?? []) {
    const code = s.trainIdentity;
    const dest = s.locationDetail?.destination?.[0]?.description;
    if (code && dest) map.set(code, dest);
  }
  return map;
}

/** Fetch live trains around Exeter St David's, mapped onto our network. */
export async function fetchLiveTrains(): Promise<Train[]> {
  const search = await getJson<RttSearchResponse>(`${BASE}/search/EXD`);
  const services = (search.services ?? [])
    .filter((s) => s.isPassenger !== false && (s.serviceType ?? "train") === "train")
    .slice(0, MAX_SERVICES);

  const details = await Promise.allSettled(
    services.map((s) => serviceDetail(s.serviceUid, s.runDate)),
  );

  const byId = new Map<string, Train>();
  for (const r of details) {
    if (r.status !== "fulfilled") continue;
    try {
      const train = mapServiceToTrain(r.value);
      if (train) byId.set(train.id, train);
    } catch {
      // Skip any service we can't parse; never let one break the feed.
    }
  }
  return [...byId.values()];
}
