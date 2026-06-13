# 3D Live Train Map — Project Handoff / Context Brief

A single source of truth for continuing this project in a fresh session. Read
this whole file first; it captures the architecture, the data conventions, every
decision we've made, and the open items.

---

## 1. What this is

A **3D live train map of the Exeter area** (Devon main line + Torbay, Exmouth,
and Taunton branches). Real trains from the Network Rail feed glide along splined
track in a Three.js world, with clickable trains and lineside signals that show
red/green aspects.

**Stack**
- **Client:** React 18 + `@react-three/fiber` / `drei` (Three.js), Vite, TypeScript, Zustand store.
- **Server:** Node (ESM) bridge in `/server` — subscribes to the Network Rail STOMP feed (TD berths) and optionally the Darwin Kafka feed (formations, §9), and fans out enriched train snapshots to the browser over a WebSocket.
- **Data scripts:** Node scripts under `/server/scripts` that download Network Rail reference/feed files and bake lookup tables into `/src/data`.

**Two ways trains can be sourced** (`src/sim/useTrainFeed.ts`):
- `network-rail-td` — the real berth-level TD feed via the `/server` bridge (this is the default, set in `src/App.tsx`).
- `realtime-trains` — legacy RTT polling. **Dead/unused** (see §8). 
- `mock` — synthetic fallback so the world is never empty.

---

## 2. How to run

**Frontend** (from repo root):
```bash
npm install
npm run dev            # Vite dev server; open the printed URL
npm run build          # tsc -b && vite build  (CI gate — keep this green)
```

**Server bridge** (from `/server`, needs `server/.env` with Network Rail creds):
```bash
cd server && npm install
npm run live           # LIVE: connects to NR TD feed (NR_USERNAME/NR_PASSWORD)
npm start              # REPLAY: synthetic demo, no creds
```
`server/.env` (gitignored):
```
NR_USERNAME=...        # Network Rail Open Data (publicdatafeeds.networkrail.co.uk)
NR_PASSWORD=...
```

**Data scripts** (run on a machine with the NR creds; they cache downloads):
```bash
cd server
npm run berths:all     # builds src/data/berthMileages.generated.json (berth→mileage+dir)
npm run schedule       # builds data/headcodeSchedule.generated.json (headcode→operator+dest)
```

> **Important workflow note:** the live NR feed and the big downloads only run on
> the user's own machine (the dev container can't reach the feed with creds). The
> established loop is: implement → push → **the user runs the script on their Mac
> and pastes the summary output** → refine. Don't assume you can run the live feed.

---

## 3. Key files

| Area | File |
|---|---|
| Lines, stations, mileages | `src/data/network.ts` (`LINES`, `STATIONS`, `LINE_MILEAGES`) |
| Mileage→curve param | `src/data/lineCurves.ts` (`mileageToT`, `milesChains`, `lineStopParams`) |
| **Signals (numbers + positions)** | `src/data/realSignals.ts` |
| Signal rendering + red/green logic | `src/scene/Signals.tsx` |
| Berth → position + direction | `src/data/berthMileages.ts`, `src/data/berths.ts`, `src/data/berthMileages.generated.json` |
| Station platform lanes (frame shared by drawing + train parking) | `src/data/stationLayouts.ts`, `src/scene/StationDetail.tsx` |
| TD WebSocket client | `src/services/networkRailTd.ts` |
| Operator name + stock inference | `src/data/rollingStock.ts` |
| Camera / controls / themes | `src/scene/World.tsx` |
| HUD / info panels | `src/ui/Hud.tsx`, `src/styles.css` |
| Store | `src/store/useTrainStore.ts` |
| Server entry | `server/index.js` |
| Server schedule loader | `server/lib/schedule.js` |
| Darwin Kafka consumer | `server/lib/darwinClient.js` |
| Darwin formation state + correlation | `server/lib/darwinState.js` |
| Berth generator | `server/scripts/buildAllBerths.js` |
| Schedule generator | `server/scripts/buildSchedule.js` |

