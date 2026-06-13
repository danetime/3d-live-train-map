/**
 * Throwaway PixiJS isometric spike — validates the 2D pixel-art route WITHOUT
 * touching the live three.js app.
 *
 * It now draws a real procedural iso RAILWAY TILESET (see scripts/railTiles.mjs):
 * straights on both grid axes, four quarter-curves, a diamond crossing and four
 * switches. The tiles are transparent overlays that key into each other on the
 * shared diamond edges, so track can run in every direction. A train rides the
 * roundabout on a continuous loop.
 *
 * Run: `npm run dev`, then open /spike.html
 * (Re)generate the tiles: `node scripts/railTiles.mjs`
 */
import { Application, Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import stationMeta from "./assets/stations.json";

const TW = 128; // iso tile width (pixels) — tiles are authored at 2× for detail
const TH = 64; // iso tile height — 2:1 classic iso
const GRID = 10; // board is GRID×GRID tiles
const FIT = 0.6; // default zoom so the bigger board frames nicely

// Grid (gx, gy) → screen pixels at the tile's centre.
const isoX = (gx: number, gy: number) => (gx - gy) * (TW / 2);
const isoY = (gx: number, gy: number) => (gx + gy) * (TH / 2);

// Where each track tile goes. Built/verified by scripts/railTiles.mjs: a
// "roundabout" (ring of curves + switches around a central crossing) plus a
// branch line that runs in from the top edge and out the right edge.
const TRACK: Record<string, string> = {
  "3,3": "curve_br_bl", "5,3": "curve_bl_tl", "5,5": "curve_tl_tr", "3,5": "curve_tr_br",
  "4,3": "switch_a_bl", "3,4": "switch_b_br", "5,4": "switch_b_tl", "4,5": "switch_a_tr",
  "4,4": "cross",
  // branch line with colour-light signals: green at the top → yellow → red
  "6,0": "straight_b_sig_green", "6,1": "straight_b", "6,2": "curve_tr_br",
  "7,2": "straight_a_sig_yellow", "8,2": "straight_a", "9,2": "straight_a_sig_red",
};

// The loop the train laps, as ordered ring cells (clockwise).
const LOOP: [number, number][] = [
  [3, 3], [4, 3], [5, 3], [5, 4], [5, 5], [4, 5], [3, 5], [3, 4],
];

async function main() {
  const app = new Application();
  await app.init({ background: "#e7e1d3", resizeTo: window, antialias: false });
  document.body.appendChild(app.canvas);

  const world = new Container();
  world.sortableChildren = true; // paint back-to-front by zIndex (= gx+gy)
  app.stage.addChild(world);

  const art = makeArt(app);
  const track = await loadTrack();
  const trains = await loadTrains();
  const platforms = await loadPlatforms();
  const stations = await loadStations();

  // --- ground tiles -----------------------------------------------------
  const isWater = (gy: number) => gy >= 9; // a thin strip of "estuary"
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const s = new Sprite(isWater(gy) ? art.water : art.grass);
      s.anchor.set(0.5, 0.5);
      s.x = isoX(gx, gy);
      s.y = isoY(gx, gy);
      s.zIndex = gx + gy;
      world.addChild(s);
    }
  }

  // --- track overlay tiles ---------------------------------------------
  // Signal tiles are 64×64 (track in the bottom half, post rising above), so
  // they anchor at the diamond centre (0.75 down) rather than the tile centre.
  for (const [key, name] of Object.entries(TRACK)) {
    const [gx, gy] = key.split(",").map(Number);
    const tex = track[name];
    const tall = tex.height > TH;
    const s = new Sprite(tex);
    s.anchor.set(0.5, tall ? 0.75 : 0.5);
    s.x = isoX(gx, gy);
    s.y = isoY(gx, gy);
    s.zIndex = gx + gy + (tall ? 0.2 : 0.1); // just above the ground in the cell
    world.addChild(s);
  }

  // --- a station spur: a straight track with an NE platform + a building -
  const SPUR_GY = 8;
  for (let gx = 1; gx <= 3; gx++) {
    const t = new Sprite(track.straight_a);
    t.anchor.set(0.5, 0.5);
    t.x = isoX(gx, SPUR_GY);
    t.y = isoY(gx, SPUR_GY);
    t.zIndex = gx + SPUR_GY + 0.1;
    world.addChild(t);
    // flat slab in the middle, sloped end ramps capping the run
    const pn = gx === 1 ? "platform_a_ne_ramp_hi" : gx === 3 ? "platform_a_ne_ramp_lo" : "platform_a_ne";
    const p = new Sprite(platforms[pn]);
    p.anchor.set(0.5, 0.75);
    p.x = isoX(gx, SPUR_GY);
    p.y = isoY(gx, SPUR_GY);
    p.zIndex = gx + SPUR_GY + 0.2;
    world.addChild(p);
  }
  const meta = stationMeta.station_large_a_ne;
  const st = new Sprite(stations.station_large_a_ne);
  st.anchor.set(meta.anchor[0], meta.anchor[1]);
  st.x = isoX(2, SPUR_GY) + meta.nudge[0]; // nudge off the centre-line onto the NE platform
  st.y = isoY(2, SPUR_GY) + meta.nudge[1];
  st.zIndex = 2 + SPUR_GY + 0.3;
  world.addChild(st);

  // --- the train: a boxy Class 150 sprite, swapped per heading ----------
  const train = new Sprite(trains.a);
  train.anchor.set(0.5, 0.7); // foot of the box (set by scripts/trainSprite.mjs)
  world.addChild(train);

  // --- camera: centre the board, drag to pan, wheel to zoom -------------
  world.scale.set(FIT);
  const recentre = () => {
    world.x = app.screen.width / 2;
    world.y = app.screen.height / 2 - (isoY(GRID - 1, GRID - 1) / 2) * world.scale.y;
  };
  recentre();
  window.addEventListener("resize", recentre);

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("pointerdown", (e) => {
    dragging = true;
    lastX = e.global.x;
    lastY = e.global.y;
  });
  const endDrag = () => (dragging = false);
  app.stage.on("pointerup", endDrag);
  app.stage.on("pointerupoutside", endDrag);
  app.stage.on("pointermove", (e) => {
    if (!dragging) return;
    world.x += e.global.x - lastX;
    world.y += e.global.y - lastY;
    lastX = e.global.x;
    lastY = e.global.y;
  });
  app.canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      world.scale.set(Math.max(0.3, Math.min(4, world.scale.x * f)));
    },
    { passive: false },
  );

  // --- animate: lap the train around the roundabout loop ----------------
  let s = 0;
  app.ticker.add((ticker) => {
    s = (s + (ticker.deltaMS / 1000) * 0.9) % LOOP.length;
    const i = Math.floor(s);
    const f = s - i;
    const [ax, ay] = LOOP[i];
    const [bx, by] = LOOP[(i + 1) % LOOP.length];
    const gx = ax + (bx - ax) * f;
    const gy = ay + (by - ay) * f;
    train.texture = ay === by ? trains.a : trains.b; // gx move → a, gy move → b
    train.x = isoX(gx, gy);
    train.y = isoY(gx, gy);
    train.zIndex = gx + gy + 0.5;
  });
}

