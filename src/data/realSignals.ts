/**
 * REAL signal numbers, transcribed from the GWR sectional route diagrams.
 *
 * Positioning:
 *  - Down-Main (DM) and Down-Torbay (DT) signals are numbered by their lineside
 *    milepost, measured *via Bristol*. Our line mileages are *via Westbury*
 *    (Exeter St David's = 173m56ch), a constant 20m16ch less from St David's
 *    southwards — so a milepost converts straight to our datum (see `mp`) and
 *    lands at its true position via the same `mileageToT` the berths use.
 *  - Plain panel signals (E-prefix) carry no milepost; we give them an
 *    approximate mileage, or anchor them to a stop + nudge (`near`/`nudge`).
 *
 * `dir`: +1 = Down (away from Exeter), -1 = Up (towards Exeter / London).
 * Direction comes from the diagram's labelling, not the number's parity — real
 * schemes aren't consistent (e.g. E388 is even but an Up signal).
 */
import { lineStopParams, milesChains, mileageToT } from "./lineCurves";
import { LINE_BY_ID } from "./network";

type RealSig = {
  id: string;
  dir: 1 | -1;
  /** True position as decimal miles in our (via-Westbury) datum. */
  at?: number;
  /** Fallback when there's no milepost: anchor to a stop, nudged along t. */
  near?: string;
  nudge?: number;
};

// Milepost (via Bristol) → our via-Westbury datum: a constant 20m16ch less,
// calibrated at Exeter St David's and confirmed at Dawlish (DM206 = Dawlish P1).
const mp = (milepost: number) => milepost - milesChains(20, 16);

const DATA: Record<string, RealSig[]> = {
  // Plymouth main line — DOWN direction, St David's → Newton Abbot.
  // (Up-direction signals are transcribed in a later pass.)
  "newton-abbot": [
    // Exeter St David's platform starters (down end of each platform), fanned
    // slightly along the line since we model two rails, not six platform faces.
    { id: "E160", dir: 1, at: 173.72 }, // P1
    { id: "E260", dir: 1, at: 173.74 }, // P3
    { id: "E60", dir: 1, at: 173.76 }, //  P4
    { id: "E360", dir: 1, at: 173.78 }, // P5
    { id: "E460", dir: 1, at: 173.8 }, //  P6
    { id: "E62", dir: 1, near: "EXT" },
    { id: "DM196", dir: 1, at: mp(196) }, // Marsh Barton
    { id: "DM197", dir: 1, at: mp(197) },
    { id: "DM198", dir: 1, at: mp(198) },
    { id: "DM200", dir: 1, at: mp(200) },
    { id: "DM201", dir: 1, at: mp(201) },
    { id: "DM202", dir: 1, at: mp(202) }, // Starcross
    { id: "DM203A", dir: 1, at: mp(203) },
    { id: "DM203B", dir: 1, at: mp(203) + 0.03 },
    { id: "E68", dir: 1, at: 183.6 },
    { id: "E170", dir: 1, at: 184.15 }, // Dawlish Warren — station / down loop
    { id: "E70", dir: 1, at: 184.35 }, //  Dawlish Warren — main line
    { id: "E72", dir: 1, at: 184.9 },
    { id: "DM206", dir: 1, at: mp(206) }, // Dawlish P1
    { id: "DM207", dir: 1, at: mp(207) },
    { id: "DM208", dir: 1, at: mp(208) },
    { id: "E78", dir: 1, at: 188.25 }, // Teignmouth P1
    { id: "DM209", dir: 1, at: mp(209) },
    { id: "DM210", dir: 1, at: mp(210) },
    { id: "DM211", dir: 1, at: mp(211) },
    { id: "DM212", dir: 1, at: mp(212) },
    { id: "E84", dir: 1, at: 193.4 },
    { id: "E86", dir: 1, at: 193.7 },
    { id: "E88", dir: 1, at: 194.0 }, // Newton Abbot — Down Main
  ],
  // Torbay branch — DOWN direction, Newton Abbot → Paignton (drawn from NTA).
  paignton: [
    { id: "E190", dir: 1, at: 194.2 }, // Aller, branching off
    { id: "DT218R", dir: 1, at: mp(218) - 0.15 }, // distant/repeater for DT218
    { id: "DT218", dir: 1, at: mp(218) }, // Torre
    { id: "DT219", dir: 1, at: mp(219) }, // Torquay
    { id: "DT220", dir: 1, at: mp(220) }, // Paignton approach
    { id: "PN1", dir: 1, at: 200.0 }, //  Paignton platforms
    { id: "PN3", dir: 1, at: 200.02 },
    { id: "PN7", dir: 1, at: 200.04 },
  ],
  // Taunton main line — Cowley Bridge Jn (eyeballed; pending transcription).
  taunton: [
    { id: "E54", near: "EXD", dir: -1, nudge: 0.06 },
    { id: "E56", near: "EXD", dir: -1, nudge: 0.1 },
    { id: "E660", near: "EXD", dir: 1, nudge: 0.05 },
    { id: "E664", near: "EXD", dir: 1, nudge: 0.09 },
    { id: "E256", near: "EXD", dir: 1, nudge: 0.13 },
  ],
  // Avocet line — Exeter Central & Exmouth Jn (eyeballed; pending transcription).
  exmouth: [
    { id: "E731", near: "EXC", dir: 1, nudge: -0.02 },
    { id: "E730", near: "EXC", dir: -1, nudge: -0.02 },
    { id: "E310", near: "EXC", dir: -1, nudge: -0.01 },
    { id: "E732", near: "EXC", dir: 1, nudge: 0.0 },
    { id: "EJ8", near: "POL", dir: 1, nudge: 0.02 },
    { id: "EJ7", near: "POL", dir: 1, nudge: 0.04 },
    { id: "EJ108", near: "POL", dir: -1, nudge: 0.02 },
    { id: "EJ106", near: "POL", dir: 1, nudge: 0.05 },
    { id: "EJ80", near: "DIG", dir: -1, nudge: -0.02 },
  ],
};

/** Real signals for a line as { id, t, dir }, positioned by milepost or anchor. */
export function realSignalsFor(lineId: string): { id: string; t: number; dir: 1 | -1 }[] {
  const list = DATA[lineId];
  const line = LINE_BY_ID.get(lineId);
  if (!list?.length || !line) return [];
  const params = lineStopParams(lineId);
  return list
    .map((s) => {
      let t: number;
      if (s.at != null) {
        t = mileageToT(lineId, s.at);
      } else {
        const idx = s.near ? line.stops.indexOf(s.near) : -1;
        const base = idx >= 0 ? params[idx] : 0;
        t = base + (s.nudge ?? 0);
      }
      return { id: s.id, t, dir: s.dir };
    })
    .filter((s) => s.t > 0.005 && s.t < 0.995);
}
