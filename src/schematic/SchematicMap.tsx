/**
 * Linear schematic view — a clean tube-map / strip-diagram of the network.
 *
 * Reuses the exact same live data as the 3D world (the Zustand store's trains,
 * fed from the /server WebSocket) — only the drawing is different. Lines are
 * straight, stations are ticks, trains are dots that glide along by their line
 * param `t`. Because the 3D `Train` components aren't mounted in this mode,
 * this view runs its own small animation loop that advances each train the same
 * way `Train.tsx` does (self-propelled mock trains bounce at the termini; live
 * trains ease toward the feed's `t`), updating the SVG imperatively so React
 * isn't re-rendering every frame.
 */
import { useEffect, useRef } from "react";
import { LINES, LINE_BY_ID, STATIONS } from "../data/network";
import { useTrainStore } from "../store/useTrainStore";
import {
  SCHEMATIC_POS,
  SCHEMATIC_BOUNDS,
  lineDrawStops,
  schematicPos,
  type Pt,
} from "./layout";

const UX = 66; // px per x grid unit
const UY = 58; // px per y grid unit
const PAD = 90; // px margin around the diagram
const W = (SCHEMATIC_BOUNDS.maxX - SCHEMATIC_BOUNDS.minX) * UX + PAD * 2;
const H = (SCHEMATIC_BOUNDS.maxY - SCHEMATIC_BOUNDS.minY) * UY + PAD * 2;

const px = (x: number) => PAD + (x - SCHEMATIC_BOUNDS.minX) * UX;
const py = (y: number) => PAD + (y - SCHEMATIC_BOUNDS.minY) * UY;

const STATION_NAME = new Map(STATIONS.map((s) => [s.code, s.name]));
const HUBS = new Set(["EXD", "NTA"]);

type Param = { t: number; dir: 1 | -1 };

export function SchematicMap() {
  const trains = useTrainStore((s) => s.trains);
  const selectedId = useTrainStore((s) => s.selectedId);
  const select = useTrainStore((s) => s.select);

  const groupRefs = useRef(new Map<string, SVGGElement>());
  const params = useRef(new Map<string, Param>());

  // Animation loop: advance each train's local param and move its SVG group.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      const live = useTrainStore.getState().trains;
      const seen = new Set<string>();
      for (const tr of live) {
        seen.add(tr.id);
        let p = params.current.get(tr.id);
        if (!p) {
          p = { t: tr.t, dir: tr.direction };
          params.current.set(tr.id, p);
        }
        if (tr.speed > 0) {
          p.t += p.dir * tr.speed * delta;
          if (p.t >= 1) { p.t = 1; p.dir = -1; }
          else if (p.t <= 0) { p.t = 0; p.dir = 1; }
        } else {
          p.t += (tr.t - p.t) * Math.min(delta * 2, 1);
          p.dir = tr.direction;
        }
        const g = groupRefs.current.get(tr.id);
        if (g) {
          const pt = schematicPos(tr.lineId, p.t);
          g.setAttribute("transform", `translate(${px(pt.x)},${py(pt.y)})`);
        }
      }
      for (const id of params.current.keys()) if (!seen.has(id)) params.current.delete(id);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="schematic-map">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="transparent"
          onClick={() => select(null)}
        />

        {/* Route lines */}
        {LINES.map((line) => {
          const pts = lineDrawStops(line.id)
            .map((code) => SCHEMATIC_POS[code])
            .filter((p): p is Pt => !!p)
            .map((p) => `${px(p.x)},${py(p.y)}`)
            .join(" ");
          return (
            <polyline
              key={line.id}
              points={pts}
              fill="none"
              stroke={line.color}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.92}
            />
          );
        })}

        {/* Stations */}
        {Object.entries(SCHEMATIC_POS).map(([code, p]) => {
          const cx = px(p.x);
          const cy = py(p.y);
          const hub = HUBS.has(code);
          const onSpine = p.y === 0;
          const name = STATION_NAME.get(code) ?? code;
          return (
            <g key={code}>
              <circle
                cx={cx}
                cy={cy}
                r={hub ? 7 : 4.5}
                fill="#0b1220"
                stroke="#e8eef7"
                strokeWidth={hub ? 3 : 2}
              />
              {onSpine ? (
                <text
                  x={cx}
                  y={cy - 14}
                  transform={`rotate(-34 ${cx} ${cy - 14})`}
                  textAnchor="start"
                  className={hub ? "sm-label sm-hub" : "sm-label"}
                >
                  {name}
                </text>
              ) : (
                <text
                  x={cx + 13}
                  y={cy}
                  dominantBaseline="middle"
                  textAnchor="start"
                  className={hub ? "sm-label sm-hub" : "sm-label"}
                >
                  {name}
                </text>
              )}
            </g>
          );
        })}

        {/* Trains (positioned imperatively by the animation loop) */}
        {trains.map((t) => {
          const color = LINE_BY_ID.get(t.lineId)?.color ?? "#888";
          const sel = t.id === selectedId;
          return (
            <g
              key={t.id}
              ref={(el) => {
                if (el) groupRefs.current.set(t.id, el);
                else groupRefs.current.delete(t.id);
              }}
              className="sm-train"
              onClick={(e) => {
                e.stopPropagation();
                select(t.id === selectedId ? null : t.id);
              }}
            >
              {sel && <circle r={13} fill={color} opacity={0.25} />}
              <circle r={sel ? 8 : 6} fill={color} stroke="#0b1220" strokeWidth={2} />
              <text x={11} y={-9} className={sel ? "sm-code sm-code-sel" : "sm-code"}>
                {t.headcode}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
