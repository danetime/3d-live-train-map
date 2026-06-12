/**
 * The single entry point for "where do trains come from".
 *
 * - "mock":            simulated trains (always works, no setup).
 * - "realtime-trains": polls the RTT timetable API via the Vite proxy.
 * - "network-rail-td": the real berth-level feed, via the /server WebSocket
 *                      bridge. This is the Traksy-style source.
 *
 * Any source that isn't configured/reachable falls back to the simulation once,
 * so the world is never empty. Every consumer reads from the store, so the
 * source is invisible downstream.
 */
import { useEffect } from "react";
import { useTrainStore } from "../store/useTrainStore";
import { createMockTrains } from "./mockTrains";
import { fetchLiveTrains, fetchHeadcodeInfo } from "../services/realtimeTrains";
import { connectTdFeed } from "../services/networkRailTd";
import { setHeadcodeInfo } from "../services/headcodeDestinations";

export type FeedSource = "mock" | "realtime-trains" | "network-rail-td";

/** How often to re-poll the RTT timetable feed. */
const POLL_MS = 60_000;

export function useTrainFeed(source: FeedSource = "mock") {
  const setTrains = useTrainStore((s) => s.setTrains);
  const setDataSource = useTrainStore((s) => s.setDataSource);

  useEffect(() => {
    let cancelled = false;
    let warnedFallback = false;

    const fallbackToSim = (message: string, err?: unknown) => {
      if (cancelled || warnedFallback) return;
      warnedFallback = true;
      console.warn(`[train-map] ${message}`, err ?? "");
      setDataSource("sim");
      setTrains(createMockTrains());
    };

    // --- Simulated trains ---
    if (source === "mock") {
      setDataSource("sim");
      setTrains(createMockTrains());
      return;
    }

    // --- Network Rail TD berth feed (WebSocket bridge) ---
    if (source === "network-rail-td") {
      // The TD feed has headcodes but no destination/operator; enrich from RTT.
      // Silently no-ops if RTT isn't configured (map stays empty → fallback).
      const pollInfo = async () => {
        try {
          setHeadcodeInfo(await fetchHeadcodeInfo());
        } catch {
          /* RTT unavailable — keep the line-terminus fallback */
        }
      };
      pollInfo();
      const destTimer = setInterval(pollInfo, POLL_MS);

      let gotData = false;
      const disconnect = connectTdFeed(
        (trains, rawCount) => {
          if (cancelled) return;
          gotData = true;
          // Connected to the live feed: show LIVE even if no trains map to the
          // network yet (rawCount > 0 means real data is flowing).
          useTrainStore.getState().setFeedCount(rawCount);
          setDataSource(rawCount > 0 ? "live" : "sim");
          setTrains(trains);
        },
        () => {
          if (!gotData) {
            fallbackToSim(
              "TD backend not reachable — using simulated trains.\n" +
                "Start it with: cd server && npm install && npm start",
            );
          }
        },
      );
      return () => {
        cancelled = true;
        clearInterval(destTimer);
        disconnect();
      };
    }

    // --- Realtime Trains timetable API (polling) ---
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const trains = await fetchLiveTrains();
        if (cancelled) return;
        if (trains.length > 0) {
          setDataSource("live");
          setTrains(trains);
        } else {
          fallbackToSim("Live RTT feed returned nothing — using simulated trains.");
        }
      } catch (err) {
        fallbackToSim(
          "Live RTT feed unavailable — using simulated trains.\n" +
            "Add RTT credentials (see README → Phase 2) to go live.",
          err,
        );
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
