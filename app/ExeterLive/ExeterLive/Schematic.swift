import SwiftUI

/// A point in the abstract schematic grid (x → right/east, y → down).
struct GridPoint: Hashable { let x: Double; let y: Double }

/// Static linear-schematic layout, ported from the web app's src/schematic/layout.ts.
/// Plymouth is on the left (west), Taunton on the right (east); the Paignton and
/// Exmouth branches drop from Newton Abbot and St David's, with the Exmouth branch
/// peeling south-west at Exmouth Junction.
enum Schematic {
    struct LineDef { let id: String; let color: Color; let stops: [String]; let drawFrom: Int }

    static let pos: [String: GridPoint] = [
        // Main-line spine (Plymouth west → Taunton east)
        "PLY": .init(x: 0, y: 0), "IVY": .init(x: 1.2, y: 0), "TOT": .init(x: 2.2, y: 0),
        "NTA": .init(x: 3.4, y: 0), "TGM": .init(x: 5.0, y: 0), "DWL": .init(x: 5.9, y: 0),
        "DWW": .init(x: 6.7, y: 0), "SCS": .init(x: 7.5, y: 0), "MRB": .init(x: 8.5, y: 0),
        "EXT": .init(x: 9.2, y: 0), "EXD": .init(x: 10.4, y: 0), "TVP": .init(x: 12.3, y: 0),
        "TAU": .init(x: 13.8, y: 0),
        // Paignton (Riviera) branch — drops from Newton Abbot
        "TRR": .init(x: 3.4, y: 1.3), "TQY": .init(x: 3.4, y: 2.1), "PGN": .init(x: 3.4, y: 2.9),
        // Exmouth (Avocet) branch — straight south to the junction, then SW
        "EXC": .init(x: 10.4, y: 1.3), "SJP": .init(x: 10.4, y: 2.1), "POL": .init(x: 9.7, y: 2.9),
        "DIG": .init(x: 9.2, y: 3.7), "NCO": .init(x: 8.7, y: 4.5), "TOP": .init(x: 8.2, y: 5.3),
        "EXN": .init(x: 7.7, y: 6.1), "LYC": .init(x: 7.3, y: 6.8), "LYM": .init(x: 6.9, y: 7.4),
        "EXM": .init(x: 6.5, y: 8.1),
    ]

    static let name: [String: String] = [
        "PLY": "Plymouth", "IVY": "Ivybridge", "TOT": "Totnes", "NTA": "Newton Abbot",
        "TGM": "Teignmouth", "DWL": "Dawlish", "DWW": "Dawlish Warren", "SCS": "Starcross",
        "MRB": "Marsh Barton", "EXT": "Exeter St Thomas", "EXD": "Exeter St David's",
        "TVP": "Tiverton Parkway", "TAU": "Taunton", "TRR": "Torre", "TQY": "Torquay",
        "PGN": "Paignton", "EXC": "Exeter Central", "SJP": "St James Park", "POL": "Polsloe Bridge",
        "DIG": "Digby & Sowton", "NCO": "Newcourt", "TOP": "Topsham", "EXN": "Exton",
        "LYC": "Lympstone Commando", "LYM": "Lympstone Village", "EXM": "Exmouth",
    ]

    static let lines: [LineDef] = [
        .init(id: "newton-abbot", color: Color(hex: "3182ce"),
              stops: ["EXD", "EXT", "MRB", "SCS", "DWW", "DWL", "TGM", "NTA", "TOT", "IVY", "PLY"], drawFrom: 0),
        .init(id: "taunton", color: Color(hex: "3182ce"),
              stops: ["EXD", "TVP", "TAU"], drawFrom: 0),
        .init(id: "paignton", color: Color(hex: "14b8a6"),
              stops: ["EXD", "EXT", "MRB", "SCS", "DWW", "DWL", "TGM", "NTA", "TRR", "TQY", "PGN"], drawFrom: 7),
        .init(id: "exmouth", color: Color(hex: "e53e3e"),
              stops: ["EXD", "EXC", "SJP", "POL", "DIG", "NCO", "TOP", "EXN", "LYC", "LYM", "EXM"], drawFrom: 0),
    ]

