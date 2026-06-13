/**
 * Linear schematic view — a clean tube-map / strip-diagram of the network.
 *
 * Reuses the exact same live data as the 3D world (the Zustand store's trains,
 * fed from the /server WebSocket) — only the drawing is different. Lines are
 * straight, stations are ticks, trains are dots that glide along by their line
 * param `t`. Its own rAF loop advances each train like `Train.tsx` (mock trains
 * self-propel + bounce; live trains ease toward the feed `t`) and moves the SVG
 * groups imperatively (no per-frame React render).
 *
 * Pan & zoom: the SVG `viewBox` is the camera — drag to pan, two-finger scroll
 * to pan, pinch (ctrl+wheel) or the on-screen buttons to zoom. Trains live
 * inside the same viewBox so they pan/zoom with the diagram.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { LINES, LINE_BY_ID, STATIONS } from "../data/network";
import { useTrainStore } from "../store/useTrainStore";
import { lineTToEdge } from "../data/trackGraph";
import {
  SCHEMATIC_POS,
  SCHEMATIC_BOUNDS,
  SCHEMATIC_JUNCTIONS,
  SCHEMATIC_STUBS,
  SCHEMATIC_LOOPS,
  lineSegments,
  schematicPos,
} from "./layout";
import { schematicSignals } from "./signals";

const UX = 66; // px per x grid unit
const UY = 58; // px per y grid unit
const PAD = 90; // px margin around the diagram
const W = (SCHEMATIC_BOUNDS.maxX - SCHEMATIC_BOUNDS.minX) * UX + PAD * 2;
const H = (SCHEMATIC_BOUNDS.maxY - SCHEMATIC_BOUNDS.minY) * UY + PAD * 2;

const px = (x: number) => PAD + (x - SCHEMATIC_BOUNDS.minX) * UX;
const py = (y: number) => PAD + (y - SCHEMATIC_BOUNDS.minY) * UY;

const STATION_NAME = new Map(STATIONS.map((s) => [s.code, s.name]));
const HUBS = new Set(["EXD", "NTA"]);

const MIN_W = W * 0.18; // most zoomed-in
const MAX_W = W * 1.5; // most zoomed-out
const RAIL_GAP = 4.5; // px offset of each rail from the centre on double track

type Param = { t: number; dir: 1 | -1 };
type Box = { x: number; y: number; w: number; h: number };

type SigGeom = {
  key: string;
  id: string;
  lineId: string;
  dir: 1 | -1;
  lo: number;
  hi: number;
  double: boolean;
  cx: number;
  cy: number;
  lx: number;
  ly: number;
  anchor: "start" | "middle" | "end";
};

const SIG_OFF = 11; // px offset of a signal from its line, on its rail's side

export function SchematicMap() {
  const trains = useTrainStore((s) => s.trains);
  const selectedId = useTrainStore((s) => s.selectedId);
  const select = useTrainStore((s) => s.select);
  const selectedSignal = useTrainStore((s) => s.selectedSignal);
  const selectSignal = useTrainStore((s) => s.selectSignal);

  const groupRefs = useRef(new Map<string, SVGGElement>());
  const params = useRef(new Map<string, Param>());
  const signalRefs = useRef(new Map<string, SVGCircleElement>());
  const svgRef = useRef<SVGSVGElement>(null);

  // Signal geometry (static): position each real signal just off its rail.
  const signals = useMemo<SigGeom[]>(() => {
    const out: SigGeom[] = [];
    for (const line of LINES) {
      for (const s of schematicSignals(line.id)) {
        const a = schematicPos(s.lineId, s.t);
        const b = schematicPos(s.lineId, s.t + s.dir * 0.004);
        const dx = px(b.x) - px(a.x);
        const dy = py(b.y) - py(a.y);
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len; // perpendicular (flips with travel direction)
        const ny = dx / len;
        const ax = px(a.x);
        const ay = py(a.y);
        out.push({
          key: `${s.lineId}:${s.id}:${s.dir}`,
          id: s.id,
          lineId: s.lineId,
          dir: s.dir,
          lo: s.lo,
          hi: s.hi,
          double: s.double,
          cx: ax + nx * SIG_OFF,
          cy: ay + ny * SIG_OFF,
          lx: ax + nx * (SIG_OFF + 6),
          ly: ay + ny * (SIG_OFF + 6),
          anchor: nx > 0.2 ? "start" : nx < -0.2 ? "end" : "middle",
        });
      }
    }
    return out;
  }, []);
  const sigRef = useRef(signals);
  sigRef.current = signals;

  const [vb, setVb] = useState<Box>({ x: 0, y: 0, w: W, h: H });
  const drag = useRef<{ x: number; y: number; vbx: number; vby: number; s: number } | null>(null);
  const moved = useRef(false);

  // px-per-user-unit for a box (uniform scale under preserveAspectRatio "meet").
  const scaleFor = (b: Box) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return b.w / W;
    return Math.max(b.w / r.width, b.h / r.height);
  };

  const zoomAt = (factor: number, clientX: number, clientY: number) => {
    setVb((b) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return b;
      const s = Math.max(b.w / r.width, b.h / r.height);
      const offX = (r.width - b.w / s) / 2; // letterbox centring offsets
      const offY = (r.height - b.h / s) / 2;
      const fx = b.x + (clientX - r.left - offX) * s; // focal point (user units)
      const fy = b.y + (clientY - r.top - offY) * s;
      const nw = Math.min(MAX_W, Math.max(MIN_W, b.w * factor));
      const ratio = nw / b.w;
      const nh = b.h * ratio;
      return { x: fx - (fx - b.x) * ratio, y: fy - (fy - b.y) * ratio, w: nw, h: nh };
    });
  };

  const zoomCentre = (factor: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, vbx: vb.x, vby: vb.y, s: scaleFor(vb) };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    setVb((b) => ({ ...b, x: d.vbx - dx * d.s, y: d.vby - dy * d.s }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      zoomAt(e.deltaY > 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); // pinch
    } else {
      setVb((b) => {
        const s = scaleFor(b);
        return { ...b, x: b.x + e.deltaX * s, y: b.y + e.deltaY * s }; // two-finger pan
      });
    }
  };

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
          let tx = px(pt.x);
          let ty = py(pt.y);
          // On double track, sit the train on its own rail (up vs down) rather
          // than the centreline — offset perpendicular to travel by direction.
          if (lineTToEdge(tr.lineId, p.t)?.edge.doubleTrack) {
            const ahead = schematicPos(tr.lineId, p.t + 0.004);
            const dx = px(ahead.x) - tx;
            const dy = py(ahead.y) - ty;
            const len = Math.hypot(dx, dy) || 1;
            tx += (-dy / len) * p.dir * RAIL_GAP;
            ty += (dx / len) * p.dir * RAIL_GAP;
          }
          g.setAttribute("transform", `translate(${tx},${ty})`);
        }
      }
      for (const id of params.current.keys()) if (!seen.has(id)) params.current.delete(id);

      // Signal aspects: RED while a train occupies the block ahead.
      const byLine = new Map<string, { t: number; dir: 1 | -1 }[]>();
      for (const tr of live) {
        const p = params.current.get(tr.id);
        if (!p) continue;
        const arr = byLine.get(tr.lineId);
        if (arr) arr.push({ t: p.t, dir: p.dir });
        else byLine.set(tr.lineId, [{ t: p.t, dir: p.dir }]);
      }
      const sel = useTrainStore.getState().selectedSignal;
      for (const sig of sigRef.current) {
        const ts = byLine.get(sig.lineId);
        let occ = false;
        if (ts) {
          for (const tr of ts) {
            if (sig.double && tr.dir !== sig.dir) continue;
            if (tr.t >= sig.lo && tr.t <= sig.hi) {
              occ = true;
              break;
            }
          }
        }
        const el = signalRefs.current.get(sig.key);
        if (el) el.setAttribute("fill", occ ? "#ff3b30" : "#22c55e");
        if (sel && sel.id === sig.id && sel.lineId === sig.lineId) {
          const aspect = occ ? "red" : "green";
          if (useTrainStore.getState().signalAspect !== aspect) {
            useTrainStore.getState().setSignalAspect(aspect);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="schematic-map">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        className={drag.current ? "grabbing" : "grab"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <rect
          x={vb.x}
          y={vb.y}
          width={vb.w}
          height={vb.h}
          fill="transparent"
          onClick={() => {
            if (!moved.current) select(null);
          }}
        />

        {/* Off-diagram stubs (e.g. the main line continuing past Exmouth Jn) */}
        {SCHEMATIC_STUBS.map((stub, i) => {
          const ax = px(stub.from.x);
          const ay = py(stub.from.y);
          const bx = px(stub.to.x);
          const by = py(stub.to.y);
          const dx = bx - ax;
          const dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * RAIL_GAP;
          const ny = (dx / len) * RAIL_GAP;
          return (
            <g key={`stub-${i}`}>
              <line x1={ax + nx} y1={ay + ny} x2={bx + nx} y2={by + ny} stroke="#56678a" strokeWidth={4} strokeLinecap="round" />
              <line x1={ax - nx} y1={ay - ny} x2={bx - nx} y2={by - ny} stroke="#56678a" strokeWidth={4} strokeLinecap="round" />
              <text x={bx} y={by + 15} textAnchor="middle" className="sm-stub-label">↓ {stub.label}</text>
            </g>
          );
        })}

        {/* Route lines — a single line, or twin rails where double track */}
        {LINES.flatMap((line) =>
          lineSegments(line.id).map((seg, i) => {
            const ax = px(seg.a.x);
            const ay = py(seg.a.y);
            const bx = px(seg.b.x);
            const by = py(seg.b.y);
            const key = `${line.id}-${i}`;
            if (!seg.double) {
              return (
                <line
                  key={key}
                  x1={ax}
                  y1={ay}
                  x2={bx}
                  y2={by}
                  stroke={line.color}
                  strokeWidth={6}
                  strokeLinecap="round"
                  opacity={0.92}
                />
              );
            }
            const dx = bx - ax;
            const dy = by - ay;
            const len = Math.hypot(dx, dy) || 1;
            const ox = (-dy / len) * RAIL_GAP;
            const oy = (dx / len) * RAIL_GAP;
            return (
              <g key={key}>
                <line x1={ax + ox} y1={ay + oy} x2={bx + ox} y2={by + oy} stroke={line.color} strokeWidth={4} strokeLinecap="round" opacity={0.92} />
                <line x1={ax - ox} y1={ay - oy} x2={bx - ox} y2={by - oy} stroke={line.color} strokeWidth={4} strokeLinecap="round" opacity={0.92} />
              </g>
            );
          }),
        )}

        {/* Passing loops — a short parallel track beside a station */}
        {SCHEMATIC_LOOPS.map((loop) => {
          const line = LINE_BY_ID.get(loop.lineId);
          const stops = line?.stops ?? [];
          const i = stops.indexOf(loop.at);
          const at = SCHEMATIC_POS[loop.at];
          const prev = SCHEMATIC_POS[stops[i - 1]];
          const next = SCHEMATIC_POS[stops[i + 1]];
          if (!line || !at || !prev || !next) return null;
          const ax = px(at.x);
          const ay = py(at.y);
          let dx = px(next.x) - px(prev.x);
          let dy = py(next.y) - py(prev.y);
          const len = Math.hypot(dx, dy) || 1;
          dx /= len;
          dy /= len;
          const nx = -dy; // perpendicular (loop sits to one side of the line)
          const ny = dx;
          const HALF = 20;
          const OFF = 9;
          const p0x = ax - dx * HALF;
          const p0y = ay - dy * HALF;
          const p1x = ax + dx * HALF;
          const p1y = ay + dy * HALF;
          const pts = `${p0x},${p0y} ${p0x + nx * OFF},${p0y + ny * OFF} ${p1x + nx * OFF},${p1y + ny * OFF} ${p1x},${p1y}`;
          return (
            <polyline
              key={`loop-${loop.lineId}-${loop.at}`}
              points={pts}
              fill="none"
              stroke={line.color}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.92}
            />
          );
        })}

        {/* Junctions (labelled markers) */}
        {SCHEMATIC_JUNCTIONS.map((j) => {
          const cx = px(j.x);
          const cy = py(j.y);
          return (
            <g key={j.id}>
              <rect
                x={cx - 4.5}
                y={cy - 4.5}
                width={9}
                height={9}
                transform={`rotate(45 ${cx} ${cy})`}
                fill="#0b1220"
                stroke="#e8eef7"
                strokeWidth={1.5}
              />
              <text x={cx + 13} y={cy} dominantBaseline="middle" className="sm-jn-label">
                {j.name}
                {j.signal ? ` · ${j.signal}` : ""}
              </text>
            </g>
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

        {/* Signals (colour set imperatively by the animation loop) */}
        {signals.map((sig) => {
          const selS =
            !!selectedSignal && selectedSignal.id === sig.id && selectedSignal.lineId === sig.lineId;
          return (
            <g
              key={sig.key}
              className="sm-signal"
              onClick={(e) => {
                e.stopPropagation();
                if (moved.current) return;
                selectSignal({ id: sig.id, lineId: sig.lineId, direction: sig.dir });
              }}
            >
              {selS && <circle cx={sig.cx} cy={sig.cy} r={8} fill="#ffffff" opacity={0.25} />}
              <circle
                ref={(el) => {
                  if (el) signalRefs.current.set(sig.key, el);
                  else signalRefs.current.delete(sig.key);
                }}
                cx={sig.cx}
                cy={sig.cy}
                r={selS ? 4.6 : 3.4}
                fill="#22c55e"
                stroke="#0b1220"
                strokeWidth={1.2}
              />
              {vb.w < W * 0.55 && (
                <text x={sig.lx} y={sig.ly} textAnchor={sig.anchor} dominantBaseline="middle" className="sm-signal-label">
                  {sig.id}
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
                if (moved.current) return; // it was a pan, not a tap
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

      {/* Movement controls */}
      <div className="schematic-controls">
        <button onClick={() => zoomCentre(1 / 1.3)} title="Zoom in">+</button>
        <button onClick={() => zoomCentre(1.3)} title="Zoom out">−</button>
        <button onClick={() => setVb({ x: 0, y: 0, w: W, h: H })} title="Fit to screen">⤢</button>
      </div>
    </div>
  );
}
