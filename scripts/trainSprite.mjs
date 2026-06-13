/**
 * Procedural isometric train sprite — a boxy Class 150 "Sprinter" DMU.
 *
 *   node scripts/trainSprite.mjs            # write the sprites
 *   node scripts/trainSprite.mjs --preview  # also write a demo PNG to /tmp
 *
 * The track only runs along the two iso axes, so a train following it always
 * travels along a screen diagonal — ↘/↖ (the straight_a line) or ↙/↗
 * (straight_b). A double-ended DMU looks the same going either way along a line
 * (both ends are yellow cabs), so two sprites cover all four headings:
 *
 *   train_a — aligned to the gx axis (used for ↘ and ↖)
 *   train_b — aligned to the gy axis (used for ↙ and ↗), the mirror image
 *
 * Each is drawn as an iso box (roof + the two camera-facing faces) at 2× to
 * match the track tiles, then detailed: GWR-green body, cream waistline, a row
 * of windows and doors down the long side, a yellow cab end with twin
 * windscreens and headlights, a grey roof with vents, and bogies underneath.
 * The foot of the box sits at the sprite's anchor so it plants on the rail.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pkg from "pngjs";
import { Buf, disc, fillQuad, line } from "./iso.mjs";
const { PNG } = pkg;

const here = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(here, "..", "src", "spike", "assets");

const CW = 128, CH = 120; // sprite canvas
const GC = [64, 84]; // ground centre of the footprint (= the anchor point)
export const ANCHOR = [GC[0] / CW, GC[1] / CH]; // (0.5, 0.7) for the spike

const L2 = 13, W2 = 4.5, H = 30; // half-length, half-width, height

// ---- livery (GWR-ish dark green, fitting the Exeter setting) ----------------
const GREEN = [0x22, 0x74, 0x4f];
const GREEN_DK = [0x17, 0x57, 0x3b];
const ROOF = [0x9a, 0x9f, 0xa1];
const ROOF_HI = [0xb8, 0xbc, 0xbd];
const ROOF_DK = [0x7c, 0x81, 0x83];
const BAND = [0x12, 0x1a, 0x22]; // window band
const GLASS = [0x8a, 0xb4, 0xc6];
const GLASS_HI = [0xb0, 0xd2, 0xde];
const STRIPE = [0xea, 0xe4, 0xd4]; // cream waistline
const YELLOW = [0xf4, 0xc4, 0x14];
const CABGLASS = [0x1f, 0x2b, 0x32];
const SKIRT = [0x2b, 0x2e, 0x33];
const BOGIE = [0x16, 0x18, 0x1b];
const HEADLIGHT = [0xfd, 0xf6, 0xd6];
const OUTLINE = [0x0f, 0x1d, 0x17];

// box corner in screen space: sL,sW ∈ {-1,+1} along the length/width axes
const corner = (A, C, sL, sW) => [
  GC[0] + sL * L2 * A[0] + sW * W2 * C[0],
  GC[1] + sL * L2 * A[1] + sW * W2 * C[1],
];
const up = (p) => [p[0], p[1] - H];
// map across a face: origin O, edge vector `along` (s ∈ 0..1), height (h ∈ 0..1)
const onFace = (O, along, s, h) => [O[0] + along[0] * s, O[1] + along[1] * s - H * h];

function drawTrain(dir) {
  const A = dir === "a" ? [2, 1] : [-2, 1]; // length axis (toward the cab end)
  const C = dir === "a" ? [-2, 1] : [2, 1]; // width axis (toward the long side)
  const buf = new Buf(CW, CH);

  const P1 = corner(A, C, +1, -1); // front, far side
  const P2 = corner(A, C, +1, +1); // front, near (long-side) corner
  const P3 = corner(A, C, -1, +1); // back, near
  const P4 = corner(A, C, -1, -1); // back, far

  // --- faces -----------------------------------------------------------
  fillQuad(buf, [P2, P3, up(P3), up(P2)], GREEN); // long side
  fillQuad(buf, [P1, P2, up(P2), up(P1)], YELLOW); // cab end
  fillQuad(buf, [up(P1), up(P2), up(P3), up(P4)], ROOF); // roof

  // --- long side detail (origin P2, runs back along the +C edge) -------
  const sideAlong = [P3[0] - P2[0], P3[1] - P2[1]];
  const side = (s, h) => onFace(P2, sideAlong, s, h);
  fillQuad(buf, [side(0.02, 0), side(0.98, 0), side(0.98, 0.17), side(0.02, 0.17)], SKIRT);
  fillQuad(buf, [side(0.02, 0.44), side(0.98, 0.44), side(0.98, 0.49), side(0.02, 0.49)], STRIPE);
  fillQuad(buf, [side(0.06, 0.52), side(0.94, 0.52), side(0.94, 0.8), side(0.06, 0.8)], BAND);
  const win = 6;
  for (let k = 0; k < win; k++) {
    const s0 = 0.08 + (k + 0.1) * (0.84 / win);
    const s1 = 0.08 + (k + 0.9) * (0.84 / win);
    fillQuad(buf, [side(s0, 0.55), side(s1, 0.55), side(s1, 0.77), side(s0, 0.77)], GLASS);
    fillQuad(buf, [side(s0, 0.55), side(s1, 0.55), side(s1, 0.59), side(s0, 0.59)], GLASS_HI);
  }
  for (const ds of [0.18, 0.82]) {
    // doors: a slightly darker panel with a tall window
    fillQuad(buf, [side(ds - 0.05, 0.17), side(ds + 0.05, 0.17), side(ds + 0.05, 0.88), side(ds - 0.05, 0.88)], GREEN_DK);
    fillQuad(buf, [side(ds - 0.03, 0.55), side(ds + 0.03, 0.55), side(ds + 0.03, 0.78), side(ds - 0.03, 0.78)], GLASS);
  }
  for (const ds of [0.26, 0.74]) {
    // bogies under the body
    const c = side(ds, 0);
    fillQuad(buf, [[c[0] - 9, c[1] - 1], [c[0] + 9, c[1] + 8], [c[0] + 9, c[1] + 13], [c[0] - 9, c[1] + 4]], BOGIE);
  }

  // --- cab end detail (origin P1, runs across to P2) -------------------
  const endAlong = [P2[0] - P1[0], P2[1] - P1[1]];
  const end = (s, h) => onFace(P1, endAlong, s, h);
  fillQuad(buf, [end(0, 0.86), end(1, 0.86), end(1, 1), end(0, 1)], ROOF); // roof wrap
  fillQuad(buf, [end(0.04, 0), end(0.96, 0), end(0.96, 0.12), end(0.04, 0.12)], SKIRT);
  fillQuad(buf, [end(0.12, 0.52), end(0.46, 0.52), end(0.46, 0.8), end(0.12, 0.8)], CABGLASS);
  fillQuad(buf, [end(0.54, 0.52), end(0.88, 0.52), end(0.88, 0.8), end(0.54, 0.8)], CABGLASS);
  for (const es of [0.2, 0.8]) {
    const c = end(es, 0.3);
    disc(buf, c[0], c[1], 2, HEADLIGHT);
  }
  const cc = end(0.5, 0); // coupler stub
  fillQuad(buf, [[cc[0] - 2, cc[1] - 1], [cc[0] + 2, cc[1] - 1], [cc[0] + 2, cc[1] + 4], [cc[0] - 2, cc[1] + 4]], BOGIE);

  // --- roof detail + edge definition ----------------------------------
  const roofAlong = [up(P4)[0] - up(P1)[0], up(P4)[1] - up(P1)[1]];
  const roofCross = [up(P2)[0] - up(P1)[0], up(P2)[1] - up(P1)[1]];
  const roof = (s, t) => [
    up(P1)[0] + roofAlong[0] * s + roofCross[0] * t,
    up(P1)[1] + roofAlong[1] * s + roofCross[1] * t,
  ];
  for (const rs of [0.3, 0.52, 0.72])
    fillQuad(buf, [roof(rs - 0.04, 0.38), roof(rs + 0.04, 0.38), roof(rs + 0.04, 0.62), roof(rs - 0.04, 0.62)], ROOF_DK);
  line(buf, up(P1)[0], up(P1)[1], up(P2)[0], up(P2)[1], ROOF_HI); // sunlit roof edges
  line(buf, up(P2)[0], up(P2)[1], up(P3)[0], up(P3)[1], ROOF_HI);
  // crisp silhouette
  line(buf, P1[0], P1[1], up(P1)[0], up(P1)[1], OUTLINE);
  line(buf, P2[0], P2[1], up(P2)[0], up(P2)[1], OUTLINE);
  line(buf, P3[0], P3[1], up(P3)[0], up(P3)[1], OUTLINE);
  line(buf, P1[0], P1[1], P2[0], P2[1], OUTLINE);
  line(buf, P2[0], P2[1], P3[0], P3[1], OUTLINE);
  return buf;
}

async function main() {
  await mkdir(ASSET_DIR, { recursive: true });
  const sprites = { train_a: drawTrain("a"), train_b: drawTrain("b") };
  for (const [name, buf] of Object.entries(sprites))
    await writeFile(join(ASSET_DIR, `${name}.png`), buf.toPNG());
  console.log(`✓ 2 train sprites → ${ASSET_DIR} (anchor ${ANCHOR.map((v) => v.toFixed(3))})`);

  if (!process.argv.includes("--preview")) return;
  const TW = 128, TH = 64;
  const readBuf = (png) => {
    const b = new Buf(png.width, png.height);
    b.d.set(png.data);
    return b;
  };
  const grass = new Buf(TW, TH);
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++) {
      const cx = (x + 0.5 - TW / 2) / (TW / 2), cy = (y + 0.5 - TH / 2) / (TH / 2);
      const m = Math.abs(cx) + Math.abs(cy);
      if (m <= 1) grass.px(x, y, m > 0.92 ? [0x6f, 0x9c, 0x49] : [0x7f, 0xae, 0x54]);
    }
  const scene = new Buf(TW * 3, CH + TH);
  scene.d.fill(0);
  const cells = [["a", "straight_a", 0], ["b", "straight_b", TW], ["a", "straight_a", TW * 2]];
  for (const [dir, tile, ox] of cells) {
    const gy = CH - TH;
    scene.blit(grass, ox, gy);
    scene.blit(readBuf(PNG.sync.read(readFileSync(join(ASSET_DIR, "track", `${tile}.png`)))), ox, gy);
    scene.blit(sprites[`train_${dir}`], ox, gy + TH / 2 - GC[1]);
  }
  await writeFile("/tmp/train_sprites.png", scene.toPNG());
  console.log("✓ preview → /tmp/train_sprites.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
