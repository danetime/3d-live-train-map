/**
 * The single entry point for "where do trains come from".
 *
 * Right now it loads the mock trains. In Phase 2 this is where the Realtime
 * Trains client (src/services/realtimeTrains.ts) gets polled and its services
 * mapped into the same `Train` shape, then pushed into the store. Because every
 * consumer reads from the store, swapping the source changes nothing downstream.
 */
import { useEffect } from "react";
import { useTrainStore } from "../store/useTrainStore";
import { createMockTrains } from "./mockTrains";

export type FeedSource = "mock" | "realtime-trains";

export function useTrainFeed(source: FeedSource = "mock") {
  const setTrains = useTrainStore((s) => s.setTrains);

  useEffect(() => {
    if (source === "mock") {
      setTrains(createMockTrains());
      return;
    }

    // Phase 2: poll the Realtime Trains API here and setTrains(mapped).
    // e.g. const stop = startRealtimeTrainsFeed(setTrains); return stop;
    setTrains(createMockTrains());
  }, [source, setTrains]);
}