    /// Whole-line double track (main line) plus specific double-track edges.
    static let doubleLines: Set<String> = ["newton-abbot", "taunton"]
    static let doubleEdges: Set<String> = [
        "exmouth:EXD-EXC", "exmouth:EXC-SJP",
        "paignton:NTA-TRR", "paignton:TRR-TQY", "paignton:TQY-PGN",
    ]

    static let junctions: [(name: String, p: GridPoint, signal: String)] = [
        ("Exmouth Jn", .init(x: 10.4, y: 2.55), "EJ7"),
    ]
    static let stubs: [(from: GridPoint, to: GridPoint, label: String)] = [
        (.init(x: 10.4, y: 2.1), .init(x: 10.4, y: 3.8), "Salisbury / London Waterloo"),
    ]

    static let hubs: Set<String> = ["EXD", "NTA"]

    /// Passing loops: a short second track beside one station on a single line
    /// (up/down trains cross there). Drawn as a bulge; up trains stand on it.
    static let loops: [(lineId: String, at: String)] = [("exmouth", "TOP")]

    static func color(_ lineId: String) -> Color {
        lines.first { $0.id == lineId }?.color ?? .gray
    }

    static func isDouble(_ lineId: String, _ a: String, _ b: String) -> Bool {
        doubleLines.contains(lineId) || doubleEdges.contains("\(lineId):\(a)-\(b)")
    }

    /// Is the track double AT a station (either adjacent segment double)?
    static func isDoubleAt(line lineId: String, station code: String) -> Bool {
        if doubleLines.contains(lineId) { return true }
        guard let def = lines.first(where: { $0.id == lineId }),
              let i = def.stops.firstIndex(of: code) else { return false }
        let before = i > 0 && isDouble(lineId, def.stops[i - 1], def.stops[i])
        let after = i < def.stops.count - 1 && isDouble(lineId, def.stops[i], def.stops[i + 1])
        return before || after
    }

    /// Unit vector (grid space) of dir = +1 travel — stops order, Exeter
    /// outwards — at a station on a line. Nil if the station isn't on the line.
    static func travelTangent(line lineId: String, at code: String) -> (dx: Double, dy: Double)? {
        guard let def = lines.first(where: { $0.id == lineId }),
              let i = def.stops.firstIndex(of: code) else { return nil }
        let aCode = def.stops[max(i - 1, 0)]
        let bCode = def.stops[min(i + 1, def.stops.count - 1)]
        guard aCode != bCode, let a = pos[aCode], let b = pos[bCode] else { return nil }
        let dx = b.x - a.x, dy = b.y - a.y
        let len = (dx * dx + dy * dy).squareRoot()
        guard len > 0 else { return nil }
        return (dx / len, dy / len)
    }

    /// Local track direction at a station, from whichever line serves it —
    /// used to angle the station crossbar tick.
    static func anyTangent(at code: String) -> (dx: Double, dy: Double) {
        for ln in lines {
            if let t = travelTangent(line: ln.id, at: code) { return t }
        }
        return (1, 0)
    }

    static let bounds: (minX: Double, maxX: Double, minY: Double, maxY: Double) = {
        let xs = pos.values.map(\.x), ys = pos.values.map(\.y)
        return (xs.min() ?? 0, xs.max() ?? 1, ys.min() ?? 0, ys.max() ?? 1)
    }()
}

/// Classic light tube-map palette (black-on-white, printed-map style).
enum MapPalette {
    static let background = Color(hex: "FBFAF6") // warm paper white
    static let ink = Color(hex: "1C1C1E")        // station marks + labels
    static let muted = Color(hex: "6E6E73")      // secondary labels
    static let stub = Color(hex: "9A9FA8")       // off-map continuation lines
}

extension Color {
    init(hex: String) {
        var h = hex
        if h.hasPrefix("#") { h.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: h).scanHexInt64(&v)
        self.init(
            red: Double((v >> 16) & 0xff) / 255,
            green: Double((v >> 8) & 0xff) / 255,
            blue: Double(v & 0xff) / 255
        )
    }
}
