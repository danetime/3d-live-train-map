/**
 * Operator names + a best-effort rolling-stock guess for the info panel.
 *
 * IMPORTANT: no open feed names the physical unit ("802006") — the unit CLASS
 * is always an inference from operator, route and service pattern on the
 * Exeter corridor. What Darwin's push port DOES give us (when the server has
 * the DARWIN_* feed configured) is the real coach count and loading; with a
 * confirmed length the class inference is near-certain and the panel drops
 * the "est." label. Without it everything stays an educated guess.
 */

/** ATOC code → friendly operator name. */
const TOC_NAMES: Record<string, string> = {
  GW: "GWR",
  XC: "CrossCountry",
  SW: "South Western Railway",
  AW: "Transport for Wales",
  CS: "Caledonian Sleeper",
  GR: "LNER",
  ZZ: "Charter / other",
};

export function operatorName(code: string | undefined): string {
  if (!code) return "Unknown operator";
  return TOC_NAMES[code.toUpperCase()] ?? code;
}

export type StockGuess = {
  /** Likely unit class(es), e.g. "Class 800/802 IET". */
  unit: string;
  /** Formation, e.g. "5 or 9 cars" (guess) or "9 cars" (live). */
  cars: string;
  /** True when `cars` is the real Darwin coach count, not an estimate. */
  live?: boolean;
};

/**
 * Guess the likely rolling stock from operator + line + headcode — sharpened
 * by the real Darwin coach count when the train carries one. The class itself
 * is still inferred (no open feed names the unit), but a confirmed length
 * makes it near-certain: a 9-car GWR main-line express can only be an IET,
 * a 5-car CrossCountry can only be a 221, and a 2-car GWR "express" must
 * actually be a Sprinter.
 * Headcode first digit: 1 = express passenger, 2 = stopping passenger.
 */
export function inferStock(t: {
  operator?: string;
  lineId: string;
  headcode: string;
  formation?: { coaches: number };
}): StockGuess | null {
  const toc = (t.operator ?? "").toUpperCase();
  const express = t.headcode.startsWith("1");
  const mainLine = t.lineId === "newton-abbot" || t.lineId === "taunton";
  const n = t.formation?.coaches;
  const liveCars = n != null ? { cars: `${n} cars`, live: true as const } : null;

  if (toc === "XC") {
    if (liveCars) {
      if (n === 4) return { unit: "Class 220 Voyager", ...liveCars };
      if (n === 5) return { unit: "Class 221 Super Voyager", ...liveCars };
      if (n! >= 8) return { unit: "2× Class 220/221 Voyager", ...liveCars };
      return { unit: "Class 220/221 Voyager", ...liveCars };
    }
    return { unit: "Class 220/221 Voyager", cars: "4–5 cars" };
  }
  if (toc === "GW") {
    // Long-distance main-line expresses are bi-mode IETs; everything else on
    // this patch (branch stoppers, regional) is Sprinter/Turbo DMU.
    if (liveCars) {
      if (n === 10) return { unit: "2× Class 800/802 IET", ...liveCars };
      if (n! >= 9) return { unit: "Class 800/802 IET", ...liveCars };
      if (n === 5 && (express || mainLine)) return { unit: "Class 800/802 IET", ...liveCars };
      return { unit: "Class 150/158/166 Sprinter/Turbo", ...liveCars };
    }
    if (express && mainLine) {
      return { unit: "Class 800/802 IET", cars: "5 or 9 cars" };
    }
    return { unit: "Class 150/158/166 Sprinter/Turbo", cars: "2–3 cars" };
  }
  if (toc === "SW") {
    return liveCars
      ? { unit: "Class 158/159", ...liveCars }
      : { unit: "Class 158/159", cars: "3 cars" };
  }
  return null;
}
