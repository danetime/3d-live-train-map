/**
 * PixiJS isometric renderer for the Exeter network — the 2D pixel-art route.
 *
 * Runs alongside the three.js app (which stays at "/"); this is "/spike.html".
 * It REUSES the existing data/logic layer — the same line definitions, the
 * straight-line schematic layout, the spline curves and mileage maths — and
 * only swaps the rendering shell from three.js to 2D isometric Pixi.
 *
 * Today the art is placeholder vector graphics and the trains are simulated.
 * Next steps: real PixelLab tiles/sprites, then wire the live feed + the
 * headcode/destination data the three.js app already produces.
 */
import { Application, Container, Graphics, Text } from "pixi.js";
import { LINES, STATIONS, LINE_BY_ID } from "../data/network";
import { project } from "../data/geo";
import { lineCurve } from "../data/lineCurves";
import { createMockTrains } from "../sim/mockTrains";

// --- isometric projection: world (x, z) → screen (raw iso units) ----------
// Classic 2:1 iso. The world container is scaled to fit, so these are unitless.
const isoX = (x: number, z: number) => x - z;
const isoY = (x: number, z: number) => (x + z) * 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

async function main() {
  const app = new Application();
  await app.init({ background: "#e7e1d3", resizeTo: window, antialias: false });
  document.body.appendChild(app.canvas);

  const world = new Container();
  world.sortableChildren = true;
  app.stage.addChild(world);

  // --- track ribbons: sample each line's spline → an iso polyline ---------
  const tracks = new Container();
  tracks.sortableChildren = true;
  world.addChild(tracks);
  for (const line of LINES) {
    const curve = lineCurve(line.id);
    const N = 120;
    const g = new Graphics();
    for (let i = 0; i <= N; i++) {
      const p = curve.getPointAt(i / N);
      const sx = isoX(p.x, p.z);
      const sy = isoY(p.x, p.z);
      if (i === 0) g.moveTo(sx, sy);
      else g.lineTo(sx, sy);
    }
    g.stroke({ width: 2.2, color: line.color, cap: "round", join: "round", alpha: 0.95 });
    g.zIndex = -1000; // tracks sit beneath everything
    tracks.addChild(g);
  }

  // --- station nodes + labels --------------------------------------------
  for (const s of STATIONS) {
    const p = project(s.pos);
    const sx = isoX(p.x, p.z);
    const sy = isoY(p.x, p.z);
    const isHub = !!s.hub;

    const node = new Graphics()
      .circle(0, 0, isHub ? 2.6 : 1.7)
      .fill(0x2b3340)
      .circle(0, 0, isHub ? 1.3 : 0.85)
      .fill(0xf3eee2);
    node.x = sx;
    node.y = sy;
    node.zIndex = isoY(p.x, p.z);
    world.addChild(node);

    const label = new Text({
      text: s.name,
      style: { fontFamily: "monospace", fontSize: 6, fill: 0x141a21, fontWeight: "bold" },
    });
    label.anchor.set(0.5, 1);
    label.x = sx;
    label.y = sy - (isHub ? 5 : 3.5);
    label.zIndex = 100000; // labels always on top
    label.resolution = 4; // crisp small text
    world.addChild(label);
  }

  // --- fit the whole network to the screen -------------------------------
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of STATIONS) {
    const p = project(s.pos);
    const sx = isoX(p.x, p.z);
    const sy = isoY(p.x, p.z);
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  const fit = () => {
    const scale = Math.min(
      (app.screen.width * 0.82) / (maxX - minX),
      (app.screen.height * 0.62) / (maxY - minY),
    );
    world.scale.set(scale);
    world.x = app.screen.width / 2 - ((minX + maxX) / 2) * scale;
    world.y = app.screen.height / 2 - ((minY + maxY) / 2) * scale;
  };
  fit();
  window.addEventListener("resize", fit);

  // --- simulated trains gliding along their lines ------------------------
  type Sim = { lineId: string; t: number; dir: 1 | -1; speed: number; gfx: Graphics; tag: Text };
  const sims: Sim[] = createMockTrains().map((tr) => {
    const color = LINE_BY_ID.get(tr.lineId)?.color ?? "#3182ce";
    const gfx = new Graphics().roundRect(-3.2, -2.2, 6.4, 3, 1).fill(color).stroke({ width: 0.5, color: 0x1a202c });
    world.addChild(gfx);
    const tag = new Text({
      text: tr.headcode,
      style: { fontFamily: "monospace", fontSize: 5, fill: 0x3dff62, fontWeight: "bold" },
    });
    tag.anchor.set(0.5, 1);
    tag.resolution = 4;
    world.addChild(tag);
    return { lineId: tr.lineId, t: tr.t, dir: tr.direction, speed: tr.speed, gfx, tag };
  });

  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    for (const s of sims) {
      s.t += s.dir * s.speed * dt;
      if (s.t >= 1) { s.t = 1; s.dir = -1; }
      else if (s.t <= 0) { s.t = 0; s.dir = 1; }
      const p = lineCurve(s.lineId).getPointAt(clamp(s.t, 0.0001, 0.9999));
      const sx = isoX(p.x, p.z);
      const sy = isoY(p.x, p.z);
      const depth = isoY(p.x, p.z) + 1;
      s.gfx.x = sx; s.gfx.y = sy; s.gfx.zIndex = depth;
      s.tag.x = sx; s.tag.y = sy - 3; s.tag.zIndex = 100001;
    }
  });

  // --- camera: drag to pan, wheel to zoom --------------------------------
  let dragging = false, lastX = 0, lastY = 0;
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("pointerdown", (e) => { dragging = true; lastX = e.global.x; lastY = e.global.y; });
  const end = () => (dragging = false);
  app.stage.on("pointerup", end);
  app.stage.on("pointerupoutside", end);
  app.stage.on("pointermove", (e) => {
    if (!dragging) return;
    world.x += e.global.x - lastX; world.y += e.global.y - lastY;
    lastX = e.global.x; lastY = e.global.y;
  });
  app.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = clamp(world.scale.x * f, 1, 60);
    world.scale.set(next);
  }, { passive: false });
}

main();
