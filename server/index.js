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

const PORT = Number(process.env.WS_PORT) || 4001;
const TD_TOPIC = process.env.TD_TOPIC || "TD_SW_SIG_AREA";
const EXPIRY_MS = 10 * 60 * 1000;

const state = new BerthState();
const { broadcast } = startWsServer(PORT, () => state.trains());

const live = process.env.NR_USERNAME && process.env.NR_PASSWORD;

if (live) {
  const { startStomp } = await import("./lib/stompClient.js");
  await startStomp({
    username: process.env.NR_USERNAME,
    password: process.env.NR_PASSWORD,
    topic: TD_TOPIC,
    onUpdate: (u) => state.apply(u),
  });
  console.log(`[td] LIVE: Network Rail TD (${TD_TOPIC}) → ws://localhost:${PORT}`);

  if (process.env.CAPTURE) {
    const { startCapture } = await import("./lib/capture.js");
    startCapture(state);
  }
} else {
  startReplay((u) => state.apply(u));
  console.log(`[td] REPLAY (no NR creds): synthetic demo → ws://localhost:${PORT}`);
  console.log("[td] Add server/.env (see .env.example) and run `npm run live` for real data.");
}

// Broadcast the current picture once a second and age out stale trains.
setInterval(() => {
  state.expire(EXPIRY_MS);
  broadcast({ type: "trains", trains: state.trains() });
}, 1000);

// Periodic heartbeat so it's obvious data is flowing (live mode only).
if (live) {
  setInterval(() => {
    const n = state.trains().length;
    const seen = state.seenBerths.size;
    console.log(`[td] tracking ${n} trains · ${seen} distinct berths seen so far`);
  }, 20000);
}
