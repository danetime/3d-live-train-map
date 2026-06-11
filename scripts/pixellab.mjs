/**
 * PixelLab asset generator for the iso spike.
 *
 * Usage:
 *   PIXELLAB_API_TOKEN=xxx node scripts/pixellab.mjs            # balance only
 *   PIXELLAB_API_TOKEN=xxx node scripts/pixellab.mjs --generate # make tiles
 *
 * The token is read from the environment and never written to disk. Generated
 * PNGs land in src/spike/assets/.
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { PixelLabClient } = await import("@pixellab-code/pixellab");

const token = process.env.PIXELLAB_API_TOKEN;
if (!token) {
  console.error("Missing PIXELLAB_API_TOKEN");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "src", "spike", "assets");

const client = new PixelLabClient(token);

// --- 1) connectivity + auth: balance is free ------------------------------
try {
  const bal = await client.getBalance();
  console.log("✓ reached PixelLab. balance:", JSON.stringify(bal));
} catch (err) {
  console.error("✗ balance check failed:", err?.message || err);
  process.exit(2);
}

if (!process.argv.includes("--generate")) {
  console.log("(balance check only — pass --generate to make tiles)");
  process.exit(0);
}

// --- 2) generate a small iso asset set ------------------------------------
const SIZE = { width: 64, height: 64 };
const jobs = [
  { name: "station", description: "small isometric railway station building, pixel art" },
  { name: "train", description: "isometric blue commuter train carriage, pixel art" },
  { name: "tree", description: "isometric green tree, pixel art" },
];

await mkdir(outDir, { recursive: true });
for (const job of jobs) {
  process.stdout.write(`generating ${job.name}... `);
  const res = await client.generateImagePixflux({
    description: job.description,
    imageSize: SIZE,
    isometric: true,
    noBackground: true,
  });
  await res.image.saveToFile(join(outDir, `${job.name}.png`));
  console.log(`done ($${res.usage?.usd ?? "?"})`);
}
console.log("✓ assets written to src/spike/assets/");
