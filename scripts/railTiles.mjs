/**
 * Procedural isometric railway tileset generator (no network, no credits).
 *
 *   node scripts/railTiles.mjs            # write the tileset
 *   node scripts/railTiles.mjs --preview  # also write demo PNGs to /tmp
 *
 * Why procedural and not PixelLab? A track set has to *connect*: the rails of
 * one tile must meet the rails of its neighbour exactly on the shared diamond
 * edge, with the same gauge and sleeper rhythm. AI raster output drifts on all
 * three, so the network never lines up. Here we push pixels directly, so every
 * piece keys into every other piece by construction.
 *
 * The grid is the spike's 2:1 iso diamond, rendered at 2× (128×64) for detail.
 * A tile's track centre-line always enters/leaves at one of four EDGE MIDPOINTS,
 * and a quadratic Bézier between any two of them with its control point at the
 * tile CENTRE is tangent to the iso axes at both ends — so a curve meets a
 * straight in the next tile with no kink. That one rule builds straights,
 * curves, crossings and switches alike.
 *
 * Detail, painted back-to-front per tile:
 *   ballast bed   — multi-tone gravel, darkened shoulder, stray grass tufts
 *   sleepers      — shaded wooden ties with grain and a cast shadow
 *   chairs        — cast-iron plates where each rail crosses a sleeper
 *   rails         — a 4px cross-section: glint / railhead / web / shadow
 *   signals       — backboard, hooded lenses, foundation + a side ladder
 *
 * Tiles are transparent PNGs, so they drop on any ground tile and tile in every
 * direction. Signalled straights are 128×128 (track in the bottom half).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Buf, hash, line, disc } from "./iso.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TILE_DIR = join(here, "..", "src", "spike", "assets", "track");

const TW = 128; // iso tile width (2× the spike's logical 64)
const TH = 64; // iso tile height — 2:1 classic iso
const CX = TW / 2;
const CY = TH / 2;

// Edge midpoints in image coords (centred coord + centre offset).
const E = {
  TL: [CX - 32, CY - 16],
  TR: [CX + 32, CY - 16],
  BR: [CX + 32, CY + 16],
  BL: [CX - 32, CY + 16],
};
const CENTRE = [CX, CY];

const GAUGE = 14; // screen px between the two rails
const BAND = 16; // ballast half-width (iso-stretched on x)
const BED_EXT = 34; // run the bed straight off each edge (kills rounded caps)
const SLEEPER_GAP = 9; // target sleeper spacing, in px of arc length

// ---- palette (muted, to sit on the board's #e7e1d3 / grass #7fae54) --------
const BALLAST = [0x8a, 0x82, 0x78];
const BALLAST_DK = [0x65, 0x5d, 0x52];
const BALLAST_LT = [0xa6, 0x9c, 0x8e];
const BALLAST_XL = [0xbe, 0xb5, 0xa6];
const SHOULDER = [0x57, 0x50, 0x46]; // darker bed edge
const TUFT = [0x6f, 0x9c, 0x49];
const TUFT_DK = [0x5a, 0x86, 0x3b];

const SLEEPER = [0x59, 0x47, 0x35];
const SLEEPER_TOP = [0x6f, 0x5b, 0x45];
const SLEEPER_BOT = [0x3c, 0x30, 0x20];
const SLEEPER_GRAIN = [0x4d, 0x3e, 0x2c];
const CHAIR = [0x33, 0x36, 0x3b]; // cast-iron rail chair

const RAIL_HI = [0xcc, 0xd2, 0xd7]; // sun glint on the railhead
const RAIL = [0x9a, 0xa1, 0xa8]; // steel head
const RAIL_WEB = [0x6b, 0x72, 0x7a]; // web below the head
const RAIL_SH = [0x47, 0x4d, 0x54]; // shadow cast onto the ballast

// signal head — lamps stacked top→bottom: GREEN, YELLOW, RED (a 3-aspect head)
const SIG_POST = [0x3a, 0x3f, 0x47];
const SIG_POST_HI = [0x56, 0x5c, 0x64];
const SIG_POST_DK = [0x26, 0x2a, 0x30];
const SIG_HEAD = [0x1c, 0x1f, 0x23];
const SIG_BACK = [0x0e, 0x10, 0x13]; // backboard
const SIG_BORDER = [0x3a, 0x3f, 0x47];
const CONCRETE = [0x9a, 0x95, 0x8c];
const CONCRETE_HI = [0xb4, 0xaf, 0xa5];
const LAMP_LIT = { green: [0x53, 0xe0, 0x66], yellow: [0xf7, 0xc9, 0x22], red: [0xe8, 0x3f, 0x32] };
const LAMP_DIM = { green: [0x16, 0x33, 0x1c], yellow: [0x45, 0x39, 0x11], red: [0x3b, 0x15, 0x12] };

// quadratic Bézier sampler (control point = tile centre)
function sample(a, b, n = 110) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * a[0] + 2 * u * t * CENTRE[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * CENTRE[1] + t * t * b[1],
    ]);
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
    const dx = x2 - x1, dy = y2 - y1;
    const L2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const ex = px - (x1 + t * dx), ey = (py - (y1 + t * dy)) * ISO_Y;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d < best) best = d;
  }
  return best;
}

const unit = (tx, ty) => {
  const L = Math.hypot(tx, ty) || 1;
  return [tx / L, ty / L];
};

// Place markers along a polyline at even arc-length spacing, with half-spacing
// margins at both ends — so the rhythm continues unbroken across tile seams.
// Returns [point, tangent] pairs.
function arcPlace(pts, gap) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const n = Math.max(1, Math.round(L / gap));
  const s = L / n;
  const out = [];
  for (let k = 0; k < n; k++) {
    const d = (k + 0.5) * s;
    let i = 1;
    while (i < cum.length && cum[i] < d) i++;
    const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    const x = pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]);
    const y = pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 1)];
    out.push([[x, y], [b[0] - a[0], b[1] - a[1]]]);
  }
  return out;
}

// Clip a track tile to its diamond so the ballast is cut flush at the edge and
// meets the neighbour's bed exactly (no bleed into the rectangular corners).
function maskDiamond(buf) {
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++) {
      const cx = (x + 0.5 - CX) / (TW / 2);
      const cy = (y + 0.5 - CY) / (TH / 2);
      if (Math.abs(cx) + Math.abs(cy) > 1) buf.d[(y * buf.w + x) * 4 + 3] = 0;
    }
}

// A shaded wooden sleeper centred at p, laid across the track (along the normal),
// with a cast-iron chair where each rail will cross it.
function drawSleeper(buf, [x, y], [tx, ty]) {
  const [ux, uy] = unit(tx, ty);
  const nx = -uy, ny = ux; // across the track
  const halfLen = GAUGE / 2 + 5;
  const halfW = 2;
  for (let s = -halfLen; s <= halfLen; s += 0.5)
    for (let w = -halfW; w <= halfW; w += 0.5) {
      const px = x + nx * s + ux * w;
      const py = y + ny * s + uy * w;
      let col = SLEEPER;
      if (py < y - 0.5) col = SLEEPER_TOP; // sunlit upper face
      else if (py > y + 0.5) col = SLEEPER_BOT; // shaded lower face
      else if (hash(px | 0, py | 0) > 0.7) col = SLEEPER_GRAIN;
      buf.px(px, py, col, 255);
    }
  // a cast shadow just downhill of the tie
  for (let s = -halfLen; s <= halfLen; s += 0.5)
    buf.px(x + nx * s + ux * (halfW + 1), y + ny * s + uy * (halfW + 1) + 1, SLEEPER_BOT, 130);
  // chairs at the two rail crossings
  for (const side of [-1, 1]) {
    const cxp = x + nx * (GAUGE / 2) * side;
    const cyp = y + ny * (GAUGE / 2) * side;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) buf.px(cxp + a, cyp + b, CHAIR, 255);
  }
}

// One steel rail offset to `side` of the path, drawn as a 4px cross-section.
function drawRail(buf, pts, side) {
  const off = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]);
    return [p[0] - uy * side * (GAUGE / 2), p[1] + ux * side * (GAUGE / 2)];
  });
  const layers = [
    [2, RAIL_SH, 200], // shadow onto ballast
    [1, RAIL_WEB, 255], // web
    [0, RAIL, 255], // railhead
    [-1, RAIL_HI, 255], // glint
  ];
  for (const [dy, col, a] of layers)
    for (let i = 0; i < off.length - 1; i++)
      line(buf, off[i][0], off[i][1] + dy, off[i + 1][0], off[i + 1][1] + dy, col, a);
}

function paintTrack(buf, paths) {
  const sampled = paths.map(([a, b]) => sample(E[a] ?? a, E[b] ?? b));
  // Extended polylines for the bed only: push each end straight out past the
  // tile edge so the band has no rounded cap and meets the neighbour flush.
  const beds = sampled.map((p) => {
    const out = (i0, i1) => {
      const [ux, uy] = unit(p[i0][0] - p[i1][0], p[i0][1] - p[i1][1]);
      return [p[i0][0] + ux * BED_EXT, p[i0][1] + uy * BED_EXT];
    };
    return [out(0, 3), ...p, out(p.length - 1, p.length - 4)];
  });

  // 1) ballast bed — multi-tone gravel, darker shoulder, stray grass tufts
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++) {
      let d = Infinity;
      for (const p of beds) d = Math.min(d, distToPath(x + 0.5, y + 0.5, p));
      if (d > BAND) continue;
      const r = hash(x, y);
      if (d > BAND - 1) {
        if (r > 0.6) buf.px(x, y, r > 0.85 ? TUFT : TUFT_DK, 200); // tufts at the rim
        continue;
      }
      let col;
      if (d > BAND - 3) col = r < 0.5 ? SHOULDER : BALLAST_DK; // shoulder
      else if (r < 0.16) col = BALLAST_DK;
      else if (r > 0.92) col = BALLAST_XL;
      else if (r > 0.72) col = BALLAST_LT;
      else col = BALLAST;
      buf.px(x, y, col, 255);
    }

  // 2) sleepers (with chairs), placed by arc length so the rhythm carries
  //    across tile seams (half-spacing margin at each edge)
  for (const p of sampled)
    for (const [pt, tan] of arcPlace(p, SLEEPER_GAP)) drawSleeper(buf, pt, tan);

  // 3) the two steel rails, on top
  for (const p of sampled) {
    drawRail(buf, p, +1);
    drawRail(buf, p, -1);
  }
}

function makeTile(paths) {
  const buf = new Buf(TW, TH);
  paintTrack(buf, paths);
  maskDiamond(buf); // cut the bed flush at the diamond edge for seamless joins
  return buf;
}

// A trackside colour-light signal whose foot stands at (bx,by). Backboard +
// hooded lenses (green top, yellow, red bottom); `aspect` lights one. Includes
// a concrete foundation and a maintenance ladder up the mast.
function drawSignal(buf, bx, by, aspect) {
  const headBot = by - 22, headTop = by - 56;
  // foundation
  for (let y = by - 1; y <= by + 4; y++)
    for (let x = bx - 4; x <= bx + 4; x++) buf.px(x, y, y === by - 1 ? CONCRETE_HI : CONCRETE);
  // mast (3px) + ladder on the right
  for (let y = headBot; y <= by; y++) {
    buf.px(bx - 1, y, SIG_POST_HI);
    buf.px(bx, y, SIG_POST);
    buf.px(bx + 1, y, SIG_POST_DK);
  }
  for (let y = headBot + 2; y <= by - 2; y++) {
    buf.px(bx + 3, y, SIG_POST_DK); // ladder stringer
    buf.px(bx + 4, y, SIG_POST_DK);
    if ((y & 1) === 0) for (let x = bx + 3; x <= bx + 4; x++) buf.px(x, y, SIG_POST_HI); // rungs
  }
  // backboard + housing
  for (let y = headTop - 1; y <= headBot + 1; y++)
    for (let x = bx - 9; x <= bx + 9; x++) buf.px(x, y, SIG_BACK);
  for (let y = headTop; y <= headBot; y++)
    for (let x = bx - 7; x <= bx + 7; x++) buf.px(x, y, SIG_HEAD);
  for (let y = headTop; y <= headBot; y++) buf.px(bx - 7, y, SIG_BORDER); // lit edge
  for (let x = bx - 9; x <= bx + 9; x++) buf.px(x, headTop - 1, SIG_BORDER); // top cap
  // the three lenses, each under a hood
  const lenses = [["green", headTop + 6], ["yellow", by - 39], ["red", headBot - 6]];
  for (const [name, cy] of lenses) {
    for (let x = bx - 5; x <= bx + 5; x++) buf.px(x, cy - 6, SIG_BACK); // hood
    for (let x = bx - 5; x <= bx + 5; x++) buf.px(x, cy - 5, SIG_POST_DK);
    const lit = name === aspect;
    if (lit) disc(buf, bx, cy, 7, LAMP_LIT[name], 45); // glow
    disc(buf, bx, cy, 4, lit ? LAMP_LIT[name] : LAMP_DIM[name]);
    if (lit) {
      disc(buf, bx, cy, 2, [0xff, 0xff, 0xff], 120); // hot core
      buf.px(bx - 1, cy - 1, [0xff, 0xff, 0xff], 200);
    }
  }
}

// A straight-track tile with the signal rising above it, in a 128×128 frame:
// track sits in the bottom half, the signal post in the top half.
function makeSignalTile(baseName, aspect, bx, by) {
  const buf = new Buf(TW, TW);
  buf.blit(makeTile(TILES[baseName]), 0, TH);
  drawSignal(buf, bx, by, aspect);
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

// Signalled straights: a colour-light signal stands trackside on each straight.
// [base, foot x, foot y] in the 128×128 frame (track is the bottom half).
const SIGNAL_POSTS = [
  ["straight_a", 92, 90], // post to the upper-right of the ↘ line
  ["straight_b", 36, 90], // post to the upper-left of the ↙ line
];
const ASPECTS = ["green", "yellow", "red"];
const signalName = (base, aspect) => `${base}_sig_${aspect}`;

// ---- ground diamonds, for the preview scenes only --------------------------
function groundTile(fill, line) {
  const buf = new Buf(TW, TH);
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++) {
      const cx = (x + 0.5 - CX) / (TW / 2);
      const cy = (y + 0.5 - CY) / (TH / 2);
      const m = Math.abs(cx) + Math.abs(cy);
      if (m > 1) continue;
      buf.px(x, y, m > 0.92 ? line : fill, 255);
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
  // signalled straights: 2 orientations × 3 aspects
  const signalNames = [];
  for (const [base, bx, by] of SIGNAL_POSTS)
    for (const aspect of ASPECTS) {
      const name = signalName(base, aspect);
      built[name] = makeSignalTile(base, aspect, bx, by);
      signalNames.push(name);
      await writeFile(join(TILE_DIR, `${name}.png`), built[name].toPNG());
    }
  const allNames = [...Object.keys(TILES), ...signalNames];
  console.log(`✓ ${allNames.length} track tiles (${signalNames.length} signalled) → ${TILE_DIR}`);
  await writeFile(join(TILE_DIR, "index.json"), JSON.stringify(allNames, null, 2));

  if (!process.argv.includes("--preview")) return;
  const grass = groundTile([0x7f, 0xae, 0x54], [0x6f, 0x9c, 0x49]);

  // (a) contact sheet: every base tile on a faint diamond, in a tidy grid
  const names = Object.keys(TILES);
  const cols = 4;
  const cell = [TW + 32, TH + 40];
  const sheet = new Buf(cols * cell[0], Math.ceil(names.length / cols) * cell[1]);
  sheet.d.fill(0);
  names.forEach((n, i) => {
    const ox = (i % cols) * cell[0] + (cell[0] - TW) / 2;
    const oy = ((i / cols) | 0) * cell[1] + (cell[1] - TH) / 2;
    sheet.blit(grass, ox, oy);
    sheet.blit(built[n], ox, oy);
  });
  await writeFile("/tmp/railway_tiles_sheet.png", sheet.toPNG());

  // (a2) signals sheet: rows = orientation, cols = aspect (green/yellow/red)
  const scell = [TW + 32, TW + TH];
  const sig = new Buf(ASPECTS.length * scell[0], SIGNAL_POSTS.length * scell[1]);
  sig.d.fill(0);
  SIGNAL_POSTS.forEach(([base], r) =>
    ASPECTS.forEach((aspect, c) => {
      const gX = c * scell[0] + (scell[0] - TW) / 2;
      const gY = r * scell[1] + scell[1] - TH - 18;
      sig.blit(grass, gX, gY);
      sig.blit(built[signalName(base, aspect)], gX, gY - TH);
    }),
  );
  await writeFile("/tmp/railway_signals.png", sig.toPNG());

  // (b) demo scene: a "roundabout" (ring of curves + switches around a central
  // crossing) plus a branch line that runs off the map — every tile type, all
  // connecting, with signals along the branch (green top → yellow → red bottom).
  const layout = {
    "3,3": "curve_br_bl", "5,3": "curve_bl_tl", "5,5": "curve_tl_tr", "3,5": "curve_tr_br",
    "4,3": "switch_a_bl", "3,4": "switch_b_br", "5,4": "switch_b_tl", "4,5": "switch_a_tr",
    "4,4": "cross",
    "6,0": "straight_b_sig_green", "6,1": "straight_b", "6,2": "curve_tr_br",
    "7,2": "straight_a_sig_yellow", "8,2": "straight_a", "9,2": "straight_a_sig_red",
  };
  const GRID = 10;

  // connectivity assertion: every used edge must meet its opposite in the
  // neighbour that edge faces, unless that neighbour is off the board. A
  // signalled straight connects exactly like its base straight.
  const usedEdges = (name) =>
    [...new Set(TILES[name.replace(/_sig_(green|yellow|red)$/, "")].flat())];
  const DIR = { TL: [-1, 0, "BR"], BR: [1, 0, "TL"], TR: [0, -1, "BL"], BL: [0, 1, "TR"] };
  for (const [key, name] of Object.entries(layout)) {
    const [gx, gy] = key.split(",").map(Number);
    for (const e of usedEdges(name)) {
      const [dx, dy, opp] = DIR[e];
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const n = layout[`${nx},${ny}`];
      if (!n || !usedEdges(n).includes(opp))
        throw new Error(`dangling rail: ${name}@${key} edge ${e} → ${n ?? "empty"}@${nx},${ny}`);
    }
  }
  console.log("✓ demo layout is fully connected");

  const sceneW = (GRID + GRID) * (TW / 2);
  const sceneH = (GRID + GRID) * (TH / 2) + TW;
  const scene = new Buf(sceneW, sceneH);
  scene.d.fill(0);
  const baseX = sceneW / 2 - TW / 2;
  const baseY = TW - TH;
  const isoX = (gx, gy) => baseX + (gx - gy) * (TW / 2);
  const isoY = (gx, gy) => baseY + (gx + gy) * (TH / 2);
  for (let gy = 0; gy < GRID; gy++)
    for (let gx = 0; gx < GRID; gx++) scene.blit(grass, isoX(gx, gy), isoY(gx, gy));
  Object.entries(layout)
    .map(([k, t]) => ({ t, g: k.split(",").map(Number) }))
    .sort((a, b) => a.g[0] + a.g[1] - (b.g[0] + b.g[1]))
    .forEach(({ t, g: [gx, gy] }) =>
      scene.blit(built[t], isoX(gx, gy), isoY(gx, gy) + (TH - built[t].h)),
    );
  await writeFile("/tmp/railway_demo.png", scene.toPNG());
  console.log("✓ previews → sheet, signals, demo (/tmp/railway_*.png)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
