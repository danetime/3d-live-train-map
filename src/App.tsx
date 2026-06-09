import { World } from "./scene/World";
import { Hud } from "./ui/Hud";
import { useTrainFeed } from "./sim/useTrainFeed";

export default function App() {
  // Phase 2: switch "mock" → "realtime-trains" once credentials are wired up.
  useTrainFeed("mock");

  return (
    <div className="app">
      <World />
      <Hud />
    </div>
  );
}
