import Foundation
import Combine // ObservableObject / @Published live here, not Foundation

/// Where the app finds the /server WebSocket bridge.
/// - iOS Simulator: `ws://127.0.0.1:4001` works (it shares the Mac's network).
/// - Physical iPhone/iPad: change to your Mac's LAN IP, e.g. `ws://192.168.1.23:4001`,
///   and make sure both are on the same Wi-Fi.
enum Config {
    static let feedURL = "ws://127.0.0.1:4001"
}

/// Connects to the server's WebSocket and publishes the live trains.
/// Mirrors the web client: decode `{ type:"trains", trains:[...] }` each second,
/// reconnect on drop.
final class TrainFeed: ObservableObject {
    @Published private(set) var trains: [Train] = []
    @Published private(set) var connected = false

    private var task: URLSessionWebSocketTask?
    private let url: URL
    private var running = false

    init(urlString: String = Config.feedURL) {
        self.url = URL(string: urlString) ?? URL(string: "ws://127.0.0.1:4001")!
    }

    func start() {
        guard !running else { return }
        running = true
        connect()
    }

    func stop() {
        running = false
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        setConnected(false)
    }

    private func connect() {
        let t = URLSession.shared.webSocketTask(with: url)
        task = t
        t.resume()
        // `connected` flips true on the first decoded message, not here — the
        // status pill should report data flowing, not merely an attempt.
        listen()
    }

    private func listen() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let text): self.handle(text)
                case .data(let data): self.handle(String(decoding: data, as: UTF8.self))
                @unknown default: break
                }
                if self.running { self.listen() } // keep listening
            case .failure:
                self.setConnected(false)
                self.scheduleReconnect()
            }
        }
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let msg = try? JSONDecoder().decode(TrainsMessage.self, from: data),
              msg.type == "trains" else { return }
        DispatchQueue.main.async {
            self.connected = true
            self.trains = msg.trains
        }
    }

    private func scheduleReconnect() {
        guard running else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
            guard let self, self.running else { return }
            self.connect()
        }
    }

    private func setConnected(_ value: Bool) {
        DispatchQueue.main.async { self.connected = value }
    }
}
