import SwiftUI

struct ContentView: View {
    @StateObject private var feed = TrainFeed()

    var body: some View {
        ZStack(alignment: .top) {
            SchematicView(trains: feed.trains)
                .ignoresSafeArea()
            statusBar
        }
        .onAppear { feed.start() }
        .onDisappear { feed.stop() }
    }

    private var statusBar: some View {
        let placed = feed.trains.filter { $0.pos?.station != nil }.count
        return HStack(spacing: 8) {
            Circle()
                .fill(feed.connected ? Color.green : Color.red)
                .frame(width: 9, height: 9)
            Text(feed.connected
                 ? "Exeter Live · \(feed.trains.count) trains · \(placed) placed"
                 : "Connecting…")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(.black.opacity(0.55), in: Capsule())
        .padding(.top, 8)
    }
}

#Preview {
    ContentView()
}
