# TD feed bridge (`/server`)

The Traksy-style data source: a small Node service that subscribes to Network
Rail's **Train Describer (TD)** feed over STOMP, tracks which headcode is in
which signal **berth**, and relays it to the browser app over WebSocket.

Runs in two modes:

| Mode | When | What you see |
|---|---|---|
| **Replay** | no credentials | synthetic demo trains hopping berths — the whole pipeline works with zero setup |
| **Live** | credentials set | real trains stepping signal-to-signal in the South West |

## Run it

```bash
cd server
npm install
npm start          # REPLAY mode — demo trains, no account needed
```

Then run the app (`npm run dev` in the project root) and it connects to
`ws://localhost:4001`. The HUD badge shows **LIVE** when berth data is flowing.

## Go live (real Network Rail data)

1. **Register** (free) for Network Rail Open Data at
   <https://publicdatafeeds.networkrail.co.uk/> and enable the **TD** feed.
2. Add credentials:
   ```bash
   cp .env.example .env
   # edit .env → NR_USERNAME, NR_PASSWORD
   ```
3. Start in live mode:
   ```bash
   npm run live
   ```
   It subscribes to `TD_SW_SIG_AREA` (South West — Exeter/Newton Abbot). Set
   `TD_TOPIC=TD_ALL_SIG_AREA` in `.env` to receive the whole network.

## The berth map (the one manual bit)

The TD feed says *which berth* a train is in, but there is **no open dataset of
berth coordinates** — so, exactly like Traksy/OpenTrainTimes, we hand-map berths
onto lines. To discover the real berth IDs for our area:

```bash
npm run capture     # live mode + writes server/data/observed-berths.json every 30s
```

Leave it running for a while, then open `server/data/observed-berths.json` — it
lists every berth seen with its last headcode. Map the ones on our routes onto
lines in **`../src/data/berths.ts`** (`REAL_BERTHS`), giving each a `lineId` and
a `t` (0..1 along the line). Mapped berths immediately start showing trains.

## How it fits together

```
Network Rail STOMP ──(CA/CB/CC berth steps)──▶ tdParser ─▶ BerthState
                                                              │
                                          1s snapshots over WebSocket
                                                              ▼
   browser: networkRailTd.ts ─▶ berths.ts (berth → line + t) ─▶ 3D trains
```

- `lib/stompClient.js` — STOMP connection + durable subscription
- `lib/tdParser.js` — CA/CB/CC → normalised updates
- `lib/berthState.js` — current berth ↔ headcode, with expiry
- `lib/wsServer.js` — WebSocket fan-out to browsers
- `lib/replay.js` — synthetic demo feed
- `lib/capture.js` — logs observed berths for mapping
