import SwiftUI
import Foundation

/// Draws the linear schematic as a classic light "tube map": bold coloured
/// route lines (twin rails wherever the track is double), crossbar ticks for
/// stations, ringed circles for the interchanges, the Exmouth Junction fork +
/// Waterloo stub, and the Topsham passing loop.
///
/// Live trains sit on their correct rail using UK LEFT-HAND RUNNING: a train is
/// offset to the LEFT of its direction of travel (up trains ride the top rail
/// of the Plymouth–Taunton spine, down trains the bottom — and the same rule
/// flows round the branches). Trains whose direction the feed doesn't know ride
/// the centreline. Up trains at Topsham stand on the passing loop. Trains
/// sharing a station + rail fan out along the track. Pan with one finger,
/// pinch to zoom.
struct SchematicView: View {
    let trains: [Train]

    @State private var zoom: CGFloat = 1
    @State private var startZoom: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var startOffset: CGSize = .zero

    var body: some View {
        Canvas { ctx, size in draw(ctx, size) }
            .background(MapPalette.background)
            .contentShape(Rectangle())
            .gesture(
                SimultaneousGesture(
                    MagnificationGesture()
                        .onChanged { v in zoom = max(0.4, min(6, startZoom * v)) }
                        .onEnded { _ in startZoom = zoom },
                    DragGesture()
                        .onChanged { v in
                            offset = CGSize(width: startOffset.width + v.translation.width,
                                            height: startOffset.height + v.translation.height)
                        }
                        .onEnded { _ in startOffset = offset }
                )
            )
    }

