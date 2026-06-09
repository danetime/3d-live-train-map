import { create } from "zustand";
import type { Train } from "../data/types";

export type DataSource = "sim" | "live";

type TrainStore = {
  trains: Train[];
  selectedId: string | null;
  /** Whether trains are simulated or coming from the live RTT feed. */
  dataSource: DataSource;
  setDataSource: (source: DataSource) => void;
  /** Replace the full set of trains (called by the feed each tick). */
  setTrains: (trains: Train[]) => void;
  /** Update progress for the animation loop without replacing identities. */
  advance: (updates: { id: string; t: number; direction: 1 | -1; headingTo: string }[]) => void;
  select: (id: string | null) => void;
};

export const useTrainStore = create<TrainStore>((set) => ({
  trains: [],
  selectedId: null,
  dataSource: "sim",
  setDataSource: (dataSource) => set({ dataSource }),
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
  select: (id) => set({ selectedId: id }),
}));
