import { World } from "./scene/World";
import { SchematicMap } from "./schematic/SchematicMap";
import { Hud } from "./ui/Hud";
import { useTrainFeed } from "./sim/useTrainFeed";
import { useTrainStore } from "./store/useTrainStore";

export default function App() {
  // The real Traksy-style berth feed via the /server bridge. Runs the synthetic
  // demo until the backend is live, and falls back to the simulation if the
  // backend isn't running at all (see README → Phase 3 and server/README.md).
  useTrainFeed("network-rail-td");

  const viewMode = useTrainStore((s) => s.viewMode);
  const toggleViewMode = useTrainStore((s) => s.toggleViewMode);

  return (
    <div className="app">
      {viewMode === "schematic" ? <SchematicMap /> : <World />}
      <Hud />
      <button className="view-switch" onClick={toggleViewMode} title="Switch view">
        {viewMode === "schematic" ? "🚆 3D View" : "📊 Linear View"}
      </button>
    </div>
  );
}
