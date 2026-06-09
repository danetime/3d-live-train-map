/**
 * Capture helper: periodically writes every berth seen on the live feed (with
 * the most recent headcode) to data/observed-berths.json. Use this to discover
 * the real berth IDs in your area, then map them onto lines in the client's
 * src/data/berths.ts. Enabled with CAPTURE=1.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "observed-berths.json");

export function startCapture(state) {
  console.log(`[td] capture mode ON → ${OUT} (updated every 30s)`);
  setInterval(async () => {
    const rows = [...state.byBerth.entries()]
      .map(([key, v]) => {
        const sep = key.indexOf(":");
        return { area: key.slice(0, sep), berth: key.slice(sep + 1), lastHeadcode: v.descr };
      })
      .sort((a, b) => (a.area + a.berth).localeCompare(b.area + b.berth));
    try {
      await mkdir(dirname(OUT), { recursive: true });
      await writeFile(OUT, JSON.stringify(rows, null, 2));
    } catch (e) {
      console.error("[td] capture write failed:", e.message);
    }
  }, 30_000);
}
