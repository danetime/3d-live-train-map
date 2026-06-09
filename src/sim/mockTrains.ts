/**
 * Simulated trains for the day-one demo.
 *
 * Each train is given a line, a starting progress, a direction and a speed, so
 * the scene has something lively to show before the real Realtime Trains feed
 * is wired up (Phase 2). The shape produced here is exactly what the real feed
 * will emit, so the 3D layer never has to know which source it's looking at.
 */
import type { Train } from "../data/types";
import { LINES } from "../data/network";

const OPERATORS: Record<string, string> = {
  exmouth: "GWR",
  "newton-abbot": "GWR",
  taunton: "CrossCountry",
  barnstaple: "GWR",
  okehampton: "GWR",
};

/** A couple of services per line, staggered along the route. */
export function createMockTrains(): Train[] {
  const trains: Train[] = [];
  let n = 10;

  for (const line of LINES) {
    const operator = OPERATORS[line.id] ?? "GWR";
    // Two trains per line: one outbound, one inbound, at different points.
    const setups: { t: number; direction: 1 | -1 }[] = [
      { t: 0.15, direction: 1 },
      { t: 0.7, direction: -1 },
    ];

    for (const { t, direction } of setups) {
      trains.push({
        id: `${line.id}-${direction === 1 ? "out" : "in"}`,
        lineId: line.id,
        headcode: `${n++}`.padStart(2, "0").replace(/^/, "2"),
        operator,
        t,
        direction,
        // Slightly varied speeds so the network feels alive (units of t/sec).
        speed: 0.02 + Math.random() * 0.015,
        headingTo: direction === 1 ? line.destination : "Exeter St David's",
      });
    }
  }

  return trains;
}
