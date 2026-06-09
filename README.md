# 🚆 3D Live Train Map — Exeter

A low-poly, Minecraft-style **3D world** that shows trains moving around the
Exeter area. Built web-first (React + Three.js) so it runs in iPhone Safari today
and can later be wrapped into a real App Store / Play Store app with Capacitor —
all from one codebase.

This is the **Phase 1 prototype**: a runnable 3D scene of Exeter St David's and
the five lines radiating out to Barnstaple, Okehampton, Exmouth, Newton Abbot and
Taunton, with animated **simulated** trains. Real live data is Phase 2 (see below).

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

## Phase 2 — real live trains (Realtime Trains API)

Network Rail's free feeds do **not** include train GPS coordinates (only
signal-berth positions over a STOMP stream, needing your own backend and a
signal→coordinate map). The pragmatic route for this app is the **Realtime Trains
(RTT) API** — simple REST/JSON, free for non-commercial use.

1. **Register** at <https://api-portal.rtt.io/> to get HTTP Basic auth
   credentials.
2. **Keep credentials off the client.** Add a small proxy that injects the
   `Authorization` header:
   - Dev: a Vite proxy under `/api/rtt` → `https://api.rtt.io`.
   - Prod: a serverless function (Cloudflare/Vercel) holding the secret.
3. Implement `src/services/realtimeTrains.ts` (`fetchExeterServices` +
   `toTrains`) and switch the feed in `src/App.tsx` from `"mock"` to
   `"realtime-trains"`.

RTT gives schedule + last-reported timing point (not GPS), so each train's
position is **interpolated** along its baked line between the last reported
station and the next — smooth, and plenty accurate for this stylised map.

## Phase 3 — native apps (later)

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