// ---------------------------------------------------------------------------
// Load the procedural track tileset (PNGs from scripts/railTiles.mjs). Vite
// turns the glob into URL strings; Pixi's Assets API loads them, and we force
// nearest-neighbour sampling so the pixel art stays crisp when zoomed.
// ---------------------------------------------------------------------------
async function loadTrack(): Promise<Record<string, Texture>> {
  const urls = import.meta.glob("./assets/track/*.png", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>;
  const out: Record<string, Texture> = {};
  for (const [path, url] of Object.entries(urls)) {
    const name = path.split("/").pop()!.replace(".png", "");
    const tex = (await Assets.load(url)) as Texture;
    tex.source.scaleMode = "nearest";
    out[name] = tex;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Load the train sprites (PNGs from scripts/trainSprite.mjs): train_a is gx-
// aligned (↘/↖), train_b is gy-aligned (↙/↗).
// ---------------------------------------------------------------------------
async function loadTrains(): Promise<{ a: Texture; b: Texture }> {
  const urls = import.meta.glob("./assets/train_*.png", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>;
  const byName: Record<string, Texture> = {};
  for (const [path, url] of Object.entries(urls)) {
    const name = path.split("/").pop()!.replace(".png", "");
    const tex = (await Assets.load(url)) as Texture;
    tex.source.scaleMode = "nearest";
    byName[name] = tex;
  }
  return { a: byName.train_a, b: byName.train_b };
}

// platform overlays (raised slabs, 4 facings) — tall tiles like the signals
async function loadPlatforms(): Promise<Record<string, Texture>> {
  const urls = import.meta.glob("./assets/platform_*.png", {
    eager: true, query: "?url", import: "default",
  }) as Record<string, string>;
  const out: Record<string, Texture> = {};
  for (const [path, url] of Object.entries(urls)) {
    const tex = (await Assets.load(url)) as Texture;
    tex.source.scaleMode = "nearest";
    out[path.split("/").pop()!.replace(".png", "")] = tex;
  }
  return out;
}

// station buildings (small/medium/large); placement anchors live in stations.json
async function loadStations(): Promise<Record<string, Texture>> {
  const urls = import.meta.glob("./assets/station_*.png", {
    eager: true, query: "?url", import: "default",
  }) as Record<string, string>;
  const out: Record<string, Texture> = {};
  for (const [path, url] of Object.entries(urls)) {
    const tex = (await Assets.load(url)) as Texture;
    tex.source.scaleMode = "nearest";
    out[path.split("/").pop()!.replace(".png", "")] = tex;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vector placeholders for the ground (track + trains are real art now).
// ---------------------------------------------------------------------------
function makeArt(app: Application) {
  const diamond = (fill: number, line: number): Texture => {
    const g = new Graphics()
      .poly([0, -TH / 2, TW / 2, 0, 0, TH / 2, -TW / 2, 0])
      .fill(fill)
      .stroke({ width: 1, color: line });
    return app.renderer.generateTexture(g);
  };

  return {
    grass: diamond(0x7fae54, 0x6f9c49),
    water: diamond(0x6db4d8, 0x5aa0c6),
  };
}

main();
