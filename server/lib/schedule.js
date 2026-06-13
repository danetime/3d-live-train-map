/**
 * Loads the headcode → operator/destination table built by
 * scripts/buildSchedule.js and resolves the working most likely running now.
 *
 * A headcode can have several workings in a day, so when there's more than one
 * we pick the one whose origin departure is the most recent that's already
 * passed (operator is consistent across them; this mainly sharpens destination).
 *
 * If the table file isn't present (the schedule pass hasn't been run) lookups
 * just return null and the client falls back to the line terminus — so this is
 * a safe, optional enrichment.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const PATH = join(DIR, "..", "data", "headcodeSchedule.generated.json");

function hhmmToMin(s) {
  if (!s || !/^\d{4}$/.test(s)) return null;
  return parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2), 10);
}

export function loadSchedule() {
  let table = {};
  let mtime = 0;
  let uidMap = new Map(); // CIF UID → headcode (for Darwin rid→uid correlation)

  const refresh = () => {
    if (!existsSync(PATH)) {
      if (mtime !== 0) console.warn("[schedule] table file gone — enrichment off");
      table = {};
      uidMap = new Map();
      mtime = 0;
      return;
    }
    const m = statSync(PATH).mtimeMs;
    if (m === mtime) return;
    try {
      table = JSON.parse(readFileSync(PATH, "utf8"));
      mtime = m;
      uidMap = new Map();
      for (const [hc, list] of Object.entries(table)) {
        for (const e of list) {
          if (e.uid) uidMap.set(String(e.uid).trim().toUpperCase(), hc);
        }
      }
      console.log(
        `[schedule] loaded ${Object.keys(table).length} headcodes for enrichment` +
          (uidMap.size ? ` (${uidMap.size} with CIF UIDs)` : " (no UIDs — re-run `npm run schedule` for Darwin correlation)"),
      );
    } catch (e) {
      console.error("[schedule] failed to load table:", e.message);
    }
  };
  refresh();
  // Re-check every 10 min so a fresh `npm run schedule` is picked up live.
  setInterval(refresh, 10 * 60 * 1000).unref?.();

  const lookup = (headcode) => {
    const list = table[headcode];
    if (!list || !list.length) return null;
    if (list.length === 1) return { toc: list[0].toc, dest: list[0].dest };
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let best = list[0];
    let bestScore = -Infinity;
    for (const e of list) {
      const d = hhmmToMin(e.dep);
      // Prefer the most recent departure already passed; future ones rank below.
      const score = d == null ? -1e6 : d <= nowMin ? d : d - 1440;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return { toc: best.toc, dest: best.dest };
  };

  /** Is this headcode in today's on-patch schedule at all? */
  const has = (headcode) => Boolean(table[headcode]?.length);

  /** Headcode for a CIF UID (Darwin's uid attribute), or null. */
  const headcodeForUid = (uid) => uidMap.get(String(uid || "").trim().toUpperCase()) ?? null;

  /** The working TOC for a headcode (consistent across a day's workings). */
  const tocFor = (headcode) => table[headcode]?.[0]?.toc ?? null;

  return { lookup, has, headcodeForUid, tocFor };
}
