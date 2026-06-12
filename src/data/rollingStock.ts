/**
 * Operator names + a best-effort rolling-stock guess for the info panel.
 *
 * IMPORTANT: the open real-time feeds (Network Rail TD, Realtime Trains) tell us
 * the *operating company* but NOT the physical unit class or formation — that
 * data simply isn't in public real-time sources. So everything below the
 * operator is an INFERENCE from the operator, the route and the service pattern
 * on the Exeter corridor. It's an educated guess, not gospel — the panel labels
 * it as "est.". A real unit/formation feed (e.g. Darwin train formations) could
 * replace the guess later.
 */

/** ATOC code → friendly operator name. */
const TOC_NAMES: Record<string, string> = {
  GW: "GWR",
  XC: "CrossCountry",
  SW: "South Western Railway",
  CS: "Caledonian Sleeper",
  GR: "LNER",
};

export function operatorName(code: string | undefined): string {
  if (!code) return "Unknown operator";
  return TOC_NAMES[code.toUpperCase()] ?? code;
}

export type StockGuess = {
  /** Likely unit class(es), e.g. "Class 800/802 IET". */
  unit: string;
  /** Typical formation, e.g. "5 or 9 cars". */
  cars: string;
};

/**
 * Guess the likely rolling stock from operator + line + headcode.
 * Headcode first digit: 1 = express passenger, 2 = stopping passenger.
 */
export function inferStock(t: {
  operator?: string;
  lineId: string;
  headcode: string;
}): StockGuess | null {
  const toc = (t.operator ?? "").toUpperCase();
  const express = t.headcode.startsWith("1");
  const mainLine = t.lineId === "newton-abbot" || t.lineId === "taunton";

  if (toc === "XC") {
    return { unit: "Class 220/221 Voyager", cars: "4–5 cars" };
  }
  if (toc === "GW") {
    // Long-distance main-line expresses are bi-mode IETs; everything else on
    // this patch (branch stoppers, regional) is Sprinter/Turbo DMU.
    if (express && mainLine) {
      return { unit: "Class 800/802 IET", cars: "5 or 9 cars" };
    }
    return { unit: "Class 150/158/166 Sprinter/Turbo", cars: "2–3 cars" };
  }
  if (toc === "SW") {
    return { unit: "Class 158/159", cars: "3 cars" };
  }
  return null;
}
