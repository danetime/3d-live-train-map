/**
 * Procedural isometric station assets — platforms and station buildings.
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
 * Each comes with two mirrored end ramps (`_ramp_lo` / `_ramp_hi`) that taper
 * the slab down to the ground, so a run can finish with a slope rather than a
 * vertical face. Each piece is a transparent 128×128 overlay (slab in the
 * bottom half, raised a few px) that drops into the same cell as a straight
 * track tile — the same convention the signals use, so the spike treats it as a
 * "tall" tile (anchor 0.75). Place two opposite facings in one cell for an
 * island / both sides.
 *
 * Station buildings come in three lengths (small/medium/large = 1/2/3 tiles)
 * and the same four facings; two face their canopied front to the camera, two
 * sit between you and the track so you see the plainer back. Placement anchors
 * and per-facing nudges live alongside in stations.json.
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

// A raised platform slab. `corners` is the ground footprint (a half-diamond);
// edge `railIdx` is the one that runs alongside the track (gets the edge line).
// `ramp` taper the slab down to (almost) ground at one end of the run, so a
// chain can start/finish with a sloped end instead of a vertical face:
//   'lo' → ramps at the low end of the rail edge, 'hi' → the high end.
function drawPlatform(corners0, railIdx, ramp) {
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

  // per-vertex slab height. Flat at PH everywhere, unless `ramp`, in which case
  // the two corners at the chosen end of the rail edge drop to a thin lip so the
  // top face slopes down to the ground there.
  const axis = unit(sub(corners[(railIdx + 1) % n], corners[railIdx])); // along the rail edge
  const proj = corners.map((c) => c[0] * axis[0] + c[1] * axis[1]);
  const lo = Math.min(...proj), hi = Math.max(...proj);
  const LIP = 1; // 1px lip so the sloped end never knife-edges to nothing
  const hgt = corners.map((c, i) => {
    if (!ramp) return PH;
    const atLo = proj[i] - lo < hi - proj[i]; // nearer the low end of the rail edge
    return (ramp === "lo") === atLo ? LIP : PH;
  });
  const liftN = (i) => [corners[i][0], corners[i][1] - hgt[i]];
  const top = corners.map((_, i) => liftN(i));

  // visible side walls (edges whose outward normal points toward the camera)
  for (let i = 0; i < n; i++) {
    const a = corners[i], b = corners[(i + 1) % n];
    const ta = top[i], tb = top[(i + 1) % n];
    const mid = mul(add(a, b), 0.5);
    let nrm = [-(b[1] - a[1]), b[0] - a[0]];
    if (nrm[0] * (mid[0] - cen[0]) + nrm[1] * (mid[1] - cen[1]) < 0) nrm = mul(nrm, -1);
    if (nrm[1] <= 0.05) continue; // faces away / sideways → hidden
    const shade = nrm[0] < 0 ? WALL_HI : WALL; // SW-facing a touch lighter
    fillQuad(buf, [a, b, tb, ta], shade);
    line(buf, a[0], a[1], b[0], b[1], WALL_DK); // grounded base
    line(buf, ta[0], ta[1], tb[0], tb[1], WALL_HI); // top arris
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
// central door and a chimney. Parameterised by length N (tiles) and `facing`,
// one per platform side. Two facings put the canopied track-front toward the
// camera (a_ne, b_nw); the other two sit between you and the track, so you see
// the plainer back (a_sw, b_se). The canvas is sized to whatever the facing
// needs and the ground-footprint centre is returned as the placement anchor.
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

// length axis A (↘ along the track) and depth axis Dp (toward the platform's
// outer edge, away from the track) for each platform side. frontVis (Dp[1] < 0)
// means the canopied track-front faces the camera.
const FACING = {
  a_ne: { A: [2, 1], Dp: [2, -1] }, // gx track, NE platform — canopied front to camera (hero)
  a_sw: { A: [2, 1], Dp: [-2, 1] }, // gx track, SW platform — between you and the track (back view)
  b_nw: { A: [-2, 1], Dp: [-2, -1] }, // gy track, NW platform — front to camera
  b_se: { A: [-2, 1], Dp: [2, 1] }, // gy track, SE platform — back view
};

function drawStation(N, facing) {
  const { A, Dp } = FACING[facing];
  const frontVis = Dp[1] < 0; // canopied front camera-facing? else we see the back
  const Lb = N * 13, Db = 8; // half-length, half-depth
  const He = 30, Hr = 42; // eaves, ridge height (above the platform top)
  const Cd = 20; // canopy reach toward the track (in -Dp units)
  const sLong = frontVis ? -1 : 1; // depth sign of the camera-facing long wall

  // geometry relative to the ground-footprint centre (0,0); the iso projection
  // is already baked into A/Dp. A mutable offset lets us size the canvas to the
  // art: first pass with no offset to measure, then shift everything into frame.
  let OX = 0, OY = 0;
  const fc = (sL, sD) => [sL * Lb * A[0] + sD * Db * Dp[0], sL * Lb * A[1] + sD * Db * Dp[1]];
  const at = (p, h) => [p[0] + OX, p[1] - PHt - h + OY]; // raise onto platform, then up by h
  const R = (sL) => at([sL * Lb * A[0], sL * Lb * A[1]], Hr); // ridge end (centre depth)
  const base = (s, sD) => [fc(-1, sD)[0] + (fc(1, sD)[0] - fc(-1, sD)[0]) * s, fc(-1, sD)[1] + (fc(1, sD)[1] - fc(-1, sD)[1]) * s];
  const ww = (s, h, sD) => at(base(s, sD), h); // walk a long wall: s 0→1 over its length
  const outAt = (s, h) => at([base(s, -1)[0] - Dp[0] * Cd, base(s, -1)[1] - Dp[1] * Cd], h); // canopy edge

  // --- measure: gather the extreme points, then size + offset the canvas ---
  const ch0 = () => at([-Lb * A[0] * 0.45, -Lb * A[1] * 0.45], Hr + 4); // chimney top
  const pts = [];
  for (const sL of [-1, 1]) for (const sD of [-1, 1]) pts.push(at(fc(sL, sD), 0), at(fc(sL, sD), He));
  pts.push(R(-1), R(1), [ch0()[0] - 5, ch0()[1] - 9], [ch0()[0] + 5, ch0()[1] + 7]);
  if (frontVis) pts.push(outAt(0, 15), outAt(1, 15), [outAt(0, 15)[0], outAt(0, 15)[1] + 26], [outAt(1, 15)[0], outAt(1, 15)[1] + 26]);
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of pts) { minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]); maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]); }
  const pad = 6;
  const W = Math.ceil(maxx - minx) + 2 * pad, H = Math.ceil(maxy - miny) + 2 * pad;
  OX = pad - minx; OY = pad - miny; // shift so the art (and the ground centre) land in frame
  const buf = new Buf(W, H);

  // --- stone walls --------------------------------------------------------
  fillQuad(buf, [at(fc(1, -1), 0), at(fc(1, 1), 0), at(fc(1, 1), He), at(fc(1, -1), He)], STONE_DK); // +A end wall
  fillQuad(buf, [ww(0, 0, sLong), ww(1, 0, sLong), ww(1, He, sLong), ww(0, He, sLong)], STONE); // long wall (front/back)
  fillQuad(buf, [ww(0, 0, sLong), ww(1, 0, sLong), ww(1, 3, sLong), ww(0, 3, sLong)], STONE_DK); // plinth
  fillQuad(buf, [at(fc(1, -1), He), at(fc(1, 1), He), R(1)], STONE_HI); // +A gable triangle
  for (const c of [fc(-1, sLong), fc(1, sLong), fc(1, -sLong)]) line(buf, at(c, 0)[0], at(c, 0)[1], at(c, He)[0], at(c, He)[1], QUOIN); // quoins

  // --- gable roof ---------------------------------------------------------
  fillQuad(buf, [ww(0, He, sLong), ww(1, He, sLong), R(1), R(-1)], SLATE); // visible slope
  line(buf, R(-1)[0], R(-1)[1], R(1)[0], R(1)[1], SLATE_HI); // ridge
  line(buf, ww(0, He, sLong)[0], ww(0, He, sLong)[1], ww(1, He, sLong)[0], ww(1, He, sLong)[1], SLATE_DK); // eave
  line(buf, ww(1, He, sLong)[0], ww(1, He, sLong)[1], R(1)[0], R(1)[1], SLATE_HI); // +A verge
  const ch = ch0();
  fillQuad(buf, [[ch[0] - 4, ch[1] - 7], [ch[0] + 4, ch[1] - 7], [ch[0] + 4, ch[1] + 7], [ch[0] - 4, ch[1] + 7]], STONE_DK);
  fillQuad(buf, [[ch[0] - 5, ch[1] - 9], [ch[0] + 5, ch[1] - 9], [ch[0] + 5, ch[1] - 7], [ch[0] - 5, ch[1] - 7]], POT);

  // --- windows + door on the camera-facing long wall ----------------------
  const bays = Math.max(2, N + 1);
  for (let k = 0; k < bays; k++) {
    const s = (k + 0.5) / bays;
    if (k === (bays >> 1)) {
      const top = frontVis ? 22 : 18; // shorter staff door round the back
      fillQuad(buf, [ww(s - 0.035, 2, sLong), ww(s + 0.035, 2, sLong), ww(s + 0.035, top, sLong), ww(s - 0.035, top, sLong)], DOOR);
    } else {
      const [w, lo2, hi2] = frontVis ? [0.05, 15, 27] : [0.04, 17, 26]; // smaller windows round the back
      fillQuad(buf, [ww(s - w, lo2, sLong), ww(s + w, lo2, sLong), ww(s + w, hi2, sLong), ww(s - w, hi2, sLong)], WIN);
      fillQuad(buf, [ww(s - w, hi2 - 2, sLong), ww(s + w, hi2 - 2, sLong), ww(s + w, hi2, sLong), ww(s - w, hi2, sLong)], WIN_HI);
    }
  }

  // --- platform canopy: a lean-to over the platform on iron posts (front only)
  if (frontVis) {
    fillQuad(buf, [ww(0, 24, -1), ww(1, 24, -1), outAt(1, 15), outAt(0, 15)], CANOPY); // canopy roof
    line(buf, outAt(0, 15)[0], outAt(0, 15)[1], outAt(1, 15)[0], outAt(1, 15)[1], SLATE_HI);
    fillQuad(buf, [outAt(0, 15), outAt(1, 15), [outAt(1, 15)[0], outAt(1, 15)[1] + 5], [outAt(0, 15)[0], outAt(0, 15)[1] + 5]], VALANCE); // valance
    const posts = N + 1;
    for (let k = 0; k <= posts; k++) {
      const o = outAt(k / posts, 15);
      line(buf, o[0], o[1] + 5, o[0], o[1] + 21, POST); // post down to the platform
    }
  }

  // anchor = the ground-footprint centre (fc(0,0)); the nudge slides the
  // building from the track centre-line onto its platform (toward +Dp).
  return { buf, anchor: [OX / W, OY / H], nudge: [Dp[0] * 17, Dp[1] * 17] };
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
  // platform tiles: a flat mid piece per facing, plus the two mirrored end
  // ramps (`_ramp_lo` / `_ramp_hi`) you cap a run with.
  const built = {};
  for (const [name, cfg] of Object.entries(PLATFORMS)) {
    built[name] = drawPlatform(cfg.corners, cfg.rail);
    await writeFile(join(ASSET_DIR, `${name}.png`), built[name].toPNG());
    for (const end of ["lo", "hi"]) {
      const rn = `${name}_ramp_${end}`;
      built[rn] = drawPlatform(cfg.corners, cfg.rail, end);
      await writeFile(join(ASSET_DIR, `${rn}.png`), built[rn].toPNG());
    }
  }
  console.log(`✓ ${Object.keys(built).length} platform tiles → ${ASSET_DIR}`);

  // station buildings: small/medium/large (1/2/3 tiles) × the four facings
  const SIZES = { small: 1, medium: 2, large: 3 };
  const stations = {};
  for (const [sz, N] of Object.entries(SIZES))
    for (const f of Object.keys(FACING)) stations[`station_${sz}_${f}`] = drawStation(N, f);
  const manifest = {};
  for (const [name, { buf, anchor, nudge }] of Object.entries(stations)) {
    await writeFile(join(ASSET_DIR, `${name}.png`), buf.toPNG());
    manifest[name] = { w: buf.w, h: buf.h, anchor, nudge };
  }
  await writeFile(join(ASSET_DIR, "stations.json"), JSON.stringify(manifest, null, 2));
  console.log(`✓ ${Object.keys(stations).length} station buildings → ${ASSET_DIR}`);

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
  // (4) gx straight, single SW platform with sloped end ramps capping the run
  for (let k = 0; k < 4; k++) {
    put(tile("straight_a"), 1 + k, 7);
    const p = k === 0 ? built.platform_a_sw_ramp_lo : k === 3 ? built.platform_a_sw_ramp_hi : built.platform_a_sw;
    put(p, 1 + k, 7);
  }
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
  // lay each facing on its own track + platform; the manifest's per-facing nudge
  // slides the building off the track centre-line onto the platform.
  const place = (size, facing, g0x, g0y) => {
    const isA = facing[0] === "a", N = SIZES[size], name = `station_${size}_${facing}`;
    for (let k = 0; k < N; k++) {
      const gx = isA ? g0x + k : g0x, gy = isA ? g0y : g0y + k;
      sput(tile(isA ? "straight_a" : "straight_b"), gx, gy, 0.1);
      sput(built[`platform_${facing}`], gx, gy, 0.2);
    }
    const { buf } = stations[name], a = manifest[name].anchor, nu = manifest[name].nudge;
    const cgx = isA ? g0x + (N - 1) / 2 : g0x, cgy = isA ? g0y : g0y + (N - 1) / 2;
    const cx = six(cgx, cgy) + TW / 2, cy = siy(cgx, cgy) + TH / 2;
    sops.push({ d: cgx + cgy + 0.3, fn: () => ss.blit(buf, Math.round(cx - a[0] * buf.w + nu[0]), Math.round(cy - a[1] * buf.h + nu[1])) });
  };
  place("large", "a_ne", 2, 2); // hero: canopied front to camera
  place("medium", "b_nw", 7, 1); // front to camera (other axis)
  place("medium", "a_sw", 1, 6); // back view (building between you and the track)
  place("medium", "b_se", 7, 6); // back view (other axis)
  sops.push({ d: 4 + 2 + 0.5, fn: () => ss.blit(trainA, Math.round(six(4, 2) + TW / 2 - 64), Math.round(siy(4, 2) + TH / 2 - 84)) });
  for (let gy = 0; gy < SG; gy++) for (let gx = 0; gx < SG; gx++) ss.blit(grass, six(gx, gy), siy(gx, gy));
  sops.sort((a, b) => a.d - b.d).forEach((o) => o.fn());
  await writeFile("/tmp/stations.png", ss.toPNG());
  console.log("✓ preview → /tmp/stations.png");
}

main().catch((e) => { console.error(e); process.exit(1); });
