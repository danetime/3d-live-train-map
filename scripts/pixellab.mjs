/**
 * PixelLab asset generator for the iso spike.
 *
 * Usage:
 *   PIXELLAB_API_TOKEN=xxx node scripts/pixellab.mjs                    # balance only
 *   PIXELLAB_API_TOKEN=xxx node scripts/pixellab.mjs --generate        # make every tile
 *   PIXELLAB_API_TOKEN=xxx node scripts/pixellab.mjs --generate train  # only named tile(s)
 *
 * Talks to the PixelLab REST API directly with fetch. We deliberately do *not*
 * use the @pixellab-code/pixellab SDK for generation: its pinned response
 * schema (v1.0.2, the latest published) requires the old usage shape
 * ({type:"usd"}) and rejects the API's current credit-based usage
 * ({type:"generations"}) with a Zod ValidationError — throwing away a perfectly
 * good image. Calling the endpoints ourselves keeps this immune to that drift.
 *
 * The token is read from the environment and never written to disk. Generated
 * PNGs land in src/spike/assets/.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const token = process.env.PIXELLAB_API_TOKEN;
if (!token) {
  console.error("Missing PIXELLAB_API_TOKEN");
  process.exit(1);
}

const BASE = "https://api.pixellab.ai/v1";
const authHeaders = { Authorization: `Bearer ${token}` };
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "src", "spike", "assets");

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.text();
  let json;
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    json = { raw: body };
  }
  if (!res.ok) {
    const detail = json?.detail ?? json?.message ?? body ?? res.statusText;
    throw new Error(
      `HTTP ${res.status} ${path}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    );
  }
  return json;
}

// --- 1) connectivity + auth: balance is free ------------------------------
try {
  const bal = await api("/balance", { method: "GET", headers: authHeaders });
  console.log("✓ reached PixelLab. balance:", JSON.stringify(bal));
} catch (err) {
  console.error("✗ balance check failed:", err?.message || err);
  process.exit(2);
}

if (!process.argv.includes("--generate")) {
  console.log("(balance check only — pass --generate to make tiles)");
  process.exit(0);
}

// --- 2) generate the iso asset set ----------------------------------------
// Each tile defaults to one 64px iso cell; `size` overrides it for bigger
// landmarks (the spike draws cells 64px wide, so width ÷ 64 ≈ tiles across).
const SIZE = { width: 64, height: 64 };
const jobs = [
  { name: "station", description: "small isometric railway station building, pixel art" },
  { name: "train", description: "isometric blue commuter train carriage, pixel art" },
  { name: "tree", description: "isometric green tree, pixel art" },
  {
    name: "exeter_st_davids",
    description:
      "isometric pixel art of a grand Victorian railway station, long pale stone " +
      "frontage with rows of tall arched windows, a central gabled clock tower, a " +
      "glass-and-iron platform canopy and a grey slate roof",
    size: { width: 256, height: 192 }, // ~4 tiles wide
  },
];

// Optionally restrict to named assets (everything after --generate that isn't a
// flag), so we don't re-spend credits regenerating tiles we already have.
const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const toRun = names.length ? jobs.filter((j) => names.includes(j.name)) : jobs;
if (toRun.length === 0) {
  console.error(`no matching assets for: ${names.join(", ")}`);
  console.error(`known: ${jobs.map((j) => j.name).join(", ")}`);
  process.exit(3);
}

await mkdir(outDir, { recursive: true });
for (const job of toRun) {
  const size = job.size ?? SIZE;
  process.stdout.write(`generating ${job.name} (${size.width}×${size.height})... `);
  const data = await api("/generate-image-pixflux", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      description: job.description,
      image_size: size,
      isometric: true,
      no_background: true,
    }),
  });
  const b64 = data?.image?.base64;
  if (!b64) {
    throw new Error(`no image in response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  await writeFile(join(outDir, `${job.name}.png`), Buffer.from(b64, "base64"));
  console.log(`done (usage: ${data?.usage ? JSON.stringify(data.usage) : "?"})`);
}
console.log("✓ assets written to src/spike/assets/");
