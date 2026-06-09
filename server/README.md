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

## Real berth coordinates (from Network Rail open data)

The berth map can be built automatically instead of hand-placed. Network Rail
doesn't publish berth lat/longs directly, but three reference files chain to
produce them:

```
SMART   berth (TD area + berth) → STANOX        (publicdatafeeds … type=SMART)
CORPUS  STANOX ↔ TIPLOC ↔ CRS                   (publicdatafeeds … type=CORPUS)
coords  STANOX / TIPLOC → easting/northing or lat/long
```

`scripts/buildBerthCoords.js` downloads SMART + CORPUS (with your NR creds),
joins them to a coordinate table, converts OS grid refs via `shared/osgb.js`,
and writes `../src/data/berthCoordinates.json` — which the client loads into
`BERTH_COORDS`. Trains then render at their **real** (location-level) positions.

**Try it offline first (no account):**

```bash
npm run build:coords:sample   # uses server/data/sample/*, prints resolved berths
```

**For real:**

1. Provide a coordinate table at `server/data/locations.csv` with columns
   `STANOX` and/or `TIPLOC`, plus `LAT`,`LON` **or** `EASTING`,`NORTHING`. Get it
   from BPLAN/TPS geography (Rail Data Marketplace) or an open community dataset
   (e.g. the openraildata "TIPLOC Eastings and Northings" list).
2. With `NR_USERNAME`/`NR_PASSWORD` set in `.env`:
   ```bash
   npm run build:coords            # optionally TD_AREAS="EX,SW" to filter
   ```
3. Rebuild/restart the app — live TD trains now appear at real positions.

> Precision is **location-level** (each berth at its reporting location);
> signal-precise positions (e.g. from OpenStreetMap signals) are a later refinement.

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
