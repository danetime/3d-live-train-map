/**
 * Procedural isometric station assets — platforms (and, later, buildings).
 *
 *   node scripts/stationTiles.mjs            # write the assets
 *   node scripts/stationTiles.mjs --preview  # also write demo PNGs to /tmp
 *
 * Platforms are single-sided, 1-tile raised slabs you chain to any length, in
 * all four facings (the two iso axes × the two sides of the track):
 *
 *   platform_a_sw / platform_a_ne  — beside a gx-axis (straight_a, ↘) track
 *   platform_b_nw / platform_b_se  — beside a gy-axis (straight_b, ↙) track
 *
 * Each piece is a transparent 128×128 overlay (slab in the bottom half, raised
 * a few px) that drops into the same cell as a straight track tile — the same
 * convention the signals use, so the spike treats it as a "tall" tile (anchor
 * 0.75). Place two opposite facings in one cell for an island / both sides.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pkg from "pngjs";
import { Buf, fillQuad, line } from "./iso.mjs";
const { PNG } = pkg;

const here = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(here, "..", "src", "spike", "assets");
const TRACK_DIR = join(ASSET_DIR, "track");

// 128×128 frame with the ground diamond in the bottom half (centre 64,96).
const F = 128;
const cD = [64, 96];
const T = [64, 64], R = [128, 96], B = [64, 128], L = [0, 96]; // diamond corners
const TL = [32, 80], TR = [96, 80], BR = [96, 112], BL = [32, 112]; // edge midpoints
const PH = 9; // platform height (px)

const PAVING = [0xb9, 0xb3, 0xa6];
const PAVING_DK = [0xa8, 0xa2, 0x95];
const PAVING_LINE = [0x97, 0x91, 0x85];
const WALL = [0x6e, 0x68, 0x5e];
const WALL_HI = [0x86, 0x7f, 0x73];
const WALL_DK = [0x53, 0x4e, 0x45];
const COPING = [0x46, 0x42, 0x3c];
const WHITE = [0xe9, 0xe4, 0xd6];
const TACTILE = [0xd9, 0xb1, 0x3f];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const unit = (v) => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; };
const lift = (p) => [p[0], p[1] - PH];

// A raised platform slab. `corners` is the ground footprint (a half-diamond);
// edge `railIdx` is the one that runs alongside the track (gets the edge line).
function drawPlatform(corners0, railIdx) {
  const buf = new Buf(F, F);
  const n = corners0.length;
  const corners = corners0.slice();

  // pull the rail edge in off the track centre-line (which runs corner→corner
  // of the diamond) so the rails and ballast stay visible beside the platform.
  const INSET = 11;
  const c0 = corners[railIdx], c1 = corners[(railIdx + 1) % n];
  const mid0 = mul(add(c0, c1), 0.5);
  const cen0 = corners.reduce((a, p) => add(a, p), [0, 0]).map((v) => v / n);
  let perp = unit([-(c1[1] - c0[1]), c1[0] - c0[0]]);
  if (perp[0] * (cen0[0] - mid0[0]) + perp[1] * (cen0[1] - mid0[1]) < 0) perp = mul(perp, -1);
  corners[railIdx] = add(c0, mul(perp, INSET));
  corners[(railIdx + 1) % n] = add(c1, mul(perp, INSET));

  const cen = corners.reduce((a, p) => add(a, p), [0, 0]).map((v) => v / n);
  const top = corners.map(lift);

  // visible side walls (edges whose outward normal points toward the camera)
  for (let i = 0; i < n; i++) {
    const a = corners[i], b = corners[(i + 1) % n];
    const mid = mul(add(a, b), 0.5);
    let nrm = [-(b[1] - a[1]), b[0] - a[0]];
    if (nrm[0] * (mid[0] - cen[0]) + nrm[1] * (mid[1] - cen[1]) < 0) nrm = mul(nrm, -1);
    if (nrm[1] <= 0.05) continue; // faces away / sideways → hidden
    const shade = nrm[0] < 0 ? WALL_HI : WALL; // SW-facing a touch lighter
    fillQuad(buf, [a, b, lift(b), lift(a)], shade);
    line(buf, a[0], a[1], b[0], b[1], WALL_DK); // grounded base
    line(buf, lift(a)[0], lift(a)[1], lift(b)[0], lift(b)[1], WALL_HI); // top arris
  }

  // paving top
  fillQuad(buf, top, PAVING);
  // expansion joints, parallel to the rail edge
  const rA = top[railIdx], rB = top[(railIdx + 1) % n];
  const along = unit(sub(rB, rA));
  let inward = [-(rB[1] - rA[1]), rB[0] - rA[0]];
  if (inward[0] * (cen[0] - rA[0]) + inward[1] * (cen[1] - rA[1]) < 0) inward = mul(inward, -1);
  inward = unit(inward);
  const len = Math.hypot(rB[0] - rA[0], rB[1] - rA[1]);
  for (let d = 12; d < len; d += 12) {
    const p = add(rA, mul(along, d));
    const q = add(p, mul(inward, 24));
    line(buf, p[0], p[1], q[0], q[1], PAVING_LINE);
  }

  // platform edge: coping (dark lip) → white safety line → yellow tactile
  const strip = (o0, o1, col) =>
    fillQuad(buf, [add(rA, mul(inward, o0)), add(rB, mul(inward, o0)), add(rB, mul(inward, o1)), add(rA, mul(inward, o1))], col);
  strip(-1, 1.5, COPING);
  strip(1.5, 3.5, WHITE);
  strip(3.5, 6, TACTILE);
  return buf;
}

// ---------------------------------------------------------------------------
// Station building — a GWR-style country station: buff-stone walls, a slate
// gable roof, a platform canopy with white valance on iron posts, windows, a
// central door and a chimney. Parameterised by length N (tiles), drawn in the
// "hero" facing (on the far/NE platform so its canopied front faces the camera).
// ---------------------------------------------------------------------------
const STONE = [0xc9, 0xb8, 0x97];
const STONE_DK = [0xae, 0x9d, 0x7e];
const STONE_HI = [0xd9, 0xca, 0xab];
const QUOIN = [0xe1, 0xd5, 0xb8];
const SLATE = [0x50, 0x57, 0x5e];
const SLATE_DK = [0x3c, 0x42, 0x49];
const SLATE_HI = [0x64, 0x6c, 0x74];
const CANOPY = [0x44, 0x49, 0x4f];
const VALANCE = [0xe9, 0xe4, 0xd6];
const POST = [0x33, 0x37, 0x3d];
const WIN = [0x27, 0x37, 0x40];
const WIN_HI = [0x7a, 0x9d, 0xa9];
const DOOR = [0x5b, 0x40, 0x2c];
const POT = [0x8a, 0x4f, 0x39];

const PHt = 9; // platform height the building stands on

function drawStation(N) {
  const A = [2, 1]; // length axis (↘, along the track)
  const Dp = [2, -1]; // depth axis (toward NE, away from camera)
  const Lb = N * 13, Db = 8; // half-length, half-depth
  const He = 30, Hr = 42; // eaves, ridge height (above the platform top)
  const W = 4 * Lb + 120, H = 2 * Lb + 150;
  const Gb = [W / 2 - Db, H - 86]; // footprint centre (ground), shifted onto the platform
  const buf = new Buf(W, H);

  const fc = (sL, sD) => [Gb[0] + sL * Lb * A[0] + sD * Db * Dp[0], Gb[1] + sL * Lb * A[1] + sD * Db * Dp[1]];
  const at = (p, h) => [p[0], p[1] - PHt - h]; // raise onto platform, then up by h
  const FL = fc(-1, -1), FR = fc(1, -1), BR = fc(1, 1); // ground corners (front-left/right, back-right)
  const frontAlong = sub(FR, FL);
  const fw = (s, h) => at([FL[0] + frontAlong[0] * s, FL[1] + frontAlong[1] * s], h);
  const ridgeA = at([Gb[0] - Lb * A[0], Gb[1] - Lb * A[1]], Hr); // ridge ends (centre depth)
  const ridgeB = at([Gb[0] + Lb * A[0], Gb[1] + Lb * A[1]], Hr);

  // --- stone walls --------------------------------------------------------
  fillQuad(buf, [at(FR, 0), at(BR, 0), at(BR, He), at(FR, He)], STONE_DK); // SE end wall
  fillQuad(buf, [at(FL, 0), at(FR, 0), at(FR, He), at(FL, He)], STONE); // front wall
  fillQuad(buf, [at(FL, 0), at(FR, 0), at(FR, 3), at(FL, 3)], STONE_DK); // plinth
  fillQuad(buf, [at(FR, He), at(BR, He), ridgeB], STONE_HI); // SE gable triangle
  for (const c of [FL, FR]) line(buf, at(c, 0)[0], at(c, 0)[1], at(c, He)[0], at(c, He)[1], QUOIN); // quoins

  // --- gable roof ---------------------------------------------------------
  fillQuad(buf, [at(FL, He), at(FR, He), ridgeB, ridgeA], SLATE); // front slope
  line(buf, ridgeA[0], ridgeA[1], ridgeB[0], ridgeB[1], SLATE_HI); // ridge
  line(buf, at(FL, He)[0], at(FL, He)[1], at(FR, He)[0], at(FR, He)[1], SLATE_DK); // eave
  line(buf, at(FR, He)[0], at(FR, He)[1], ridgeB[0], ridgeB[1], SLATE_HI); // SE verge
  const ch = at([Gb[0] - Lb * A[0] * 0.45, Gb[1] - Lb * A[1] * 0.45], Hr + 4); // chimney near -A ridge
  fillQuad(buf, [[ch[0] - 4, ch[1] - 7], [ch[0] + 4, ch[1] - 7], [ch[0] + 4, ch[1] + 7], [ch[0] - 4, ch[1] + 7]], STONE_DK);
  fillQuad(buf, [[ch[0] - 5, ch[1] - 9], [ch[0] + 5, ch[1] - 9], [ch[0] + 5, ch[1] - 7], [ch[0] - 5, ch[1] - 7]], POT);

  // --- windows + central door (high on the wall; door reaches the platform)
  const bays = Math.max(2, N + 1);
  for (let k = 0; k < bays; k++) {
    const s = (k + 0.5) / bays;
    if (k === (bays >> 1)) {
      fillQuad(buf, [fw(s - 0.035, 2), fw(s + 0.035, 2), fw(s + 0.035, 22), fw(s - 0.035, 22)], DOOR);
    } else {
      fillQuad(buf, [fw(s - 0.05, 15), fw(s + 0.05, 15), fw(s + 0.05, 27), fw(s - 0.05, 27)], WIN);
      fillQuad(buf, [fw(s - 0.05, 25), fw(s + 0.05, 25), fw(s + 0.05, 27), fw(s - 0.05, 27)], WIN_HI);
    }
  }

  // --- platform canopy: a lean-to reaching over the platform on iron posts -
  const Cd = 20; // reach toward the track (in -Dp units)
  const outAt = (s, h) => at([FL[0] + frontAlong[0] * s - Dp[0] * Cd, FL[1] + frontAlong[1] * s - Dp[1] * Cd], h);
  fillQuad(buf, [fw(0, 24), fw(1, 24), outAt(1, 15), outAt(0, 15)], CANOPY); // canopy roof
  line(buf, outAt(0, 15)[0], outAt(0, 15)[1], outAt(1, 15)[0], outAt(1, 15)[1], SLATE_HI);
  fillQuad(buf, [outAt(0, 15), outAt(1, 15), [outAt(1, 15)[0], outAt(1, 15)[1] + 5], [outAt(0, 15)[0], outAt(0, 15)[1] + 5]], VALANCE); // valance
  const posts = N + 1;
  for (let k = 0; k <= posts; k++) {
    const o = outAt(k / posts, 15);
    line(buf, o[0], o[1] + 5, o[0], o[1] + 21, POST); // post down to the platform
  }
  return { buf, anchor: [Gb[0] / W, Gb[1] / H] };
}

// the four facings (footprint corners ordered, with the rail edge index)
const PLATFORMS = {
  platform_a_sw: { corners: [TL, BR, B, L], rail: 0 }, // gx track, slab on the SW side
  platform_a_ne: { corners: [TL, T, R, BR], rail: 3 }, // gx track, slab on the NE side
  platform_b_se: { corners: [TR, R, B, BL], rail: 3 }, // gy track, slab on the SE side
  platform_b_nw: { corners: [TR, T, L, BL], rail: 3 }, // gy track, slab on the NW side
};

async function main() {
  await mkdir(ASSET_DIR, { recursive: true });
  const built = {};
  for (const [name, cfg] of Object.entries(PLATFORMS)) {
    built[name] = drawPlatform(cfg.corners, cfg.rail);
    await writeFile(join(ASSET_DIR, `${name}.png`), built[name].toPNG());
  }
  console.log(`✓ ${Object.keys(PLATFORMS).length} platform tiles → ${ASSET_DIR}`);

  // station buildings (small/medium/large = 1/2/3 tiles long)
  const stations = { station_small: drawStation(1), station_medium: drawStation(2), station_large: drawStation(3) };
  const manifest = {};
  for (const [name, { buf, anchor }] of Object.entries(stations)) {
    await writeFile(join(ASSET_DIR, `${name}.png`), buf.toPNG());
    manifest[name] = { w: buf.w, h: buf.h, anchor };
  }
  await writeFile(join(ASSET_DIR, "stations.json"), JSON.stringify(manifest, null, 2));
  console.log(`✓ 3 station buildings → ${ASSET_DIR}`);

  if (!process.argv.includes("--preview")) return;
  const TW = 128, TH = 64;
  const grass = new Buf(TW, TH);
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++) {
      const cx = (x + 0.5 - TW / 2) / (TW / 2), cy = (y + 0.5 - TH / 2) / (TH / 2);
      const m = Math.abs(cx) + Math.abs(cy);
      if (m <= 1) grass.px(x, y, m > 0.92 ? [0x6f, 0x9c, 0x49] : [0x7f, 0xae, 0x54]);
    }
  const tile = (n) => { const p = PNG.sync.read(readFileSync(join(TRACK_DIR, `${n}.png`))); const b = new Buf(p.width, p.height); b.d.set(p.data); return b; };

  const GRID = 9, W = (GRID + GRID) * (TW / 2), Hh = (GRID + GRID) * (TH / 2) + F;
  const scene = new Buf(W, Hh); scene.d.fill(0);
  const bx = W / 2 - TW / 2, by = F - TH;
  const ix = (gx, gy) => bx + (gx - gy) * (TW / 2), iy = (gx, gy) => by + (gx + gy) * (TH / 2);
  const ops = [];
  const put = (b, gx, gy) => ops.push({ d: gx + gy + (b.h > TH ? 0.2 : 0.1), fn: () => scene.blit(b, ix(gx, gy), iy(gx, gy) + (TH - b.h)) });
  // (1) gx straight, single SW platform — track stays visible on the NE side
  for (let k = 0; k < 3; k++) { put(tile("straight_a"), 1 + k, 1); put(built.platform_a_sw, 1 + k, 1); }
  // (2) gx straight, BOTH sides (island) — track runs down the middle
  for (let k = 0; k < 3; k++) { put(tile("straight_a"), 1 + k, 4); put(built.platform_a_sw, 1 + k, 4); put(built.platform_a_ne, 1 + k, 4); }
  // (3) gy straight, single SE platform
  for (let k = 0; k < 3; k++) { put(tile("straight_b"), 7, 1 + k); put(built.platform_b_se, 7, 1 + k); }
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) scene.blit(grass, ix(gx, gy), iy(gx, gy));
  ops.sort((a, b) => a.d - b.d).forEach((o) => o.fn());
  await writeFile("/tmp/platforms.png", scene.toPNG());
  console.log("✓ preview → /tmp/platforms.png");

  // --- stations scene: small/medium/large on NE platforms, + a train -------
  const readAsset = (n) => { const p = PNG.sync.read(readFileSync(join(ASSET_DIR, `${n}.png`))); const b = new Buf(p.width, p.height); b.d.set(p.data); return b; };
  const trainA = readAsset("train_a");
  const SG = 10, SW2 = (SG + SG) * (TW / 2), SH = (SG + SG) * (TH / 2) + 230;
  const ss = new Buf(SW2, SH); ss.d.fill(0);
  const sbx = SW2 / 2 - TW / 2, sby = 180;
  const six = (gx, gy) => sbx + (gx - gy) * (TW / 2), siy = (gx, gy) => sby + (gx + gy) * (TH / 2);
  const sops = [];
  const sput = (b, gx, gy, dz) => sops.push({ d: gx + gy + dz, fn: () => ss.blit(b, six(gx, gy), siy(gx, gy) + (TH - b.h)) });
  const NUDGE = [34, -17]; // shift building onto the NE platform
  const place = (name, N, g0, gy) => {
    for (let k = 0; k < N; k++) { sput(tile("straight_a"), g0 + k, gy, 0.1); sput(built.platform_a_ne, g0 + k, gy, 0.2); }
    const { buf } = stations[name];
    const a = manifest[name].anchor, gc = g0 + (N - 1) / 2;
    const cx = six(gc, gy) + TW / 2, cy = siy(gc, gy) + TH / 2;
    sops.push({ d: gc + gy + 0.3, fn: () => ss.blit(buf, Math.round(cx - a[0] * buf.w + NUDGE[0]), Math.round(cy - a[1] * buf.h + NUDGE[1])) });
  };
  place("station_small", 1, 2, 2);
  place("station_medium", 2, 4, 3);
  place("station_large", 3, 3, 6);
  sops.push({ d: 4 + 3 + 0.5, fn: () => ss.blit(trainA, Math.round(six(5, 3) + TW / 2 - 64), Math.round(siy(5, 3) + TH / 2 - 84)) });
  for (let gy = 0; gy < SG; gy++) for (let gx = 0; gx < SG; gx++) ss.blit(grass, six(gx, gy), siy(gx, gy));
  sops.sort((a, b) => a.d - b.d).forEach((o) => o.fn());
  await writeFile("/tmp/stations.png", ss.toPNG());
  console.log("✓ preview → /tmp/stations.png");
}

main().catch((e) => { console.error(e); process.exit(1); });
