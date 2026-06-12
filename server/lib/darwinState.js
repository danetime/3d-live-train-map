/**
 * Darwin push-port state: real train formations (coach count, first/standard
 * split) and live per-coach loading, correlated to the TD feed's headcodes.
 *
 * Darwin keys everything by RID (one running of one service, e.g.
 * "202606127126543"), not by headcode, so correlation is two-step:
 *   - `schedule` messages carry rid + trainId (the headcode) + uid directly;
 *   - `TS` (forecast) messages flow constantly for every active train and carry
 *     rid + uid — and our CIF table (headcodeSchedule.generated.json) now keeps
 *     the CIF UID per working, so uid → headcode also works. This matters when
 *     the bridge starts mid-day and the service's schedule message is long gone.
 *
 * Darwin is an all-UK feed and headcodes repeat across regions, so a headcode
 * can match several RIDs; `lookup()` scores candidates (today's date, TOC
 * matching the CIF working, having formation data) and picks the best.
 *
 * The RDM JSON is machine-converted from the Pport XML and the exact shape
 * (attribute prefixes, single-vs-array elements) isn't formally documented, so
 * all extraction goes through tolerant helpers (`attr`/`textOf`/`collectDeep`)
 * that accept the common XML→JSON conventions.
 *
 * Formations/loading received before a restart would be lost (Darwin only
 * re-sends on change), so state is checkpointed to data/darwinState.generated.json
 * once a minute and reloaded on boot.
 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(DIR, "..", "data", "darwinState.generated.json");

/** Loading older than this is from too many stops ago to show. */
const LOADING_FRESH_MS = 90 * 60 * 1000;
/** Records untouched for this long (or dated before yesterday) are pruned. */
const RECORD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const str = (x) => (x == null ? "" : String(x).trim());

/** Read an XML attribute off a converted-JSON node, whatever the convention. */
function attr(node, name) {
  if (node == null || typeof node !== "object") return undefined;
  for (const key of [name, "@" + name, "@_" + name]) {
    if (node[key] != null && typeof node[key] !== "object") return node[key];
  }
  for (const bag of [node.$, node.attributes]) {
    if (bag && typeof bag === "object" && bag[name] != null) return bag[name];
  }
  return undefined;
}

/** Text content of an element node (e.g. <loading ...>45</loading>). */
function textOf(node) {
  if (node == null) return undefined;
  if (typeof node === "string" || typeof node === "number") return node;
  for (const key of ["#text", "$t", "_", "_text", "value", "$"]) {
    const v = node[key];
    if (typeof v === "string" || typeof v === "number") return v;
  }
  return undefined;
}

/** Every value stored under a key named `name`, anywhere in the tree. */
function collectDeep(obj, name, out = [], depth = 0) {
  if (obj == null || typeof obj !== "object" || depth > 8) return out;
  if (Array.isArray(obj)) {
    for (const v of obj) collectDeep(v, name, out, depth + 1);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === name) for (const item of asArray(v)) out.push(item);
    else collectDeep(v, name, out, depth + 1);
  }
  return out;
}

const localIsoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export class DarwinState {
  /** @param schedule the loadSchedule() API — used for uid→headcode + TOC checks. */
  constructor(schedule) {
    this.schedule = schedule;
    this.rids = new Map(); // rid → record
    this.byHeadcode = new Map(); // headcode → Set<rid>
    this.dirty = false;
    this.stats = {
      messages: 0,
      schedules: 0,
      ts: 0,
      formations: 0,
      loading: 0,
      deactivated: 0,
      undecodable: 0,
    };
  }

  recFor(rid) {
    let rec = this.rids.get(rid);
    if (!rec) {
      rec = { rid, uid: "", ssd: "", headcode: "", toc: "", formations: {}, activeFid: "", loading: null, loadingAt: 0, loadingTpl: "", updatedAt: 0 };
      this.rids.set(rid, rec);
    }
    return rec;
  }

  indexHeadcode(rec) {
    if (!rec.headcode) return;
    let set = this.byHeadcode.get(rec.headcode);
    if (!set) this.byHeadcode.set(rec.headcode, (set = new Set()));
    set.add(rec.rid);
  }

  unindex(rec) {
    const set = this.byHeadcode.get(rec.headcode);
    if (set) {
      set.delete(rec.rid);
      if (!set.size) this.byHeadcode.delete(rec.headcode);
    }
  }

  touch(rec) {
    rec.updatedAt = Date.now();
    // Late uid→headcode resolution: the CIF table may load/refresh after the
    // record was first seen.
    if (!rec.headcode && rec.uid) {
      const hc = this.schedule.headcodeForUid?.(rec.uid);
      if (hc) rec.headcode = hc;
    }
    this.indexHeadcode(rec);
    this.dirty = true;
  }

  /** Feed one decoded Darwin message (the inner Pport JSON object). */
  apply(msg) {
    this.stats.messages++;
    for (const node of collectDeep(msg, "schedule")) this.applySchedule(node);
    for (const node of collectDeep(msg, "TS")) this.applyTs(node);
    for (const node of collectDeep(msg, "scheduleFormations")) this.applyFormations(node);
    for (const node of collectDeep(msg, "formationLoading")) this.applyLoading(node);
    for (const node of collectDeep(msg, "deactivated")) this.applyDeactivated(node);
  }

  applySchedule(node) {
    const rid = str(attr(node, "rid"));
    if (!rid) return;
    this.stats.schedules++;
    const rec = this.recFor(rid);
    rec.uid = str(attr(node, "uid")).toUpperCase() || rec.uid;
    rec.ssd = str(attr(node, "ssd")) || rec.ssd;
    rec.toc = str(attr(node, "toc")).toUpperCase() || rec.toc;
    const trainId = str(attr(node, "trainId"));
    if (trainId && trainId !== rec.headcode) {
      this.unindex(rec);
      rec.headcode = trainId;
    }
    this.touch(rec);
  }

  applyTs(node) {
    const rid = str(attr(node, "rid"));
    if (!rid) return;
    this.stats.ts++;
    const rec = this.recFor(rid);
    rec.uid = str(attr(node, "uid")).toUpperCase() || rec.uid;
    rec.ssd = str(attr(node, "ssd")) || rec.ssd;
    this.touch(rec);
  }

  applyFormations(node) {
    const rid = str(attr(node, "rid"));
    if (!rid) return;
    this.stats.formations++;
    const rec = this.recFor(rid);
    for (const f of collectDeep(node, "formation")) {
      const fid = str(attr(f, "fid")) || "f0";
      const coaches = [];
      for (const c of collectDeep(f, "coach")) {
        coaches.push({
          n: str(attr(c, "coachNumber")) || String(coaches.length + 1),
          cls: str(attr(c, "coachClass")),
        });
      }
      if (coaches.length) {
        rec.formations[fid] = coaches;
        rec.activeFid = fid; // newest formation wins until loading says otherwise
      }
    }
    this.touch(rec);
  }

  applyLoading(node) {
    const rid = str(attr(node, "rid"));
    if (!rid) return;
    this.stats.loading++;
    const rec = this.recFor(rid);
    const fid = str(attr(node, "fid"));
    if (fid) rec.activeFid = fid; // loading reports the formation actually running
    const loading = {};
    for (const l of collectDeep(node, "loading")) {
      const coach = str(attr(l, "coachNumber"));
      let v = textOf(l);
      if (v == null) v = attr(l, "loadingValue") ?? attr(l, "loadingPercentage") ?? attr(l, "loading");
      const pct = Number(v);
      if (coach && Number.isFinite(pct)) loading[coach] = pct;
    }
    if (Object.keys(loading).length) {
      rec.loading = loading;
      rec.loadingAt = Date.now();
      rec.loadingTpl = str(attr(node, "tpl"));
    }
    this.touch(rec);
  }

  applyDeactivated(node) {
    const rid = str(attr(node, "rid"));
    const rec = rid && this.rids.get(rid);
    if (!rec) return;
    this.stats.deactivated++;
    this.unindex(rec);
    this.rids.delete(rid);
    this.dirty = true;
  }

  /**
   * Formation summary for a headcode, or null. Shape (sent to the browser):
   *   { coaches, first?, loading?, src: "darwin" }
   */
  lookup(headcode) {
    const set = this.byHeadcode.get(headcode);
    if (!set || !set.size) return null;
    const today = localIsoDate();
    const cifToc = this.schedule.tocFor?.(headcode) || "";
    let best = null;
    let bestScore = -Infinity;
    for (const rid of set) {
      const rec = this.rids.get(rid);
      if (!rec) continue;
      const hasData = Object.keys(rec.formations).length > 0 || rec.loading != null;
      const score =
        (rec.ssd === today ? 4 : 0) +
        (cifToc && rec.toc && rec.toc === cifToc ? 2 : 0) +
        (hasData ? 1 : 0) +
        rec.updatedAt / 1e15; // tie-break: most recently updated
      if (score > bestScore) {
        bestScore = score;
        best = rec;
      }
    }
    if (!best) return null;

    const coachesList =
      best.formations[best.activeFid] ?? Object.values(best.formations)[0] ?? null;
    const loadingFresh = best.loading && Date.now() - best.loadingAt < LOADING_FRESH_MS;
    // Even without a formation message, a loading report names every coach.
    let coaches = coachesList?.length ?? (loadingFresh ? Object.keys(best.loading).length : 0);
    if (!coaches) return null;

    const out = { coaches, src: "darwin" };
    if (coachesList) {
      const first = coachesList.filter((c) => /first|comp/i.test(c.cls)).length;
      if (first) out.first = first;
    }
    if (loadingFresh) {
      const vals = Object.values(best.loading);
      out.loading = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    return out;
  }

  /** One-line stats for the heartbeat log. */
  summary() {
    const s = this.stats;
    let withFormation = 0;
    let withLoading = 0;
    let onPatch = 0;
    for (const [hc, set] of this.byHeadcode) {
      if (this.schedule.has?.(hc)) onPatch++;
      let hasFormation = false;
      let hasLoading = false;
      for (const rid of set) {
        const rec = this.rids.get(rid);
        if (!rec) continue;
        if (Object.keys(rec.formations).length) hasFormation = true;
        if (rec.loading) hasLoading = true;
      }
      if (hasFormation) withFormation++;
      if (hasLoading) withLoading++;
    }
    return (
      `msgs ${s.messages} (sched ${s.schedules} · TS ${s.ts} · formations ${s.formations} · ` +
      `loading ${s.loading} · undecodable ${s.undecodable}) · rids ${this.rids.size} · ` +
      `headcodes ${this.byHeadcode.size} (${onPatch} on-patch) · formation ${withFormation} · loading ${withLoading}`
    );
  }

  prune() {
    const now = Date.now();
    const yesterday = localIsoDate(new Date(now - 24 * 60 * 60 * 1000));
    for (const [rid, rec] of this.rids) {
      const tooOld = now - rec.updatedAt > RECORD_MAX_AGE_MS;
      const datedPast = rec.ssd && rec.ssd < yesterday;
      if (tooOld || datedPast) {
        this.unindex(rec);
        this.rids.delete(rid);
        this.dirty = true;
      }
    }
  }

  /** Checkpoint records that carry formation/loading (the bits Darwin won't re-send). */
  save() {
    if (!this.dirty) return;
    this.dirty = false;
    const keep = [];
    for (const rec of this.rids.values()) {
      if (Object.keys(rec.formations).length || rec.loading) keep.push(rec);
    }
    try {
      mkdirSync(dirname(STATE_PATH), { recursive: true });
      const tmp = STATE_PATH + ".tmp";
      writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), records: keep }));
      renameSync(tmp, STATE_PATH);
    } catch (e) {
      console.error("[darwin] state save failed:", e.message);
    }
  }

  loadFromDisk() {
    if (!existsSync(STATE_PATH)) return;
    try {
      const { records } = JSON.parse(readFileSync(STATE_PATH, "utf8"));
      for (const rec of records || []) {
        if (!rec?.rid) continue;
        this.rids.set(rec.rid, rec);
        this.indexHeadcode(rec);
      }
      this.prune();
      this.dirty = false;
      console.log(`[darwin] restored ${this.rids.size} formation records from disk`);
    } catch (e) {
      console.error("[darwin] state load failed (starting fresh):", e.message);
    }
  }

  startTimers() {
    setInterval(() => this.save(), 60 * 1000).unref?.();
    setInterval(() => this.prune(), 10 * 60 * 1000).unref?.();
  }
}
