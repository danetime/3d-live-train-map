import Foundation

/// Real coach count / loading from Darwin (when the server has it configured).
struct Formation: Codable, Hashable {
    var coaches: Int
    var first: Int?
    var loading: Int?
    var src: String?
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

    /// Stable identity for SwiftUI (area + headcode, matching the web client).
    var id: String { "\(area):\(headcode)" }
}

/// The once-a-second snapshot frame: `{ type: "trains", trains: [...] }`.
struct TrainsMessage: Codable {
    var type: String
    var trains: [Train]
}
