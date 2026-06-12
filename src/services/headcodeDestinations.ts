/**
 * Headcode → real destination + operator, enriched from Realtime Trains.
 *
 * The Network Rail TD feed only knows a train's headcode and which berth it
 * occupies — never where it's going or who runs it. So we periodically pull the
 * public info for each headcode calling at Exeter from RTT and look it up when
 * building TD trains. If RTT isn't configured the map simply stays empty and
 * callers fall back to the line's terminus, so this is a safe, optional layer.
 */
export type HeadcodeInfo = { dest?: string; toc?: string };

const info = new Map<string, HeadcodeInfo>();

export function setHeadcodeInfo(map: Map<string, HeadcodeInfo>): void {
  info.clear();
  for (const [headcode, v] of map) info.set(headcode, v);
}

export function destinationForHeadcode(headcode: string): string | undefined {
  return info.get(headcode)?.dest;
}

export function operatorForHeadcode(headcode: string): string | undefined {
  return info.get(headcode)?.toc;
}
