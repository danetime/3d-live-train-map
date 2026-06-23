# ExeterLive — native iPhone/iPad app (SwiftUI)

A native client for the linear schematic, drawing the **same live data** as the
web app: it connects to the existing Node backend (`/server`) over WebSocket and
renders the tube-map view. The backend stays the engine; this app is just a view.

> **Status: v1 slice.** Draws the static schematic (lines, double track,
> stations, Exmouth Junction + Waterloo stub, Plymouth-left) and places live
> trains at their current station, with pan/pinch. Signals, train-tap info, and
> smooth gliding between stations come next.

## What you need
- **Xcode 16+** and the Node backend running on your Mac (`cd server && npm run live`).
- The server now sends each train a `pos` (line, station, direction, platform),
  so the app just draws — no extra data to ship.

## Create the Xcode project (one-time, ~2 min)
The Swift sources live in `app/ExeterLive/`. Easiest reliable way to wrap them in
a project:

1. Xcode → **File ▸ New ▸ Project… ▸ iOS ▸ App**.
   - Product Name: **ExeterLive**, Interface: **SwiftUI**, Language: **Swift**.
   - Save it to a **temporary** spot first (e.g. Desktop).
2. Xcode makes `ExeterLive/` containing `ExeterLive.xcodeproj` and an inner
   `ExeterLive/` sources folder. **Delete** the default `ExeterLiveApp.swift` and
   `ContentView.swift` it created, and **copy in** the `.swift` files from this
   repo's `app/ExeterLive/`. (Xcode 16 auto-includes files in the project folder.)
3. **Move** the whole `ExeterLive/` project folder into this repo's `app/` so it
   lives alongside the sources, and commit it.

(If that's fiddly, send me a screenshot of where you're stuck and I'll talk you through it.)

## Point it at your backend
Open `TrainFeed.swift` → `Config.feedURL`:
- **iOS Simulator:** leave it as `ws://127.0.0.1:4001` (the Simulator shares your Mac's network).
- **Physical iPhone/iPad:** set it to your Mac's LAN IP, e.g. `ws://192.168.1.23:4001`,
  and keep both devices on the same Wi-Fi.

## Allow the local `ws://` connection (iOS blocks cleartext by default)
In the **ExeterLive target ▸ Info** tab, add:
- **App Transport Security Settings** (dictionary) → **Allow Local Networking** = **YES**.
- **Privacy - Local Network Usage Description** = e.g. "Connects to the train
  feed on your local network." (needed for the one-time permission prompt on a device).

## Run
- Pick an **iPhone/iPad Simulator** (or your device) and press **Run**.
- You should see the schematic and a green status pill ("Exeter Live · N trains · M placed").
- Pan with one finger, pinch to zoom.

If it doesn't connect: confirm the backend is running, the URL matches, and (on a
device) you tapped "Allow" on the local-network prompt. Paste any Xcode build
errors or a screenshot and I'll fix them — I can't compile here, so your first
build is our checkpoint.
