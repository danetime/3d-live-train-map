import { World } from "./scene/World";
import { Hud } from "./ui/Hud";
import { useTrainFeed } from "./sim/useTrainFeed";

export default function App() {
  // The real Traksy-style berth feed via the /server bridge. Runs the synthetic
  // demo until the backend is live, and falls back to the simulation if the
  // backend isn't running at all (see README → Phase 3 and server/README.md).
  useTrainFeed("network-rail-td");

  return (
    <div className="app">
      <World />
      <Hud />
    </div>
  );
}
