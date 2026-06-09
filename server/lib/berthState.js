/**
 * Tracks which headcode currently occupies which berth, from the stream of
 * C-class berth-step updates. Keeps two views:
 *   - byBerth:  "area:berth"  → { descr, time }
 *   - byTrain:  "area:descr"  → { berth, time }   (each train's current berth)
 * and expires anything not seen for a while (trains that have left the area).
 */
export class BerthState {
  constructor() {
    this.byBerth = new Map();
    this.byTrain = new Map();
    /** Every distinct "area:berth" ever seen — used by capture mode. */
    this.seenBerths = new Set();
  }

  apply(u) {
    const now = u.time || Date.now();
    const berthKey = (b) => `${u.area}:${b}`;
    const trainKey = (d) => `${u.area}:${d}`;

    if (u.to) this.seenBerths.add(berthKey(u.to));
    if (u.from) this.seenBerths.add(berthKey(u.from));

    if (u.type === "CA") {
      if (u.from) this.byBerth.delete(berthKey(u.from));
      if (u.to && u.descr) {
        this.byBerth.set(berthKey(u.to), { descr: u.descr, time: now });
        this.byTrain.set(trainKey(u.descr), { berth: u.to, time: now });
      }
    } else if (u.type === "CC") {
      if (u.to && u.descr) {
        this.byBerth.set(berthKey(u.to), { descr: u.descr, time: now });
        this.byTrain.set(trainKey(u.descr), { berth: u.to, time: now });
      }
    } else if (u.type === "CB") {
      if (u.from) {
        const cur = this.byBerth.get(berthKey(u.from));
        this.byBerth.delete(berthKey(u.from));
        if (cur) this.byTrain.delete(trainKey(cur.descr));
      }
    }
  }

  expire(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    for (const [k, v] of this.byTrain) if (v.time < cutoff) this.byTrain.delete(k);
    for (const [k, v] of this.byBerth) if (v.time < cutoff) this.byBerth.delete(k);
  }

  /** Current trains: [{ headcode, area, berth, updatedAt }]. */
  trains() {
    const out = [];
    for (const [key, v] of this.byTrain) {
      const sep = key.indexOf(":");
      out.push({
        area: key.slice(0, sep),
        headcode: key.slice(sep + 1),
        berth: v.berth,
        updatedAt: v.time,
      });
    }
    return out;
  }
}
