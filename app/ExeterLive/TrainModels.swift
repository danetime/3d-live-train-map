import Foundation

/// Real coach count / loading from Darwin (when the server has it configured).
struct Formation: Codable, Hashable {
    var coaches: Int
    var first: Int?
    var loading: Int?
    var src: String?
}

/// Render-ready position the server resolves from the berth (see server/lib/positions.js).
/// Every field the server might omit is optional — a single unexpected train must
/// never fail decoding of the whole frame.
struct Pos: Codable, Hashable {
    var line: String        // e.g. "newton-abbot"
    var station: String?    // CRS, e.g. "EXD" — where the train currently is
    var miles: Double?
    var dir: Int?           // 1 = down (away from Exeter), -1 = up
    var platform: String?
}

/// One train, exactly as the /server WebSocket sends it.
/// `{ headcode, area, berth, updatedAt?, toc?, dest?, formation? }`
struct Train: Codable, Identifiable, Hashable {
    var headcode: String
    var area: String
    var berth: String
    var updatedAt: Double?
    var toc: String?
    var dest: String?
    var formation: Formation?
    var pos: Pos?

    /// Stable identity for SwiftUI (area + headcode, matching the web client).
    var id: String { "\(area):\(headcode)" }
}

/// The once-a-second snapshot frame: `{ type: "trains", trains: [...] }`.
struct TrainsMessage: Codable {
    var type: String
    var trains: [Train]
}