    private func draw(_ ctx: GraphicsContext, _ size: CGSize) {
        let b = Schematic.bounds
        let gw = b.maxX - b.minX, gh = b.maxY - b.minY
        let pad: CGFloat = 24
        let baseScale = min((size.width - 2 * pad) / CGFloat(gw), (size.height - 2 * pad) / CGFloat(gh))
        let scale = baseScale * zoom
        let gcx = b.minX + gw / 2, gcy = b.minY + gh / 2

        // (Two distinct names on purpose — overloading LOCAL functions is a
        // long-standing Swift compiler sore spot; don't merge these.)
        func P(_ x: Double, _ y: Double) -> CGPoint {
            CGPoint(x: size.width / 2 + CGFloat(x - gcx) * scale + offset.width,
                    y: size.height / 2 + CGFloat(y - gcy) * scale + offset.height)
        }
        func stationPoint(_ code: String) -> CGPoint? { Schematic.pos[code].map { P($0.x, $0.y) } }

        /// Left of a travel direction, in screen coordinates (y grows DOWN):
        /// east → north, west → south, south → east. This is what puts a train
        /// on its correct rail under UK left-hand running.
        func leftOf(_ tx: CGFloat, _ ty: CGFloat) -> (CGFloat, CGFloat) { (ty, -tx) }

        let lineW = max(2.5, scale * 0.07)   // single-track stroke
        let railW = lineW * 0.66             // each rail of a double pair
        let railGap = max(2.5, scale * 0.09) // rail offset from the centreline
        let loopOff = railGap * 1.9          // passing-loop bulge offset
        let showLabels = scale > 16

        // Off-diagram stub (the Waterloo main continuing past Exmouth Junction)
        for stub in Schematic.stubs {
            let a = P(stub.from.x, stub.from.y), c = P(stub.to.x, stub.to.y)
            let n = perp(a, c, railGap)
            line(ctx, a.shift(n), c.shift(n), MapPalette.stub, railW)
            line(ctx, a.shift(-n.0, -n.1), c.shift(-n.0, -n.1), MapPalette.stub, railW)
            if showLabels {
                ctx.draw(Text("↓ " + stub.label)
                    .font(.system(size: max(8, scale * 0.12))).foregroundStyle(MapPalette.muted),
                         at: CGPoint(x: c.x, y: c.y + 12), anchor: .top)
            }
        }

        // Route lines: one bold line on single track, twin rails on double
        for ln in Schematic.lines {
            let stops = Array(ln.stops[ln.drawFrom...])
            for i in 0..<(stops.count - 1) {
                guard let a = stationPoint(stops[i]), let c = stationPoint(stops[i + 1]) else { continue }
                if Schematic.isDouble(ln.id, stops[i], stops[i + 1]) {
                    let n = perp(a, c, railGap)
                    line(ctx, a.shift(n), c.shift(n), ln.color, railW)
                    line(ctx, a.shift(-n.0, -n.1), c.shift(-n.0, -n.1), ln.color, railW)
                } else {
                    line(ctx, a, c, ln.color, lineW)
                }
            }
        }

        // Passing loops (Topsham): a short second track bulging out on the
        // up side — the side an up train keeps to under left-hand running.
        for loop in Schematic.loops {
            guard let t = Schematic.travelTangent(line: loop.lineId, at: loop.at),
                  let base = stationPoint(loop.at) else { continue }
            let tx = CGFloat(t.dx), ty = CGFloat(t.dy)
            let off = leftOf(-tx, -ty) // left of UP travel
            let half = max(14, scale * 0.32)
            let p0 = CGPoint(x: base.x - tx * half, y: base.y - ty * half)
            let p1 = CGPoint(x: base.x + tx * half, y: base.y + ty * half)
            var path = Path()
            path.move(to: p0)
            path.addLine(to: CGPoint(x: p0.x + off.0 * loopOff, y: p0.y + off.1 * loopOff))
            path.addLine(to: CGPoint(x: p1.x + off.0 * loopOff, y: p1.y + off.1 * loopOff))
            path.addLine(to: p1)
            ctx.stroke(path, with: .color(Schematic.color(loop.lineId)),
                       style: StrokeStyle(lineWidth: railW, lineCap: .round, lineJoin: .round))
        }

        // Stations: crossbar tick across the track; ringed circle at interchanges
        for (code, g) in Schematic.pos {
            let p = P(g.x, g.y)
            let hub = Schematic.hubs.contains(code)
            if hub {
                let r = max(5, scale * 0.11)
                let ring = Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r))
                ctx.fill(ring, with: .color(.white))
                ctx.stroke(ring, with: .color(MapPalette.ink), lineWidth: max(2.5, scale * 0.035))
            } else {
                let t = Schematic.anyTangent(at: code)
                let n = leftOf(CGFloat(t.dx), CGFloat(t.dy))
                let half = railGap + max(2, scale * 0.03)
                var bar = Path()
                bar.move(to: CGPoint(x: p.x - n.0 * half, y: p.y - n.1 * half))
                bar.addLine(to: CGPoint(x: p.x + n.0 * half, y: p.y + n.1 * half))
                ctx.stroke(bar, with: .color(MapPalette.ink),
                           style: StrokeStyle(lineWidth: max(2, scale * 0.03), lineCap: .round))
            }
            if showLabels, let nm = Schematic.name[code] {
                let onSpine = g.y == 0
                let fs = max(8, scale * (hub ? 0.16 : 0.13))
                let clear = railGap + max(4, scale * 0.06)
                let at = onSpine ? CGPoint(x: p.x, y: p.y - clear - 2) : CGPoint(x: p.x + clear + 3, y: p.y)
                ctx.draw(Text(nm).font(.system(size: fs, weight: hub ? .bold : .regular))
                    .foregroundStyle(MapPalette.ink),
                         at: at, anchor: onSpine ? .bottom : .leading)
            }
        }

        // Junctions (Exmouth Jn · EJ7)
        for j in Schematic.junctions {
            let p = P(j.p.x, j.p.y)
            let s: CGFloat = max(3, scale * 0.055)
            var dia = Path()
            dia.move(to: CGPoint(x: p.x, y: p.y - s)); dia.addLine(to: CGPoint(x: p.x + s, y: p.y))
            dia.addLine(to: CGPoint(x: p.x, y: p.y + s)); dia.addLine(to: CGPoint(x: p.x - s, y: p.y))
            dia.closeSubpath()
            ctx.fill(dia, with: .color(.white))
            ctx.stroke(dia, with: .color(MapPalette.ink), lineWidth: 1.4)
            if showLabels {
                ctx.draw(Text("\(j.name) · \(j.signal)")
                    .font(.system(size: max(8, scale * 0.12), weight: .semibold))
                    .foregroundStyle(MapPalette.muted),
                         at: CGPoint(x: p.x + s + 5, y: p.y), anchor: .leading)
            }
        }

        // Trains — on their correct rail (left-hand running); centreline when
        // the feed doesn't know the direction; up trains at Topsham on the
        // loop. Trains sharing a station+rail fan out ALONG the track.
        let r = max(4, scale * 0.075)
        var groups: [String: [(train: Train, along: (CGFloat, CGFloat), at: CGPoint)]] = [:]
        for t in trains {
            guard let st = t.pos?.station, let base = stationPoint(st) else { continue }
            let lineId = t.pos?.line ?? ""
            let tan = Schematic.travelTangent(line: lineId, at: st) ?? (dx: 1, dy: 0)
            let tx = CGFloat(tan.dx), ty = CGFloat(tan.dy)
            var at = base
            var side = "c"
            if let dir = t.pos?.dir, dir != 0 {
                let vx = tx * CGFloat(dir), vy = ty * CGFloat(dir) // travel vector
                let left = leftOf(vx, vy)
                let onLoop = Schematic.loops.contains { $0.lineId == lineId && $0.at == st }
                if onLoop && dir == -1 {
                    at = CGPoint(x: base.x + left.0 * loopOff, y: base.y + left.1 * loopOff)
                    side = "loop"
                } else if Schematic.isDoubleAt(line: lineId, station: st) {
                    at = CGPoint(x: base.x + left.0 * railGap, y: base.y + left.1 * railGap)
                    side = dir == 1 ? "down" : "up"
                }
            }
            groups["\(st)|\(lineId)|\(side)", default: []].append((t, (tx, ty), at))
        }
        for (_, group) in groups {
            for (i, item) in group.enumerated() {
                let fan = (CGFloat(i) - CGFloat(group.count - 1) / 2) * (r * 2.6)
                let p = CGPoint(x: item.at.x + item.along.0 * fan, y: item.at.y + item.along.1 * fan)
                let dot = Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r))
                ctx.fill(dot, with: .color(Schematic.color(item.train.pos?.line ?? "")))
                ctx.stroke(dot, with: .color(.white), lineWidth: 2)
                if showLabels {
                    ctx.draw(Text(item.train.headcode)
                        .font(.system(size: max(8, scale * 0.13), weight: .bold))
                        .foregroundStyle(MapPalette.ink),
                             at: CGPoint(x: p.x, y: p.y - r - 3), anchor: .bottom)
                }
            }
        }
    }

    private func perp(_ a: CGPoint, _ b: CGPoint, _ gap: CGFloat) -> (CGFloat, CGFloat) {
        let dx = b.x - a.x, dy = b.y - a.y
        let len = max(0.0001, hypot(dx, dy))
        return (-dy / len * gap, dx / len * gap)
    }

    private func line(_ ctx: GraphicsContext, _ a: CGPoint, _ b: CGPoint, _ color: Color, _ w: CGFloat) {
        var path = Path(); path.move(to: a); path.addLine(to: b)
        ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: w, lineCap: .round))
    }
}

private extension CGPoint {
    func shift(_ d: (CGFloat, CGFloat)) -> CGPoint { CGPoint(x: x + d.0, y: y + d.1) }
    func shift(_ dx: CGFloat, _ dy: CGFloat) -> CGPoint { CGPoint(x: x + dx, y: y + dy) }
}
