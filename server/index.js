/**
 * Network Rail TD → WebSocket bridge.
 *
 *   node index.js                      → REPLAY mode (synthetic demo trains)
 *   node --env-file=.env index.js      → LIVE mode (needs NR_USERNAME/PASSWORD)
 *   CAPTURE=1 node --env-file=.env ...  → LIVE + log observed berths
 *
 * Browsers connect over WebSocket on WS_PORT and receive { type: "trains",
 * trains: [{ headcode, area, berth, updatedAt }] } snapshots once a second.
 */
import { BerthState } from "./lib/berthState.js";
import { startWsServer } from "./lib/wsServer.js";
import { startReplay } from "./lib/replay.js";
import { loadSchedule } from "./lib/schedule.js";

const PORT = Number(process.env.WS_PORT) || 4001;
// TD_ALL_SIG_AREA is the only reliable topic — the per-region topics (e.g.
// TD_SW = Scotland West, not South West!) have unmaintained mappings.
const TD_TOPIC = process.env.TD_TOPIC || "TD_ALL_SIG_AREA";
// Only track these signalling areas (Devon): EX = Exeter PSB main, ZY = Exmouth
// branch, PH = Plymouth. Keeps the all-UK feed down to our patch.
const AREAS = new Set(
  (process.env.TD_AREAS || "EX,ZY,PH").split(",").map((s) => s.trim()).filter(Boolean),
);
const EXPIRY_MS = 10 * 60 * 1000;

const state = new BerthState();

// Attach operator + destination from the Network Rail schedule (headcode →
// { toc, dest }). No-ops gracefully until `npm run schedule` has run.
const schedule = loadSchedule();
const enrich = (trains) =>
  trains.map((t) => {
    const info = schedule.lookup(t.headcode);
    return info ? { ...t, toc: info.toc, dest: info.dest } : t;
  });

const { broadcast } = startWsServer(PORT, () => enrich(state.trains()));

const live = process.env.NR_USERNAME && process.env.NR_PASSWORD;
// Diagnostic: count every area code seen in the raw feed (before filtering),
// so we can discover the real codes if our filter matches nothing.
const seenAreas = new Map();
const onUpdate = (u) => {
  seenAreas.set(u.area, (seenAreas.get(u.area) || 0) + 1);
  if (AREAS.size && !AREAS.has(u.area)) return; // ignore other regions
  state.apply(u);
};

if (live) {
  const { startStomp } = await import("./lib/stompClient.js");
  await startStomp({
    username: process.env.NR_USERNAME,
    password: process.env.NR_PASSWORD,
    topic: TD_TOPIC,
    onUpdate,
  });
  console.log(
    `[td] LIVE: Network Rail TD (${TD_TOPIC}, areas ${[...AREAS].join("/") || "all"}) → ws://localhost:${PORT}`,
  );

  if (process.env.CAPTURE) {
    const { startCapture } = await import("./lib/capture.js");
    startCapture(state);
  }
} else {
  startReplay((u) => state.apply(u)); // replay uses its own DEMO area
  console.log(`[td] REPLAY (no NR creds): synthetic demo → ws://localhost:${PORT}`);
  console.log("[td] Add server/.env (see .env.example) and run `npm run live` for real data.");
}

// Broadcast the current picture once a second and age out stale trains.
setInterval(() => {
  state.expire(EXPIRY_MS);
  broadcast({ type: "trains", trains: enrich(state.trains()) });
}, 1000);

// Periodic heartbeat so it's obvious data is flowing (live mode only).
if (live) {
  setInterval(() => {
    const n = state.trains().length;
    const seen = state.seenBerths.size;
    console.log(`[td] tracking ${n} trains · ${seen} distinct berths seen so far`);
    if (n === 0) {
      const top = [...seenAreas.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([a, c]) => `${a}:${c}`)
        .join(" ");
      console.log(`[td] (no matches) area codes seen in feed: ${top || "none yet"}`);
    }
  }, 20000);
}
