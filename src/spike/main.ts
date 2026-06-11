/**
 * Throwaway PixiJS isometric spike — validates the 2D pixel-art route
 * (PixelLab assets + an iso renderer) WITHOUT touching the live three.js app.
 *
 * Today it draws placeholder vector diamond tiles and a box "train" that glides
 * along a straight iso line. Everything that will become real art is isolated
 * behind small factory functions (makeTileTexture / makeTrainTexture) so a real
 * PixelLab PNG tileset can drop straight in — see loadArt() at the bottom.
 *
 * Run: `npm run dev`, then open /spike.html
 */
import { Application, Container, Graphics, Sprite, type Texture } from "pixi.js";

const TW = 64; // iso tile width (pixels)
const TH = 32; // iso tile height — 2:1 classic iso
const GRID = 14; // board is GRID×GRID tiles
const TRACK_ROW = 7; // the line runs along this grid row

// Grid (gx, gy) → screen pixels at the tile's centre.
const isoX = (gx: number, gy: number) => (gx - gy) * (TW / 2);
const isoY = (gx: number, gy: number) => (gx + gy) * (TH / 2);

async function main() {
  const app = new Application();
  await app.init({ background: "#e7e1d3", resizeTo: window, antialias: false });
  document.body.appendChild(app.canvas);

  // World container holds the whole board; we pan/zoom this, not the camera.
  const world = new Container();
  world.sortableChildren = true; // paint back-to-front by zIndex (= gx+gy)
  app.stage.addChild(world);

  const art = makeArt(app);

  // --- ground + track tiles ---------------------------------------------
  const isWater = (gx: number, gy: number) => gy >= 11; // a strip of "estuary"
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const tex =
        gy === TRACK_ROW ? art.track : isWater(gx, gy) ? art.water : art.grass;
      const s = new Sprite(tex);
      s.anchor.set(0.5, 0.5);
      s.x = isoX(gx, gy);
      s.y = isoY(gx, gy);
      s.zIndex = gx + gy;
      world.addChild(s);
    }
  }

  // --- station nodes ----------------------------------------------------
  for (const gx of [3, 10]) {
    const node = new Sprite(art.node);
    node.anchor.set(0.5, 0.85);
    node.x = isoX(gx, TRACK_ROW);
    node.y = isoY(gx, TRACK_ROW);
    node.zIndex = gx + TRACK_ROW + 0.4;
    world.addChild(node);
  }

  // --- the train (placeholder; later a directional PixelLab sprite) -----
  const train = new Sprite(art.train);
  train.anchor.set(0.5, 0.82);
  world.addChild(train);

  // --- camera: centre the board, drag to pan, wheel to zoom -------------
  const recentre = () => {
    world.x = app.screen.width / 2;
    world.y = app.screen.height / 2 - isoY(GRID - 1, GRID - 1) / 2;
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

  // --- animate: ease the train back and forth along the track row -------
  let t = 0;
  app.ticker.add((ticker) => {
    t += (ticker.deltaMS / 1000) * 0.55;
    const p = (Math.sin(t) * 0.5 + 0.5) * (GRID - 1); // 0..GRID-1, eased
    train.x = isoX(p, TRACK_ROW);
    train.y = isoY(p, TRACK_ROW);
    train.zIndex = p + TRACK_ROW + 0.5;
  });
}

// ---------------------------------------------------------------------------
// Art factory. Everything here is a placeholder vector texture. To go real,
// replace makeArt() with an async loader that pulls a PixelLab PNG tileset via
// Pixi's Assets API and slices it into these same named textures.
// ---------------------------------------------------------------------------
function makeArt(app: Application) {
  const diamond = (fill: number, line: number): Texture => {
    const g = new Graphics()
      .poly([0, -TH / 2, TW / 2, 0, 0, TH / 2, -TW / 2, 0])
      .fill(fill)
      .stroke({ width: 1, color: line });
    return app.renderer.generateTexture(g);
  };

  const nodeG = new Graphics()
    .circle(0, 0, 7)
    .fill(0xf3eee2)
    .stroke({ width: 3, color: 0x2b3340 });

  const trainG = new Graphics()
    .roundRect(-22, -18, 44, 22, 6)
    .fill(0xe53e3e)
    .stroke({ width: 2, color: 0x9b2c2c });

  return {
    grass: diamond(0x7fae54, 0x6f9c49),
    water: diamond(0x6db4d8, 0x5aa0c6),
    track: diamond(0x3182ce, 0x276bb0),
    node: app.renderer.generateTexture(nodeG),
    train: app.renderer.generateTexture(trainG),
  };
}

main();
