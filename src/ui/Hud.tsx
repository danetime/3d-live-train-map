/** 2D overlay: title, line legend, live service list and selected-train panel. */
import { LINES, LINE_BY_ID } from "../data/network";
import { useTrainStore } from "../store/useTrainStore";

export function Hud() {
  const trains = useTrainStore((s) => s.trains);
  const selectedId = useTrainStore((s) => s.selectedId);
  const select = useTrainStore((s) => s.select);
  const dataSource = useTrainStore((s) => s.dataSource);
  const feedCount = useTrainStore((s) => s.feedCount);

  const selectedSignal = useTrainStore((s) => s.selectedSignal);
  const selectSignal = useTrainStore((s) => s.selectSignal);
  const signalAspect = useTrainStore((s) => s.signalAspect);

  const selected = trains.find((t) => t.id === selectedId) ?? null;
  const live = dataSource === "live";
  const signalLine = selectedSignal ? LINE_BY_ID.get(selectedSignal.lineId) : null;

  return (
    <>
      <div className="hud hud-top-left">
        <h1>
          🚆 Exeter Live
          <span className={`badge ${live ? "live" : "sim"}`}>{live ? "LIVE" : "SIM"}</span>
        </h1>
        <p className="subtitle">
          {live
            ? `live feed · ${feedCount} trains running · ${trains.length} placed on the map`
            : "3D train map · simulated data"}
        </p>


        <div className="legend">
          {LINES.map((line) => (
            <div className="legend-row" key={line.id}>
              <span className="swatch" style={{ background: line.color }} />
              <span>{line.name}</span>
              <span className="muted">→ {line.destination}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hud hud-top-right">
        <h2>Services ({trains.length})</h2>
        <ul className="service-list">
          {trains.map((t) => {
            const line = LINE_BY_ID.get(t.lineId)!;
            return (
              <li
                key={t.id}
                className={t.id === selectedId ? "active" : ""}
                onClick={() => select(t.id === selectedId ? null : t.id)}
              >
                <span className="swatch" style={{ background: line.color }} />
                <span className="headcode">{t.headcode}</span>
                <span className="dest">{t.headingTo}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {selected && (
        <div className="hud hud-bottom">
          <div className="panel-head">
            <span
              className="swatch big"
              style={{ background: LINE_BY_ID.get(selected.lineId)!.color }}
            />
            <div>
              <strong>
                {selected.operator} {selected.headcode}
              </strong>
              <div className="muted">{LINE_BY_ID.get(selected.lineId)!.name}</div>
            </div>
            <button className="close" onClick={() => select(null)}>
              ✕
            </button>
          </div>
          <div className="panel-body">
            Heading to <strong>{selected.headingTo}</strong> ·{" "}
            {Math.round(selected.t * 100)}% along the line
            {selected.berth && (
              <>
                {" "}
                · berth <strong>{selected.berth}</strong>
              </>
            )}
            {selected.platform && (
              <>
                {" "}
                · platform <strong>{selected.platform}</strong>
              </>
            )}
          </div>
        </div>
      )}

      {!selected && selectedSignal && signalLine && (
        <div className="hud hud-bottom">
          <div className="panel-head">
            <span
              className={`aspect-dot ${signalAspect === "red" ? "red" : "green"}`}
            />
            <div>
              <strong>Signal {selectedSignal.id}</strong>
              <div className="muted">
                {signalLine.name} · {selectedSignal.direction === 1 ? "Down" : "Up"} (
                {selectedSignal.direction === 1
                  ? `towards ${signalLine.destination}`
                  : "towards Exeter"}
                )
              </div>
            </div>
            <button className="close" onClick={() => selectSignal(null)}>
              ✕
            </button>
          </div>
          <div className="panel-body">
            Showing{" "}
            <strong style={{ color: signalAspect === "red" ? "#e53e3e" : "#22a04a" }}>
              {signalAspect === "red" ? "DANGER (red)" : "CLEAR (green)"}
            </strong>{" "}
            · protects the block ahead
          </div>
        </div>
      )}

      <div className="hint">
        Drag to orbit · two-finger / right-drag to pan · zoom in for detail · tap a train or signal
      </div>
    </>
  );
}
