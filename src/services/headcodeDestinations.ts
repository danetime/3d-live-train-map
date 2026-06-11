/**
 * Headcode → real destination, enriched from Realtime Trains.
 *
 * The Network Rail TD feed only knows a train's headcode and which berth it
 * occupies — never where it's going. So we periodically pull the public
 * destination for each headcode calling at Exeter from RTT and look it up when
 * building TD trains. If RTT isn't configured the map simply stays empty and
 * callers fall back to the line's terminus, so this is a safe, optional layer.
 */
const destinations = new Map<string, string>();

export function setHeadcodeDestinations(map: Map<string, string>): void {
  destinations.clear();
  for (const [headcode, dest] of map) destinations.set(headcode, dest);
}

export function destinationForHeadcode(headcode: string): string | undefined {
  return destinations.get(headcode);
}