---

## 4. THE MILEAGE DATUM SYSTEM (read this — it underpins everything)

There are **two mileage datums** in play and they differ by a constant south of
Exeter:

- **Our datum = Paddington via Westbury.** Everything in the code
  (`LINE_MILEAGES`, berth tables, signal `at` values) uses this. Exeter St
  David's (EXD) = **173m 56ch**.
- **Lineside mileposts / GWR diagrams = Paddington via Bristol.** EXD ≈ **193m 72ch**.

**The offset is a constant +20m 16ch from Exeter St David's southward** (same
physical track). Verified two ways:
- EXD: 193m72ch (Bristol) − 173m56ch (ours) = **+20m 16ch** — matches the textbook via-Bristol/via-Westbury difference.
- DM206 is "end of Dawlish platform 1"; Dawlish = 185m64ch (ours); 206m − 20m16ch = 185m64ch ✓.

A second anchor (Newton Abbot: Bristol 214m05ch vs ours 194m0ch = +20m5ch) showed
an **11-chain disagreement** — meaning our `LINE_MILEAGES` backbone is slightly
rough (NTA was a round guess). We therefore:
- Use the **canonical Exeter offset +20m16ch** for milepost-numbered signals.
- Would use **per-station local offsets** if/when converting platform-precise data.

**Milepost-numbered signals** — DM (Down Main), DT (Down Torbay), UM (Up Main),
UT (Up Torbay) signals are **numbered by their lineside milepost**. So:
```
our_datum_decimal_miles = milepost − 20.2     // 20.2 = milesChains(20,16)
```
In `realSignals.ts` this is the `mp()` helper. Plain `E`-prefixed panel signals
carry **no** milepost — they're given an approximate `at` mileage or anchored to
a station with `near`/`nudge`.

`1 mile = 80 chains`. `mc(miles, chains)` / `milesChains()` convert to decimal.

---

## 5. Network: lines, stations, mileages

`src/data/network.ts` defines four lines (`LINES`), each an ordered CRS list with
a 1:1 `LINE_MILEAGES` array (our via-Westbury datum):

- **`newton-abbot`** "Main Line" → Plymouth, **doubleTrack**:
  EXD 173m56 · EXT(St Thomas) 174m32 · **MRB(Marsh Barton) 175m64** · SCS(Starcross) 181m40 · DWW(Dawlish Warren) 184m24 · DWL(Dawlish) 185m64 · TGM(Teignmouth) 188m24 · NTA 194m0 · TOT 202m48 · IVY 215m0 · PLY 225m56
- **`paignton`** "Riviera Line" → Paignton, `drawFrom: "NTA"` (shares trunk):
  …NTA 194m0 · TRR(Torre) 197m48 · TQY(Torquay) 198m48 · PGN(Paignton) 200m8
- **`taunton`** "Main Line" → Taunton, **doubleTrack**, mileage *decreases* toward London:
  EXD 173m56 · TVP(Tiverton Parkway) 159m16 · TAU(Taunton) 143m0
- **`exmouth`** "Avocet Line" → Exmouth (its own datum):
  EXD · EXC(Exeter Central) 0m44 · SJP · POL · DIG · NCO · TOP · EXN · LYC · LYM · EXM 10m20

**Marsh Barton (MRB)** was repositioned 175m8ch → **175m64ch** from the diagram
(196m via Bristol − 20m16ch). It has **no TD berth**, so trains never stop on its
dot — they pass it pinned to neighbouring circuits. Open nuance: if the diagram's
"196m" is the **DM196 signal** rather than the platform, the dot sits slightly
south of the true platform.

**Direction convention:** `dir +1 = Down` (away from Exeter, toward
Plymouth/Paignton/Exmouth), `dir −1 = Up` (toward Exeter / London). "Up" = toward
London — that's why the Taunton line's mileage falls toward Taunton.

---

