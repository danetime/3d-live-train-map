/** Renders every active train from the store. */
import { useTrainStore } from "../store/useTrainStore";
import { Train } from "./Train";

export function Trains() {
  const trains = useTrainStore((s) => s.trains);
  return (
    <group>
      {trains.map((train) => (
        <Train key={train.id} train={train} />
      ))}
    </group>
  );
}
