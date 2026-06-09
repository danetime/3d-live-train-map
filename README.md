# 🚆 3D Live Train Map — Exeter

A low-poly, Minecraft-style **3D world** that shows trains moving around the
Exeter area. Built web-first (React + Three.js) so it runs in iPhone Safari today
and can later be wrapped into a real App Store / Play Store app with Capacitor —
all from one codebase.

This is the **Phase 1 prototype**: a runnable 3D scene of Exeter St David's and
the five lines radiating out to Barnstaple, Okehampton, Exmouth, Newton Abbot and
Taunton, with animated **simulated** trains. The world is dressed with the Exe &
Teign estuaries and the sea (traced from real coordinates), drifting blocky
clouds, distant Dartmoor/Exmoor hills and scattered low-poly trees. Real live
data is Phase 2 (see below).

![lines](public/train.svg)

## Run it

```bash
npm install
npm run dev      # open the printed local URL
```

Build a deployable, PWA-installable bundle:

```bash
npm run build
npm run preview
```

### Controls
- **Drag** to orbit, **scroll / pinch** to zoom.
- **Tap a train** (or a row in the Services list) to select it — the camera
  follows it and an info panel appears.
- Tap empty space to deselect.

## How it works

| Area | File(s) |
|---|---|
| Network data (stations + lines) | `src/data/network.ts` |
| lat/lng → flat 3D projection | `src/data/geo.ts` |
| Spline curves per line | `src/data/lineCurves.ts` |
| 3D scene (sky, sun, camera) | `src/scene/World.tsx` |
| Track / stations / trains | `src/scene/RailNetwork.tsx`, `Stations.tsx`, `Train.tsx` |
| Train state store | `src/store/useTrainStore.ts` |
| Data feed (mock now) | `src/sim/useTrainFeed.ts`, `src/sim/mockTrains.ts` |
| HUD overlay | `src/ui/Hud.tsx` |

Coordinates are approximate real-world lat/lng traced from OpenStreetMap /
OpenRailwayMap. Each line is smoothed into a spline, so a handful of waypoints is
enough to capture the route's shape — accuracy can be improved any time by
dropping more precise `railway=rail` coordinates into `network.ts`.

## Phase 2 — real live trains (Realtime Trains API) ✅ wired up

Network Rail's free feeds do **not** include train GPS coordinates (only
signal-berth positions over a STOMP stream, needing your own backend and a
signal→coordinate map). The pragmatic route for this app is the **Realtime Trains
(RTT) API** — simple REST/JSON, free for non-commercial use. This is implemented;
the app already tries the live feed and falls back to the simulation until you
add credentials.

**To go live:**

1. **Register** at <https://api-portal.rtt.io/> (free, non-commercial) for HTTP
   Basic auth credentials.
2. Copy the env template and fill them in:
   ```bash
   cp .env.example .env
   # edit .env → RTT_USERNAME=... and RTT_PASSWORD=...
   ```
3. `npm run dev` — the badge in the top-left flips from **SIM** to **LIVE** and
   real services calling at Exeter appear, animating along the lines.

**How it works:** the Vite dev proxy (`vite.config.ts`) forwards `/api/rtt/*` to
the RTT API and attaches the `Authorization` header server-side, so credentials
never reach the browser. `src/services/realtimeTrains.ts` fetches the services at
Exeter St David's, pulls each one's calling points, matches them to a line by CRS
code, and **interpolates** the train's progress along that line's spline from its
real timetable (RTT gives schedule + last-reported times, not GPS — smooth and
plenty accurate for this stylised map). For production, deploy the included
serverless proxy at `api/rtt/[...path].js` (Vercel-style) with the same two env
vars.

## Phase 3 — real berth-level signalling (Traksy-style) 🚦 in progress

The goal is a **3D version of a signalling map** like [Traksy](https://traksy.uk)
/ [OpenTrainTimes](https://www.opentraintimes.com/maps): trains shown as
headcodes hopping **signal berth to signal berth**, driven by Network Rail's
**Train Describer (TD)** feed.

This needs a small always-on backend (the TD feed is a STOMP stream a browser
can't read directly), which lives in **[`/server`](server/README.md)**:

```bash
cd server && npm install && npm start   # replay mode — demo berths, no account
```

Run that alongside `npm run dev` and trains hop berth-to-berth via the real
pipeline. For **live** data, register (free) at
<https://publicdatafeeds.networkrail.co.uk/>, add credentials, and run
`npm run live` — see [`server/README.md`](server/README.md). Because there's no
open berth→coordinate dataset, berths are hand-mapped onto lines in
`src/data/berths.ts` (the server's `capture` mode helps you discover the IDs).

The app selects its data source in `src/App.tsx`:
`"network-rail-td"` (berth feed), `"realtime-trains"` (timetable), or `"mock"`.
Any source falls back to the simulation if it isn't running, so the world is
never empty.

**Got real berth/signal coordinates?** That's the precise unlock — drop them
into `BERTH_COORDS` in `src/data/berths.ts` as either WGS84 lat/lng **or** OS
National Grid easting/northing (auto-converted), keyed by `area` + `berth`. Those
trains are then placed at their *exact* positions and face their direction of
travel, instead of being approximated along a hand-drawn line.

## Phase 4 — native apps (later)

Wrap the web build with **Capacitor** to produce native iOS/Android projects
(no rewrite), then ship via TestFlight / Play Console.

## Where the 3D / map data comes from

- **OpenStreetMap (Overpass API, <https://overpass-turbo.eu>)** — `railway=rail`
  line geometry and `building` footprints (extrude to low-poly blocks).
- **OpenRailwayMap (<https://openrailwaymap.org>)** — to sanity-check routes.
- **Ready-made low-poly assets** (CC0 / free): **Kenney.nl**, **Poly Pizza**,
  **Quaternius**, **Sketchfab**. Drop `.glb` models in and load with drei's
  `useGLTF` to replace the procedural boxes.

## Licensing note

Realtime Trains and Network Rail data carry usage terms (RTT is non-commercial by
default). Fine for a personal prototype; review before any paid release.
