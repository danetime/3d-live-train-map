import { create } from "zustand";
import type { Train } from "../data/types";

export type DataSource = "sim" | "live";
/** "dev" = the dark signalling-diagram view (black + wireframe); "land" = the
 *  low-poly landscape. Dev mode is the default and our stable bug-fixing view. */
export type Theme = "dev" | "land";

export type SelectedSignal = {
  /** Signal number, e.g. "E218". */
  id: string;
  lineId: string;
  /** +1 = down (away from Exeter), -1 = up (towards Exeter). */
  direction: 1 | -1;
};

type TrainStore = {
  trains: Train[];
  selectedId: string | null;
  /** Whether trains are simulated or coming from the live RTT feed. */
  dataSource: DataSource;
  setDataSource: (source: DataSource) => void;
  /** Visual style: clean signalling diagram vs low-poly landscape. */
  theme: Theme;
  toggleTheme: () => void;
  /** Replace the full set of trains (called by the feed each tick). */
  setTrains: (trains: Train[]) => void;
  /** Update progress for the animation loop without replacing identities. */
  advance: (updates: { id: string; t: number; direction: 1 | -1; headingTo: string }[]) => void;
  select: (id: string | null) => void;
  /** Currently selected lineside signal (clicking a signal post/lamp). */
  selectedSignal: SelectedSignal | null;
  selectSignal: (sig: SelectedSignal | null) => void;
  /** Live aspect of the selected signal, kept fresh by the Signals layer. */
  signalAspect: "red" | "green" | null;
  setSignalAspect: (aspect: "red" | "green" | null) => void;
  /**
   * Zoom-driven level of detail, set by the camera:
   * 0 = overview (lines + major stations only), 1 = regional (all stations),
   * 2 = local (signals appear), 3 = detail (platform layouts).
   */
  detailLevel: number;
  setDetailLevel: (n: number) => void;
  /** Raw number of trains coming from the live TD feed (before map matching). */
  feedCount: number;
  setFeedCount: (n: number) => void;
};

export const useTrainStore = create<TrainStore>((set) => ({
  trains: [],
  selectedId: null,
  dataSource: "sim",
  setDataSource: (dataSource) => set({ dataSource }),
  theme: "dev",
  toggleTheme: () => set((s) => ({ theme: s.theme === "dev" ? "land" : "dev" })),
  setTrains: (trains) => set({ trains }),
  advance: (updates) =>
    set((state) => {
      const byId = new Map(updates.map((u) => [u.id, u]));
      return {
        trains: state.trains.map((train) => {
          const u = byId.get(train.id);
          return u ? { ...train, t: u.t, direction: u.direction, headingTo: u.headingTo } : train;
        }),
      };
    }),
  select: (id) => set({ selectedId: id, ...(id ? { selectedSignal: null } : {}) }),
  selectedSignal: null,
  selectSignal: (sig) =>
    set({ selectedSignal: sig, signalAspect: null, ...(sig ? { selectedId: null } : {}) }),
  signalAspect: null,
  setSignalAspect: (signalAspect) => set({ signalAspect }),
  detailLevel: 0,
  setDetailLevel: (detailLevel) =>
    set((s) => (s.detailLevel === detailLevel ? s : { detailLevel })),
  feedCount: 0,
  setFeedCount: (feedCount) => set((s) => (s.feedCount === feedCount ? s : { feedCount })),
}));
