import { World } from "./scene/World";
import { Hud } from "./ui/Hud";
import { useTrainFeed } from "./sim/useTrainFeed";

export default function App() {
  // Tries the live RTT feed; falls back to simulated trains until credentials
  // are configured (see README → Phase 2).
  useTrainFeed("realtime-trains");

  return (
    <div className="app">
      <World />
      <Hud />
    </div>
  );
}
