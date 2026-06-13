/**
 * Client for the Network Rail TD bridge (the /server WebSocket).
 *
 * Receives berth snapshots ({ headcode, area, berth }), maps each berth to a
 * position on our network (src/data/berths.ts) and emits `Train`s for the 3D
 * layer. Trains with berths we haven't mapped yet are skipped (and counted, so
 * you can see how many are waiting to be mapped). Reconnects automatically.
 */
import type { Train, TrainFormation } from "../data/types";
import { berthPosition, berthLatLng } from "../data/berths";
import { berthMileagePosition } from "../data/berthMileages";
import { LINE_BY_ID } from "../data/network";

const WS_URL = (import.meta.env.VITE_TD_WS_URL as string) || "ws://localhost:4001";

// `toc`/`dest` (NR schedule) and `formation` (Darwin) are attached server-side.
type RawTrain = {
  headcode: string;
  area: string;
  berth: string;
  toc?: string;
  dest?: string;
  formation?: TrainFormation;
};

/** Connect to the bridge. Returns a disconnect function. */
export function connectTdFeed(
  onTrains: (trains: Train[], rawCount: number) => void,
  onError: () => void,
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  const lastT = new Map<string, number>(); // for direction inference

  const toTrains = (raw: RawTrain[]): Train[] => {
    const out: Train[] = [];
    let unmapped = 0;
    for (const r of raw) {
      // Most precise first: a transcribed mileage (glides between stations);
      // then exact station coordinates; then the hand/demo line map.
      const mileage = berthMileagePosition(r.area, r.berth);
      const exact = mileage ? null : berthLatLng(r.area, r.berth);
      const demo = mileage || exact ? null : berthPosition(r.area, r.berth);
      const pos = mileage ?? exact ?? demo;
      if (!pos) {
        unmapped++;
        continue;
      }
      const id = `${r.area}:${r.headcode}`;
      const prev = lastT.get(id);
      // Prefer the berth's known direction (down/up from SMART) — it's exact
      // and puts the train on the correct rail of a double-track line. Only
      // infer from movement when the berth doesn't carry one.
      const berthDir = mileage?.dir ?? ("dir" in pos ? pos.dir : undefined);
      const direction: 1 | -1 =
        berthDir ?? (prev == null ? 1 : pos.t >= prev ? 1 : -1);
      lastT.set(id, pos.t);
      const line = LINE_BY_ID.get(pos.lineId);
      out.push({
        id,
        lineId: pos.lineId,
        headcode: r.headcode,
        operator: r.toc ?? "",
        t: pos.t,
        direction,
        speed: 0, // externally positioned; Train.tsx eases between berths
        // Real destination from the NR schedule where we have it; otherwise fall
        // back to the line's terminus (outbound) or Exeter (inbound).
        headingTo:
          r.dest ?? (direction === 1 ? line?.destination ?? "" : "Exeter St David's"),
        berth: r.berth,
        // Platform + its station, from whichever source places this berth.
        platform: mileage?.platform ?? exact?.platform ?? demo?.platform,
        station: mileage?.crs ?? demo?.crs,
        formation: r.formation,
        // No `pos`: even with exact coordinates we ride the spline (berthLatLng
        // already computed the nearest on-line t). Raw lat/lng sits slightly
        // off the drawn track and skips the double-track rail offset.
      });
    }
    if (unmapped > 0) {
      console.debug(`[td] ${unmapped} live train(s) in un-mapped berths (add them to berths.ts)`);
    }
    return out;
  };

  const open = () => {
    ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg?.type === "trains") {
          const raw: RawTrain[] = msg.trains ?? [];
          onTrains(toTrains(raw), raw.length);
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    ws.onerror = () => onError();
    ws.onclose = () => {
      if (!closed) setTimeout(open, 4000);
    };
  };

  open();
  return () => {
    closed = true;
    ws?.close();
  };
}
