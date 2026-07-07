import SwiftUI
import Foundation

/// Draws the linear schematic (lines, double track, stations, Exmouth Junction +
/// Waterloo stub) and places live trains at their current station. Pan with one
/// finger, pinch to zoom — the diagram is redrawn at the zoom level so it stays
/// crisp.
struct SchematicView: View {
    let trains: [Train]

    @State private var zoom: CGFloat = 1
    @State private var startZoom: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var startOffset: CGSize = .zero

    var body: some View {
        Canvas { ctx, size in draw(ctx, size) }
            .background(Color(hex: "0b1220"))
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

        let lineW = max(2.0, scale * 0.06)
        let railGap = max(2.0, scale * 0.085)
        let showLabels = scale > 16

        // Off-diagram stub (the main line continuing past Exmouth Junction)
        for stub in Schematic.stubs {
            let a = P(stub.from.x, stub.from.y), c = P(stub.to.x, stub.to.y)
            let n = perp(a, c, railGap)
            line(ctx, a.shift(n), c.shift(n), Color(hex: "56678a"), lineW)
            line(ctx, a.shift(-n.0, -n.1), c.shift(-n.0, -n.1), Color(hex: "56678a"), lineW)
            if showLabels {
                ctx.draw(Text("↓ " + stub.label)
                    .font(.system(size: max(8, scale * 0.12))).foregroundStyle(Color(hex: "8a97b0")),
                         at: CGPoint(x: c.x, y: c.y + 12), anchor: .top)
            }
        }

        // Route lines (single, or twin rails on double track)
        for ln in Schematic.lines {
            let stops = Array(ln.stops[ln.drawFrom...])
            for i in 0..<(stops.count - 1) {
                guard let a = stationPoint(stops[i]), let c = stationPoint(stops[i + 1]) else { continue }
                if Schematic.isDouble(ln.id, stops[i], stops[i + 1]) {
                    let n = perp(a, c, railGap)
                    line(ctx, a.shift(n), c.shift(n), ln.color, lineW * 0.72)
                    line(ctx, a.shift(-n.0, -n.1), c.shift(-n.0, -n.1), ln.color, lineW * 0.72)
                } else {
                    line(ctx, a, c, ln.color, lineW)
                }
            }
        }

        // Stations
        for (code, g) in Schematic.pos {
            let p = P(g.x, g.y)
            let hub = Schematic.hubs.contains(code)
            let r: CGFloat = hub ? max(4, scale * 0.09) : max(2.5, scale * 0.055)
            let dot = Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r))
            ctx.fill(dot, with: .color(Color(hex: "0b1220")))
            ctx.stroke(dot, with: .color(.white), lineWidth: hub ? 2 : 1.4)
            if showLabels, let nm = Schematic.name[code] {
                let onSpine = g.y == 0
                let fs = max(8, scale * (hub ? 0.16 : 0.13))
                let at = onSpine ? CGPoint(x: p.x, y: p.y - r - 4) : CGPoint(x: p.x + r + 5, y: p.y)
                ctx.draw(Text(nm).font(.system(size: fs, weight: hub ? .bold : .regular))
                    .foregroundStyle(.white.opacity(0.85)),
                         at: at, anchor: onSpine ? .bottom : .leading)
            }
        }

        // Junctions
        for j in Schematic.junctions {
            let p = P(j.p.x, j.p.y)
            let s: CGFloat = max(3, scale * 0.055)
            var dia = Path()
            dia.move(to: CGPoint(x: p.x, y: p.y - s)); dia.addLine(to: CGPoint(x: p.x + s, y: p.y))
            dia.addLine(to: CGPoint(x: p.x, y: p.y + s)); dia.addLine(to: CGPoint(x: p.x - s, y: p.y))
            dia.closeSubpath()
            ctx.fill(dia, with: .color(Color(hex: "0b1220")))
            ctx.stroke(dia, with: .color(.white), lineWidth: 1.4)
            if showLabels {
                ctx.draw(Text("\(j.name) · \(j.signal)")
                    .font(.system(size: max(8, scale * 0.12), weight: .semibold)).foregroundStyle(.white.opacity(0.8)),
                         at: CGPoint(x: p.x + s + 5, y: p.y), anchor: .leading)
            }
        }

        // Trains — at their current station, coloured by line. Trains sharing a
        // station fan out horizontally instead of stacking on one dot (several
        // at Exeter St David's at once is the normal case, not the exception).
        var byStation: [String: [Train]] = [:]
        for t in trains {
            if let st = t.pos?.station { byStation[st, default: []].append(t) }
        }
        let r: CGFloat = max(3.5, scale * 0.07)
        for (st, group) in byStation {
            guard let base = stationPoint(st) else { continue }
            for (i, t) in group.enumerated() {
                let fan = (CGFloat(i) - CGFloat(group.count - 1) / 2) * (r * 2.4)
                let p = CGPoint(x: base.x + fan, y: base.y)
                let dot = Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r))
                ctx.fill(dot, with: .color(Schematic.color(t.pos?.line ?? "")))
                ctx.stroke(dot, with: .color(Color(hex: "0b1220")), lineWidth: 1.5)
                if showLabels {
                    ctx.draw(Text(t.headcode).font(.system(size: max(8, scale * 0.13), weight: .bold))
                        .foregroundStyle(.white),
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
