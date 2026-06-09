/**
 * The single entry point for "where do trains come from".
 *
 * - "mock": the simulated trains (always works, no setup).
 * - "realtime-trains": polls the RTT API through the proxy. If it isn't
 *   configured yet (no credentials) or is unreachable, it logs a clear hint and
 *   falls back to the simulation so the world is never empty.
 *
 * Every consumer reads from the store, so the source is invisible downstream.
 */
import { useEffect } from "react";
import { useTrainStore } from "../store/useTrainStore";
import { createMockTrains } from "./mockTrains";
import { fetchLiveTrains } from "../services/realtimeTrains";

export type FeedSource = "mock" | "realtime-trains";

/** How often to re-poll the live feed. */
const POLL_MS = 60_000;

export function useTrainFeed(source: FeedSource = "mock") {
  const setTrains = useTrainStore((s) => s.setTrains);
  const setDataSource = useTrainStore((s) => s.setDataSource);

  useEffect(() => {
    if (source === "mock") {
      setDataSource("sim");
      setTrains(createMockTrains());
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let warnedFallback = false;

    const tick = async () => {
      try {
        const trains = await fetchLiveTrains();
        if (cancelled) return;
        if (trains.length > 0) {
          setDataSource("live");
          setTrains(trains);
        } else if (!warnedFallback) {
          // Connected but nothing mapped (quiet time / window) — keep the sim.
          warnedFallback = true;
          setDataSource("sim");
          setTrains(createMockTrains());
        }
      } catch (err) {
        if (cancelled) return;
        if (!warnedFallback) {
          warnedFallback = true;
          console.warn(
            "[train-map] Live RTT feed unavailable — using simulated trains.\n" +
              "Add RTT credentials (see README → Phase 2) to go live.",
            err,
          );
          setDataSource("sim");
          setTrains(createMockTrains());
        }
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, setTrains, setDataSource]);
}
