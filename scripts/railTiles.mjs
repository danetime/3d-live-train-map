/**
 * Procedural isometric railway tileset generator (no network, no credits).
 *
 *   node scripts/railTiles.mjs            # write the tileset + preview sheets
 *   node scripts/railTiles.mjs --preview  # also write demo PNGs to /tmp
 *
 * Why procedural and not PixelLab? A track set has to *connect*: the rails of
 * one tile must meet the rails of its neighbour exactly on the shared diamond
 * edge, with the same gauge and sleeper rhythm. AI raster output drifts on all
 * three, so the network never lines up. Here we push pixels directly, so every
 * piece keys into every other piece by construction.
 *
 * The grid is the spike's classic 2:1 iso diamond (TW=64, TH=32). A tile's
 * track centre-line always enters/leaves at one of the four EDGE MIDPOINTS:
 *
 *        TL ____ TR          centred coords (origin = tile centre):
 *         /\    /\             TL (-16,-8)   TR ( 16,-8)
 *        /  \  /  \            BL (-16, 8)   BR ( 16, 8)
 *       /    \/    \         A quadratic Bézier from one midpoint to another
 *       \    /\    /         with its control point at the tile CENTRE is
 *        \  /  \  /          tangent to the iso axes at both ends — so a curve
 *         \/____\/           meets a straight in the next tile with no kink.
 *        BL      BR          That single rule builds straights, curves,
 *                            crossings and switches alike.
 *
 * Tiles are transparent 64×32 PNGs (ballast + sleepers + two rails only), so
 * they drop on top of any ground tile and tile in every direction.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pkg from "pngjs";
const { PNG } = pkg;

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const TILE_DIR = join(repo, "src", "spike", "assets", "track");

const TW = 64;
const TH = 32;
const CX = TW / 2; // tile-centre in image pixels
const CY = TH / 2;

// Edge midpoints in image coords (centred coord + centre offset).
const E = {
  TL: [CX - 16, CY - 8],
  TR: [CX + 16, CY - 8],
  BR: [CX + 16, CY + 8],
  BL: [CX - 16, CY + 8],
};
const CENTRE = [CX, CY];

// ---- palette (muted, to sit on the board's #e7e1d3 / grass #7fae54) --------
const BALLAST = [0x8c, 0x83, 0x78];
const BALLAST_DK = [0x70, 0x68, 0x5d];
const BALLAST_LT = [0xa6, 0x9d, 0x90];
const SLEEPER = [0x57, 0x47, 0x33];
const SLEEPER_LT = [0x6d, 0x5a, 0x44];
const RAIL_DK = [0x55, 0x5c, 0x64]; // rail web / shadow side
const RAIL = [0x9a, 0xa3, 0xab]; // steel
const RAIL_HI = [0xd9, 0xdf, 0xe4]; // sun glint on the railhead

const GAUGE = 7; // screen px between the two rails
const BAND = 8.5; // ballast half-width (iso-stretched on x)

// ---------------------------------------------------------------------------
// Tiny RGBA framebuffer with source-over compositing.
// ---------------------------------------------------------------------------
class Buf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  px(x, y, [r, g, b], a = 255) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const sa = a / 255;
    const da = this.d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    this.d[i] = (r * sa + this.d[i] * da * (1 - sa)) / oa;
    this.d[i + 1] = (g * sa + this.d[i + 1] * da * (1 - sa)) / oa;
    this.d[i + 2] = (b * sa + this.d[i + 2] * da * (1 - sa)) / oa;
    this.d[i + 3] = oa * 255;
  }
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        this.px(ox + x, oy + y, [src.d[i], src.d[i + 1], src.d[i + 2]], src.d[i + 3]);
      }
  }
  toPNG() {
    const p = new PNG({ width: this.w, height: this.h });
    p.data.set(this.d);
    return PNG.sync.write(p);
  }
}

// stable per-pixel jitter so ballast speckle doesn't shimmer between runs
const hash = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

// quadratic Bézier sampler (control point = tile centre)
function sample(a, b, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      u = 1 - t;
    const x = u * u * a[0] + 2 * u * t * CENTRE[0] + t * t * b[0];
    const y = u * u * a[1] + 2 * u * t * CENTRE[1] + t * t * b[1];
    pts.push([x, y]);
  }
  return pts;
}

// iso-weighted distance (compress y so the ballast band reads flat in iso)
const ISO_Y = 1.7;
function distToPath(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx = x2 - x1,
      dy = y2 - y1;
    const L2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx,
      cy = y1 + t * dy;
    const ex = px - cx,
      ey = (py - cy) * ISO_Y;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d < best) best = d;
  }
  return best;
}

function drawTie(buf, [x, y], [tx, ty]) {
  // unit normal in screen space
  let nx = -ty,
    ny = tx;
  const L = Math.hypot(nx, ny) || 1;
  nx /= L;
  ny /= L;
  const half = GAUGE / 2 + 2.5;
  for (let s = -half; s <= half; s += 0.5) {
    const col = Math.abs(s) > half - 1 ? SLEEPER_LT : SLEEPER;
    buf.px(x + nx * s, y + ny * s, col, 255);
    buf.px(x + nx * s, y + ny * s + 1, SLEEPER, 235); // a touch of height
  }
}

function drawRail(buf, pts, side) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0],
      ty = b[1] - a[1];
    const L = Math.hypot(tx, ty) || 1;
    tx /= L;
    ty /= L;
    const nx = -ty,
      ny = tx;
    const rx = pts[i][0] + nx * side * (GAUGE / 2);
    const ry = pts[i][1] + ny * side * (GAUGE / 2);
    buf.px(rx, ry + 1, RAIL_DK, 255); // web/shadow under the head
    buf.px(rx, ry, RAIL, 255); // railhead
    buf.px(rx, ry, RAIL_HI, 90); // glint
  }
}

function makeTile(paths) {
  const buf = new Buf(TW, TH);
  const sampled = paths.map(([a, b]) => sample(E[a] ?? a, E[b] ?? b));

  // 1) ballast bed — opaque band hugging every path, with stable speckle
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++) {
      let d = Infinity;
      for (const p of sampled) d = Math.min(d, distToPath(x + 0.5, y + 0.5, p));
      if (d > BAND) continue;
      const edge = d > BAND - 1.5; // feather the rim slightly
      const r = hash(x, y);
      const col = r < 0.18 ? BALLAST_DK : r > 0.85 ? BALLAST_LT : BALLAST;
      buf.px(x, y, col, edge ? 150 : 255);
    }

  // 2) sleepers, evenly along each path
  for (const p of sampled) {
    for (let i = 4; i < p.length - 3; i += 5) {
      const a = p[i - 1],
        b = p[i + 1];
      drawTie(buf, p[i], [b[0] - a[0], b[1] - a[1]]);
    }
  }

  // 3) the two steel rails
  for (const p of sampled) {
    drawRail(buf, p, +1);
    drawRail(buf, p, -1);
  }
  return buf;
}

// ---- the tileset -----------------------------------------------------------
// Each entry is a list of paths; a path is [edgeA, edgeB] joined through centre.
const TILES = {
  straight_a: [["TL", "BR"]], // runs along the +gx grid axis  (↘)
  straight_b: [["TR", "BL"]], // runs along the +gy grid axis  (↙)
  curve_tl_tr: [["TL", "TR"]], // turn across the top
  curve_tr_br: [["TR", "BR"]], // turn on the right
  curve_br_bl: [["BR", "BL"]], // turn across the bottom
  curve_bl_tl: [["BL", "TL"]], // turn on the left
  cross: [["TL", "BR"], ["TR", "BL"]], // diamond crossing (flat X)
  switch_a_tr: [["TL", "BR"], ["TR", "BR"]], // straight-A + branch merging at BR
  switch_a_bl: [["TL", "BR"], ["BL", "TL"]], // straight-A + branch merging at TL
  switch_b_tl: [["TR", "BL"], ["TL", "TR"]], // straight-B + branch merging at TR
  switch_b_br: [["TR", "BL"], ["BR", "TR"]], // straight-B + branch merging at TR
};

// ---- ground diamonds, for the preview scenes only --------------------------
function groundTile(fill, line) {
  const buf = new Buf(TW, TH);
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++) {
      const cx = (x + 0.5 - CX) / (TW / 2);
      const cy = (y + 0.5 - CY) / (TH / 2);
      const m = Math.abs(cx) + Math.abs(cy); // diamond mask
      if (m > 1) continue;
      buf.px(x, y, m > 0.9 ? line : fill, 255);
    }
  return buf;
}

async function main() {
  await mkdir(TILE_DIR, { recursive: true });
  const built = {};
  for (const [name, paths] of Object.entries(TILES)) {
    const buf = makeTile(paths);
    built[name] = buf;
    await writeFile(join(TILE_DIR, `${name}.png`), buf.toPNG());
  }
  console.log(`✓ ${Object.keys(TILES).length} track tiles → ${TILE_DIR}`);
  await writeFile(join(TILE_DIR, "index.json"), JSON.stringify(Object.keys(TILES), null, 2));

  if (!process.argv.includes("--preview")) return;
  const grass = groundTile([0x7f, 0xae, 0x54], [0x6f, 0x9c, 0x49]);

  // (a) contact sheet: every tile on a faint diamond, in a tidy grid
  const names = Object.keys(TILES);
  const cols = 4;
  const rows = Math.ceil(names.length / cols);
  const cell = [96, 64];
  const sheet = new Buf(cols * cell[0], rows * cell[1]);
  sheet.d.fill(0); // transparent
  names.forEach((n, i) => {
    const ox = (i % cols) * cell[0] + (cell[0] - TW) / 2;
    const oy = ((i / cols) | 0) * cell[1] + (cell[1] - TH) / 2;
    sheet.blit(grass, ox, oy);
    sheet.blit(built[n], ox, oy);
  });
  await writeFile("/tmp/railway_tiles_sheet.png", sheet.toPNG());

  // (b) demo scene: a track "roundabout" (8-cell ring around a central crossing,
  // which exercises all four curves, all four switches and the cross) plus a
  // branch line that runs off the map — every tile type, all connecting.
  const layout = {
    // ring corners (pure curves)
    "3,3": "curve_br_bl", "5,3": "curve_bl_tl", "5,5": "curve_tl_tr", "3,5": "curve_tr_br",
    // ring mid-sides (switches, each peeling a branch into the centre)
    "4,3": "switch_a_bl", "3,4": "switch_b_br", "5,4": "switch_b_tl", "4,5": "switch_a_tr",
    // the hub
    "4,4": "cross",
    // a branch line running in from the top edge and out the right edge
    "6,0": "straight_b", "6,1": "straight_b", "6,2": "curve_tr_br",
    "7,2": "straight_a", "8,2": "straight_a", "9,2": "straight_a",
  };
  const GRID = 10;

  // connectivity assertion: every used edge must meet its opposite in the
  // neighbour that edge faces, unless that neighbour is off the board.
  const usedEdges = (name) => [...new Set(TILES[name].flat())];
  const DIR = { TL: [-1, 0, "BR"], BR: [1, 0, "TL"], TR: [0, -1, "BL"], BL: [0, 1, "TR"] };
  for (const [key, name] of Object.entries(layout)) {
    const [gx, gy] = key.split(",").map(Number);
    for (const e of usedEdges(name)) {
      const [dx, dy, opp] = DIR[e];
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue; // off-map: ok
      const n = layout[`${nx},${ny}`];
      if (!n || !usedEdges(n).includes(opp))
        throw new Error(`dangling rail: ${name}@${key} edge ${e} → ${n ?? "empty"}@${nx},${ny}`);
    }
  }
  console.log("✓ demo layout is fully connected");
  const sceneW = (GRID + GRID) * (TW / 2);
  const sceneH = (GRID + GRID) * (TH / 2) + TH;
  const scene = new Buf(sceneW, sceneH);
  scene.d.fill(0);
  const baseX = sceneW / 2 - TW / 2;
  const baseY = TH;
  const isoX = (gx, gy) => baseX + (gx - gy) * (TW / 2);
  const isoY = (gx, gy) => baseY + (gx + gy) * (TH / 2);
  for (let gy = 0; gy < GRID; gy++)
    for (let gx = 0; gx < GRID; gx++) scene.blit(grass, isoX(gx, gy), isoY(gx, gy));
  for (let gy = 0; gy < GRID; gy++)
    for (let gx = 0; gx < GRID; gx++) {
      const t = layout[`${gx},${gy}`];
      if (t) scene.blit(built[t], isoX(gx, gy), isoY(gx, gy));
    }
  await writeFile("/tmp/railway_demo.png", scene.toPNG());
  console.log("✓ previews → /tmp/railway_tiles_sheet.png, /tmp/railway_demo.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