## 6. SIGNALS — the full roster (`src/data/realSignals.ts`)

Structure: `DATA[lineId] = RealSig[]`, where
`RealSig = { id, dir, at?, near?, nudge? }`. `at` = true decimal miles (our
datum); milepost signals use `at: mp(<milepost>)`. `realSignalsFor()` converts
`at`→`t` via `mileageToT`, or falls back to `near`+`nudge`. Direction comes from
the diagram labelling, **not** number parity (e.g. E388 is even but Up).

`Signals.tsx` draws real signals where we have them and **fills the rest of each
route with synthetic posts** beyond the last real signal per direction. Synthetic
fill is suppressed wherever real coverage exists. Red while a train occupies the
block ahead, green otherwise.

### `newton-abbot` — DOWN (dir +1), St David's → Newton Abbot
St David's platform starters: **E160**(P1), **E260**(P3), **E60**(P4),
**E360**(P5), **E460**(P6) · **E62** · **DM196**(Marsh Barton) DM197 DM198 DM200
DM201 **DM202**(Starcross) DM203A DM203B · **E68** · **E170**(Dawlish Warren
stn/down loop) **E70**(DWW main) **E72** · **DM206**(Dawlish P1) DM207 DM208 ·
**E78**(Teignmouth P1) · DM209 DM210 DM211 DM212 · **E84 E86** · **E88**(NTA Down
Main).

