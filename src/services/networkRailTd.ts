/**
 * Client for the Network Rail TD bridge (the /server WebSocket).
 *
 * Receives berth snapshots ({ headcode, area, berth }), maps each berth to a
 * position on our network (src/data/berths.ts) and emits `Train`s for the 3D
 * layer. Trains with berths we haven't mapped yet are skipped (and counted, so
 * you can see how many are waiting to be mapped). Reconnects automatically.
 */
import type { Train } from "../data/types";
import { berthPosition, berthLatLng } from "../data/berths";
import { LINE_BY_ID } from "../data/network";

const WS_URL = (import.meta.env.VITE_TD_WS_URL as string) || "ws://localhost:4001";

type RawTrain = { headcode: string; area: string; berth: string };

/** Connect to the bridge. Returns a disconnect function. */
export function connectTdFeed(
  onTrains: (trains: Train[]) => void,
  onError: () => void,
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  const lastT = new Map<string, number>(); // for direction inference

  const toTrains = (raw: RawTrain[]): Train[] => {
    const out: Train[] = [];
    let unmapped = 0;
    for (const r of raw) {
      // Prefer exact coordinates if we have them; else the line map.
      const exact = berthLatLng(r.area, r.berth);
      const pos = exact ?? berthPosition(r.area, r.berth);
      if (!pos) {
        unmapped++;
        continue;
      }
      const id = `${r.area}:${r.headcode}`;
      const prev = lastT.get(id);
      const direction: 1 | -1 = prev == null ? 1 : pos.t >= prev ? 1 : -1;
      lastT.set(id, pos.t);
      const line = LINE_BY_ID.get(pos.lineId);
      out.push({
        id,
        lineId: pos.lineId,
        headcode: r.headcode,
        operator: "",
        t: pos.t,
        direction,
        speed: 0, // externally positioned; Train.tsx eases between berths
        headingTo: direction === 1 ? line?.destination ?? "" : "Exeter St David's",
        berth: r.berth,
        pos: exact ? exact.ll : undefined,
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
        if (msg?.type === "trains") onTrains(toTrains(msg.trains ?? []));
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
