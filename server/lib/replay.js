/**
 * Synthetic TD feed for when no Network Rail credentials are configured.
 *
 * It emits real-looking CA (berth step) updates for demo trains walking along
 * each line's demo berths, so the full pipeline (parser → berth state → WS →
 * 3D) works end-to-end with nothing to register.
 *
 * IMPORTANT: the demo berth IDs here must match src/data/berths.ts on the
 * client (area "DEMO", prefix + 2-digit index, K berths per line).
 */
const LINES = [
  ["exmouth", "EXM"],
  ["newton-abbot", "NAB"],
  ["paignton", "PAI"],
  ["taunton", "TAU"],
  ["barnstaple", "BNP"],
  ["okehampton", "OKE"],
];
const K = 10;
const STEP_MS = 2500;

const pad = (n) => String(n).padStart(2, "0");
const berth = (prefix, i) => `${prefix}${pad(i + 1)}`;
const headcode = (li, n) => `2${"TFUKB"[li % 5]}${pad(((li * 7 + n * 13) % 80) + 10)}`.slice(0, 4);

export function startReplay(onUpdate) {
  // Two trains per line: one outbound, one inbound.
  const trains = LINES.flatMap(([, prefix], li) => [
    { prefix, i: 1, dir: 1, descr: headcode(li, 0) },
    { prefix, i: K - 2, dir: -1, descr: headcode(li, 1) },
  ]);

  // Place them initially with an interpose into their starting berth.
  for (const t of trains) {
    onUpdate({ type: "CC", area: "DEMO", to: berth(t.prefix, t.i), descr: t.descr, time: Date.now() });
  }

  setInterval(() => {
    for (const t of trains) {
      let next = t.i + t.dir;
      if (next < 0) {
        next = 1;
        t.dir = 1;
      } else if (next > K - 1) {
        next = K - 2;
        t.dir = -1;
      }
      onUpdate({
        type: "CA",
        area: "DEMO",
        from: berth(t.prefix, t.i),
        to: berth(t.prefix, next),
        descr: t.descr,
        time: Date.now(),
      });
      t.i = next;
    }
  }, STEP_MS);
}
