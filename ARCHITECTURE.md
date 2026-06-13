# Architecture — core vs view

This document maps the codebase into **portable core** (the engineering that
isn't tied to how the app looks) and the **view layer** (the current 3D art).
It exists so that if the project ever moves to a completely different visual
design, you know exactly what to lift over and what to leave behind.

> **The one idea that makes a reskin cheap:** the server emits a
> **render-agnostic JSON stream** over WebSocket. Anything that *produces* that
> stream is portable core; anything that *draws* it is replaceable. A new
> frontend — any art style, any engine, even a 2D map or a plain table — just
> connects to the socket and reads the same stream.

## The contract (the seam)

`server` broadcasts this once per second on `ws://<host>:4001`:

```jsonc
{
  "type": "trains",
  "trains": [
    {
      "headcode": "2T10",      // service id from the TD feed
      "area": "EX",            // signalling area
      "berth": "0123",         // current track-circuit berth
      "updatedAt": 1718300000, // epoch ms
      "toc": "GW",             // operator (from CIF schedule)         — optional
      "dest": "Paignton",      // destination (from CIF schedule)      — optional
      "formation": {           // real coaches/loading (from Darwin)   — optional
        "coaches": 9, "first": 1, "loading": 43, "src": "darwin"
      }
    }
  ]
}
```

A new frontend only needs to consume this. Everything below "produces" it.

## Data flow

```
Network Rail STOMP (TD berths) ─┐
Darwin RDM Kafka (formations) ──┤→  server/  ──(enrich: operator/dest/formation)──┐
CIF + SMART + CORPUS downloads ─┘   (Node)                                        │
                                                                                  ▼
                                                              WebSocket JSON stream  ── ws://:4001
                                                                                  │
                                            ┌─────────────────────────────────────┘
                                            ▼
                            src/services/networkRailTd.ts   (stream → domain Train[])
                                            │
                                            ▼
                            src/data/* domain model (network, track graph, mileage engine)
                                            │
                                            ▼
                            src/scene/* + src/ui/*  ◄── THE VIEW (replaceable)
```

---

## 1. Backend systems — `server/` · **portable (plain Node, no Three.js)**

| File | Responsibility |
|---|---|
| `index.js` | Orchestrator: pick feed → enrich with operator/dest + formations → broadcast |
| `stompClient.js` | Network Rail **STOMP** connection (live TD berth feed) |
| `tdParser.js` | Parse TD C-class messages (CA/CB/CC → berth steps) |
| `berthState.js` | In-memory "which headcode occupies which berth" + expiry |
| `wsServer.js` | WebSocket fan-out to browsers |
| `schedule.js` | headcode → operator / destination / CIF UID lookup |
| `darwinClient.js` | **Darwin** (Rail Data Marketplace) **Kafka** consumer |
| `darwinState.js` | Formation/loading correlation per RID + disk checkpoint |
| `replay.js` | Synthetic demo feed (runs with **no credentials**) |
| `capture.js` | Berth-capture diagnostic |

## 2. Pulling from Network Rail — feeds + pipeline · **portable**

**Live feeds**
- **TD berth feed** — STOMP, `publicdatafeeds.networkrail.co.uk:61618`, filtered
  to Devon areas EX/ZY/PH (`stompClient.js`).
- **Darwin formations** — RDM Kafka, SASL_SSL / PLAIN (`darwinClient.js`).
  *Wired; awaiting Rail Data Marketplace registration to go live.*

**Batch downloads** (NR account, HTTPS Basic auth) via `server/scripts/`
- `buildAllBerths.js` → **SMART + CORPUS** → `src/data/berthMileages.generated.json`
  (berth → mileage / direction / station / platform).
- `buildSchedule.js` → **CIF_ALL_FULL_DAILY** → `server/data/headcodeSchedule.generated.json`
  (headcode → operator / destination / UID).
- `extractMainLineBerths.js`, `buildBerthCoords.js` — auxiliary/older.

**Auth model:** `server/.env` — `NR_USERNAME` / `NR_PASSWORD`, `DARWIN_*`.

## 3. The "database" — **there is no DBMS** (and none needed at this scale)

What plays the database role, all portable:

- **Generated lookup tables** (≈ DB tables): `berthMileages.generated.json`
  (~108 berths), `headcodeSchedule.generated.json` (~575 headcodes),
  `darwinState.generated.json` (formation checkpoint).
- **Reference caches** (downloaded, gitignored): SMART, CORPUS, CIF schedule.
- **Hand-curated domain tables** (the hard-won IP): `network.ts`,
  `berthMileages.ts` (hand rows), `realSignals.ts`, `stationLayouts.ts`,
  `water.ts`.
- **In-memory runtime state:** `berthState` + `darwinState` on the server.

These map 1:1 onto real tables (berths, schedules, formations, signals) if a
proper database is ever wanted — but flat JSON + in-memory is sufficient here.

## 4. Domain logic — `src/data/` · **portable (no rendering)**

The reusable brains; none of this draws anything:

- `types.ts` — domain types (`Train`, `TrainFormation`, `Line`, `Station`).
- `network.ts` — network definition: lines, stations, the **two mileage datums**.
- `trackGraph.ts` — the **node/edge track graph** (topology) — newest core IP.
- `lineCurves.ts` — mileage ↔ position engine.
- `berthMileages.ts` / `berths.ts` — berth → position mapping.
- `realSignals.ts` — signal roster; `rollingStock.ts` — operator + formation/class inference.
- `geo.ts` / `osgb.ts` — lat-lng & OS-grid → world projection.

> Caveat: the *data and topology* port cleanly; the *projection into the current
> spatial model* (spline `t`-space, world coordinates) may be re-tuned for a new
> art design. `stationLayouts.ts` is data-ish but tuned to the current platform
> rendering.

## 5. View layer — `src/scene/`, `src/ui/` · **replaced on a reskin**

`World, RailNetwork, Train, Trains, Signals, Stations, StationDetail, Ground,
Water, Buildings, Clouds`, `Hud.tsx`, `styles.css`, camera/controls. This is the
art (Three.js / React-three-fiber). A different design rebuilds this.

## 6. The seam / hybrid bits

- `services/networkRailTd.ts` — consumes the WS stream → domain `Train[]`. The
  consumption + domain mapping is portable; the position output feeds the
  current renderer (light edits for new art).
- `sim/useTrainFeed.ts` — feed source selector (mock / live). Portable.
- `store/useTrainStore.ts` (Zustand) — the train-data slice is portable; the
  selection / theme / detail-level slice is view state.
- `sim/mockTrains.ts`, `sim/trainPositions.ts` — sim/view glue.

## 7. Dead code — **do not copy**

- `services/realtimeTrains.ts`, `services/headcodeDestinations.ts` — abandoned
  Realtime Trains integration, slated for deletion.

---

## Reskin verdict

**Keep wholesale**
- All of `server/` — backend + NR/Darwin feeds + download scripts.
- Every generated + reference table and the reference pipeline.
- The `src/data/` domain layer — types, `network.ts`, **`trackGraph.ts`**,
  `lineCurves.ts`, berths, signals, rolling stock, projection.

That's essentially all the engineering: live data plumbing, NR auth/parsing,
berth→position intelligence, and the network/graph model.

**Rewrite**
- `src/scene/*` + `src/ui/Hud.tsx` + `src/styles.css` — the visual layer only.

**Boundary:** the WebSocket JSON stream above. A new frontend opens the socket
and reads the train stream — nothing else needs to change.