### `newton-abbot` — UP (dir −1), Newton Abbot → St David's
Newton Abbot: **E188**(Up/Down Relief) **E388**(Up Main) **E11**(P3 Up Main)
**E211**(P2 Down Main — note dir **+1**) **E311**(P1 Up/Down Relief) · **E13** ·
UM212 UM211 UM210 · **E15** · **UM208** (*transcribed as "UN208" — read as
UM208*) UM207 UM206(Dawlish) · **E17 E19 E21** · **E23**(DWW Up Main)
**E123**(DWW Up Loop) · **E25** · UM202(Starcross) UM201 UM200 UM199 UM197
UM196(Marsh Barton) · **E31** · **E33**(St Thomas P2) · **E35**(St David's home)
· St David's up starters: **E137**(P6) **E37**(P5) **E237**(P4) **E337**(P3)
**E437**(P1) **E537**(P2 bay).

### `paignton` — DOWN (dir +1), Newton Abbot → Paignton
**E190**(Aller) · **DT218R**(distant/repeater for DT218) · **DT218**(Torre)
**DT219**(Torquay) **DT220**(Paignton approach) · **PN1 PN3 PN7**(Paignton
platforms).

### `paignton` — UP (dir −1), Paignton → Newton Abbot
**PN4**(Paignton P2) · **UT220** **UT219**(Torquay P2) **UT218**(Torre) ·
**E109R**(Aller repeater) **E109**(Aller).

### `taunton` & `exmouth` — still **eyeballed** (pending transcription)
Old `near`+`nudge` guesses retained: taunton = E54,E56(up), E660,E664,E256(down);
exmouth = E731,E730,E310,E732, EJ8,EJ7,EJ108,EJ106,EJ80. Synthetic fill still on
for these two lines until their real signals are transcribed.

### Removed
Deleted as junk/old: **E677, E679, E681, E673, E687, E703, E711** (and old
eyeballed up guesses E35-old/E33-old/E31-old, E109R-old, UT218/UT219-old).
**Ground-position / shunt signals (GPLs) are excluded** — they're not running
signals and must not show a main aspect. If new lists include them, flag and drop.

### OPEN SIGNAL QUESTIONS
1. **Newton Abbot — RESOLVED:** six distinct signals, three at each platform end
   (~20ch apart). **East/Exeter end** = E11/E211/E311 (~193.88), **West/Plymouth
   end** = E88/E188/E388 (~194.12).
2. **St David's up-end platform starters** (E137…E537) are placed just south of
   EXD on the up rail — the single-spline-per-route model can't route them up the
   Taunton junction throat. Cosmetic; revisit if it reads oddly.

---

## 7. Berths / the live TD feed

- Server (`server/lib/stompClient.js`) subscribes to `TD_ALL_SIG_AREA`, filtered
  to Devon areas **EX, ZY, PH** (`server/index.js`). Parses C-class messages
  (CA/CB/CC) → `{headcode, area, berth}`; `berthState.js` tracks current berths.
- `buildAllBerths.js` builds **berth → mileage + direction** for the whole EX
  panel using SMART (berth→STANOX+event) + CORPUS (STANOX→CRS). Output:
  `src/data/berthMileages.generated.json`, merged *under* hand-curated
  `BERTH_MILEAGES` (hand wins). Last run: **108 berths across 14 stations.**
- Stations unreachable from this feed: **Plymouth & Ivybridge** (different TD
  panel) and the **Exmouth branch intermediates** (token-worked, no per-station
  berths). Lighting them up needs a **second TD area** (Plymouth panel).
- Direction: prefer the berth's own SMART direction; else infer from movement
  (`src/services/networkRailTd.ts`).

### Platform parking — Exeter St David's (BUILT)

Berth tables now carry **`crs` + `platform`**: hand rows in `berthMileages.ts`
cover all EXD platform berths in both directions (a platform's TD berth is
named for its starting signal — down E160/E260/E060/E360/E460 = P1/3/4/5/6, up
E137/E037/E237/E337/E437/E537 = P6/5/4/3/1/2), and `buildAllBerths.js` now also
emits SMART's PLATFORM column for every generated berth (**needs a re-run**).

`src/data/stationLayouts.ts` defines EXD's local frame + per-platform track-lane
X offsets, shared by `StationDetail.tsx` (drawing; numbers sit beside their
faces) and `Train.tsx` (a third placement mode: when a train's berth has
crs+platform and the station is modelled, it glides onto that lane instead of
stacking on the station dot). Clicking the station (amber disc at the hub, any
zoom — or the platform model itself) selects it: the camera does a one-shot
bird's-eye glide overhead (then orbit/zoom are free again) and the HUD shows a
P1–P6 occupancy list (tap a row to select that train). `selectedStation` in the
store is mutually exclusive with train/signal selection.

Replay mode demos it with zero creds: each line's `*01` demo berth is EXD with
a platform (main 4, taunton 5, exmouth 1, paignton 6).

**DISCOVERY:** the committed `src/data/berthMileages.generated.json` is an
EMPTY placeholder — the user's 108-berth run only ever existed on their Mac.
Next `npm run berths:all` (now with platforms) should be **committed + pushed**.

---

## 8. Operator + destination — NR-NATIVE (RTT was abandoned)

**Why RTT was dropped:** Realtime Trains migrated to a new token API
(`data.rtt.io`, Bearer/JWT) incompatible with the old Basic-auth integration in
the code. Rather than rework for a rate-limited third party, we went **NR-native**
using the Network Rail **SCHEDULE (CIF)** feed the user already has access to.

**Pipeline:**
1. `server/scripts/buildSchedule.js` streams the daily **CIF_ALL_FULL_DAILY**,
   keeps workings that **call on our patch** and **run today**, and writes
   `server/data/headcodeSchedule.generated.json` =
   `{ headcode: [{ toc, dest, dep }] }`. Uses CORPUS for tiploc→name.
   Last run: **692 on-patch workings, 575 headcodes** — operators
   `GW:518 SW:75 XC:57 ZZ:22 AW:20`.
2. `server/lib/schedule.js` loads that table, resolves the **active working by
   departure time** when a headcode has several, and `server/index.js` attaches
   `{ toc, dest }` to every train in the WebSocket feed. Auto-reloads the file
   within 10 min, so re-running `npm run schedule` daily keeps it fresh.
3. Client (`networkRailTd.ts`) reads `toc`/`dest` straight off the feed.
   `operatorName()` maps ATOC codes → friendly names (GW→GWR, XC→CrossCountry,
   SW→South Western Railway, AW→Transport for Wales, ZZ→Charter/other).

**Dead RTT code** (safe to delete when convenient): `src/services/realtimeTrains.ts`,
`src/services/headcodeDestinations.ts`, the `realtime-trains` branch of
`useTrainFeed.ts`, and the `/api/rtt` proxy in `vite.config.ts`.

---

## 9. Rolling stock (class + carriages)

`src/data/rollingStock.ts` → `inferStock()` returns a **clearly-labelled estimate**
(the panel prefixes it "est."):
- GWR main-line express (headcode `1…`, main/taunton line) → Class 800/802 IET (5 or 9 cars)
- GWR branch/regional → Class 150/158/166 Sprinter/Turbo (2–3 cars)
- CrossCountry → Class 220/221 Voyager (4–5 cars)
- SWR → Class 158/159 (3 cars)

**Hard truth:** the **unit number** ("802006") is **not in any open feed** — and
the unit class is never named either; but with Darwin's real coach count the
class inference becomes near-certain (9-car GWR main line ⇒ IET).

### Darwin formations — BUILT (awaiting first live run)

**Transport reality check (the old §9 was wrong):** the Rail Data Marketplace
serves Darwin over **Kafka + JSON only — there is no STOMP option** (STOMP/XML
was the legacy National Rail feed). Confirmed from the official client repo
(`raildatamarketplace/rdm-darwin-kafka-client`): SASL_SSL, mechanism **PLAIN**,
username/password = the subscription's **Consumer key/secret**, message value =
UTF-8 JSON envelope with the Pport message nested as a JSON **string** in its
`bytes` field.

**Server** (all optional — without `DARWIN_*` env everything runs as before):
- `server/lib/darwinClient.js` — kafkajs consumer (lazy-imported like stompit;
  non-blocking at boot; throttled one-line kafka errors). Defensive decode:
  `bytes`-JSON, base64, gzip, and raw-XML detection. `DARWIN_DEBUG=1` saves the
  first raw messages (+ first scheduleFormations/formationLoading) to
  `server/data/darwinSamples/` for wire-shape inspection.
- `server/lib/darwinState.js` — parses Pport-as-JSON with tolerant helpers
  (`attr`/`textOf`/`collectDeep` accept plain/`@`/`@_`/`$`-bag conventions since
  RDM's XML→JSON conversion is undocumented). Tracks per-RID records; correlates
  RID→headcode two ways: Darwin `schedule.trainId` directly, and `TS.uid` → CIF
  UID → headcode (works for trains already running at startup). Scores
  candidates when an all-UK headcode collides (today's ssd, TOC match, has
  data). Coach count falls back to counting `formationLoading` coaches when no
  `scheduleFormations` was seen. Checkpoints formation/loading records to
  `server/data/darwinState.generated.json` every minute (Darwin only re-sends on
  change, so restarts must not forget).
- `buildSchedule.js` now writes `uid` per working and `schedule.js` exposes
  `headcodeForUid`/`tocFor`/`has` — **re-run `npm run schedule` once** so the
  table gains UIDs.
- `index.js` attaches `formation: { coaches, first?, loading?, src: "darwin" }`
  to every matched train in the WS feed and logs a `[darwin]` summary line every
  30 s (message mix · rids · on-patch headcodes · attached/tracked) — that's the
  line to paste back.

**Client:** `Train.formation` (types.ts) flows through `networkRailTd.ts`;
`inferStock()` (rollingStock.ts) sharpens the class from a live count (4 ⇒ 220,
5 ⇒ 221, 9 ⇒ IET, 10 ⇒ 2× IET, short GWR "express" ⇒ actually a Sprinter) and
the panel (Hud.tsx) drops "est.", marks "(live)", and shows `n× First` and
`~NN% full` when present.

**User setup (on the Mac):** subscribe (free) to "Darwin Real Time Train
Information (PubSub)" at <https://raildata.org.uk> → copy the connection values
into `server/.env` (`DARWIN_BROKERS/USERNAME/PASSWORD/TOPIC`, see
`.env.example`) → `cd server && npm install` → `npm run schedule` → `npm run
live`, first time ideally with `DARWIN_DEBUG=1`. Paste back the `[darwin]`
lines and one file from `data/darwinSamples/` so the parser can be tightened
against the real wire shape.

**Open:** exact RDM JSON field conventions unverified until that first run (the
parser is deliberately convention-tolerant); `DARWIN_OFFSET=earliest` would
replay the all-UK backlog to catch overnight formation messages (heavy — default
`latest` relies on intra-day formation/loading traffic, which GWR sends
constantly). Coverage good for GWR, patchier elsewhere.

---

## 10. Camera, controls, themes (`src/scene/World.tsx`, store)

- **Themes** (`useTrainStore.theme`): **`"dev"`** = the dark signalling-diagram
  view (black bg + wireframe rails) — the **default + stable bug-fixing view**;
  **`"land"`** = low-poly landscape (ground/water/buildings/clouds). HUD has a
  **🛠 Dev Mode / 🗺 Map Mode** toggle.
- **Selecting a train** eases once into an oblique 3/4 framing, then **follows**
  the train by translating the camera with its motion — **orbit & zoom stay under
  user control** (no forced top-down snap-back). `CameraRig` in `World.tsx`.
- **Selecting a station** (EXD only so far) glides once to a bird's-eye view
  ~36 units up, slightly north of nadir so the platform numbers read upright,
  then releases control. Station detail force-renders while selected.
- **Controls** (OrbitControls, Mac-trackpad friendly): **left-drag / one finger =
  PAN**, **right-drag / two-finger = ROTATE**, wheel/pinch = zoom. (Possible
  follow-up: bind rotate to hold-key+drag if right-drag feels fiddly.)
- **Detail levels** by camera distance drive what renders (signals appear at
  level ≥2, platform detail at 3).

---

## 11. Conventions & workflow

- **Branch:** `claude/nifty-goldberg-1ubft1` (continues from
  `claude/train-tracking-3d-app-jrr3lr`). Develop on the session's designated
  branch, commit with clear messages, push (`git push -u origin <branch>`). Do
  **not** open PRs unless asked.
- **CI gate:** keep `npm run build` (`tsc -b && vite build`) green before pushing.
- **The user runs the live feed + big downloads on their own Mac** and pastes the
  summary lines; iterate from there. The dev container cannot reach the live feed.
- Mileage edits: always state which datum, and reconcile via the +20m16ch offset.

---

## 12. Open items / TODO (priority-ish)

1. **Darwin formations — built; verify against the live feed** (§9): user
   registers on raildata.org.uk, fills `DARWIN_*` in `server/.env`, re-runs
   `npm run schedule` (UIDs), runs `npm run live` with `DARWIN_DEBUG=1`, pastes
   the `[darwin]` lines + a `darwinSamples/` file; tighten the parser from that.
2. **Taunton & Exmouth signals** — still eyeballed; transcribe real numbers + drop
   their synthetic fill (§6).
4. **Second TD area (Plymouth panel)** — to light up Plymouth/Ivybridge and
   extend coverage (§7).
5. **St David's up-starter placement** at the junction throat — revisit if odd.
6. **Per-platform train spread — DONE for Exeter St David's** (§7): trains park
   on their platform lane, click-the-station bird's-eye + P1–P6 HUD panel.
   Remaining: (a) user re-runs `npm run berths:all` and **commits the
   regenerated `src/data/berthMileages.generated.json`** (adds SMART platforms
   everywhere + restores the 108-berth coverage that was never pushed);
   (b) lanes for other stations (NTA next) once their platform data is in.
7. **Delete dead RTT code** (§8).
8. **Land/Map mode UI polish** — the user intends to redesign UI/UX; Dev Mode is
   preserved as the stable view to fall back to.

---

## 13. Track-graph migration (AGREED DIRECTION — step 1 done)

**Why:** the recurring "untidy junctions / overlapping lines" problem (worst at
St David's↔Exeter Central) is not a signal or offset bug — it's the core model.
Each line is an independent spline with no shared metals and no junctions, so
routes that share track or diverge merely overlap on screen. The user chose
(2026-06) to invest once in a **track graph** rather than keep patching splines.

**Model:** NODES (stations/junctions/termini, keyed by CRS, shared across lines)
joined by EDGES (a track segment between adjacent nodes, owning geometry,
double-track capability and a mileage range). Trains ride edges and pick a path
at each node, so junctions are explicit instead of overlapping. Signals/blocks
and berth positions become edge-relative.

**Staged plan (each step ships, app keeps working — no big-bang):**
1. **DONE** — `src/data/trackGraph.ts`: graph types + `buildTrackGraph` from the
   existing line data; helpers `edgePointAt`, `sampleEdge`, `lineTToEdge`
   (legacy `(lineId,t)`→`(edge,s)` bridge for steps 3–4), `junctions`,
   `trackGraphStats`. Edge geometry is an arc-length t-range on the CURRENT
   spline, so it's byte-faithful; verified max deviation **2.6e-14** world units
   over 400 samples/line. Auto-detects **EXD** and **NTA** as junctions; 26
   nodes / 32 edges (7 = Paignton's shared trunk, `drawn:false`). Nothing renders
   from it yet; no train/signal/render code touched. Re-run the check anytime
   with the throwaway script pattern in the chat (tsx from project root).
2. **DONE** — `RailNetwork.tsx` renders from the graph: `railRuns(lineId)` in
   `trackGraph.ts` groups a line's drawn edges into continuous ribbons (merging
   while `doubleTrack` matches; first/last edge clamps to t 0/1 to match the old
   spline-end behaviour). Verified **0.0** vertex delta vs the old per-line tubes
   — byte-identical. `GAUGE` still exported from `RailNetwork.tsx`. Each line is
   one run today; later steps split runs without touching the renderer.
3. **DONE** — `Train.tsx` spline mode resolves position + tangent via the graph
   edge (`lineTToEdge` → `edgePointAt`/`edgeTangentAt`) instead of the line
   curve. Verified identical: worst position Δ 2.5e-13, heading Δ 3.5e-13 over
   500 samples × both directions × all lines. Lateral rail offset still
   line/t-based (revisited once edges carry independent geometry). Point mode +
   platform parking untouched.
4. **DONE** — `Signals.tsx` derives each signal's double-track flag (rail offset
   + same-direction-only occupancy) from the EDGE it sits on (`lineTToEdge`)
   rather than the line. Verified identical over 1000 samples/line (no overrides
   yet). Block stays line-t (trains are line-t; identical and survives step 5).
5. **NEXT (the visible payoff)** — model the St David's↔Central topology: double
   track Exeter→Central, single beyond (Exmouth Jn). Per-edge `doubleTrack`
   override in the graph; renderer/signals/trains already read it per-edge.
5. Add REAL topology where it matters, **St David's/Central first**: split the
   Exmouth line into double-track edges + Exmouth Jn node + branch, double track
   to Pinhoe (per user's local knowledge). This is where the junction goes tidy,
   touching only that locality. Merge the duplicated EXD→NTA trunk edges here too.
6. Bring in the user's 3D area model (**GLB**, committed under `public/`) as the
   world backdrop; align rails to it via 2 reference points + scale; lay
   edge-rails over it.

**GLB note:** user is exporting an area model — GLB chosen (native to Three.js
via drei `useGLTF`; STL=geometry-only, 3MF=print-oriented). Goes in `public/`
(Vite serves it; loaded at runtime, not bundled). It's the *backdrop*, separate
from track topology. Needs georeferencing (2 known points + metres scale).
