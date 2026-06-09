import { create } from "zustand";
import type { Train } from "../data/types";

type TrainStore = {
  trains: Train[];
  selectedId: string | null;
  /** Replace the full set of trains (called by the feed each tick). */
  setTrains: (trains: Train[]) => void;
  /** Update progress for the animation loop without replacing identities. */
  advance: (updates: { id: string; t: number; direction: 1 | -1; headingTo: string }[]) => void;
  select: (id: string | null) => void;
};

export const useTrainStore = create<TrainStore>((set) => ({
  trains: [],
  selectedId: null,
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
