import SwiftUI
import AppKit

final class ServerController: ObservableObject {
    @Published var nodeRunning = false
    @Published var tunnelRunning = false
    @Published var message = ""

    private let project = "/Users/maccow/isonated project/Cat Fighter"

    var allRunning: Bool {
        nodeRunning && tunnelRunning
    }

    init() {
        refreshStatus()
    }

    private func shell(_ command: String) -> String {
        let process = Process()
        let pipe = Pipe()

        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = ["-lc", command]
        process.standardOutput = pipe
        process.standardError = pipe

        do {
            try process.run()
            process.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8) ?? ""
        } catch {
            return error.localizedDescription
        }
    }

    func refreshStatus() {
        let nodeCheck = shell("""
        PIDFILE="\(project)/logs/catfighter-node.pid"
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo yes
        else
            echo no
        fi
        """)

        let tunnelCheck = shell("""
        PIDFILE="\(project)/logs/catfighter-cloudflared.pid"
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo yes
        else
            echo no
        fi
        """)

        DispatchQueue.main.async {
            self.nodeRunning = nodeCheck.contains("yes")
            self.tunnelRunning = tunnelCheck.contains("yes")
        }
    }

    func start() {
        message = "Starting…"

        DispatchQueue.global(qos: .userInitiated).async {
            _ = self.shell("""
            "\(self.project)/tools/server-app/start-catfighter.sh"
            """)

            Thread.sleep(forTimeInterval: 1.2)

            DispatchQueue.main.async {
                self.refreshStatus()
                self.message = "Server started"
            }
        }
    }

    func stop() {
        message = "Stopping…"

        DispatchQueue.global(qos: .userInitiated).async {
            _ = self.shell("""
            "\(self.project)/tools/server-app/stop-catfighter.sh"
            """)

            Thread.sleep(forTimeInterval: 0.5)

            DispatchQueue.main.async {
                self.refreshStatus()
                self.message = "Server stopped"
            }
        }
    }

    func openGame() {
        if let url = URL(string: "https://catfighter.armedgaltactical.com") {
            NSWorkspace.shared.open(url)
        }
    }

    func openLogs() {
        NSWorkspace.shared.open(
            URL(fileURLWithPath: "\(project)/logs")
        )
    }
}

struct ContentView: View {
    @StateObject private var controller = ServerController()

    let timer = Timer.publish(
        every: 2,
        on: .main,
        in: .common
    ).autoconnect()

    var body: some View {
        VStack(spacing: 22) {

            HStack(spacing: 14) {
                Image(systemName: "airplane")
                    .font(.system(size: 38, weight: .semibold))

                VStack(alignment: .leading, spacing: 3) {
                    Text("Cat Fighter")
                        .font(.system(size: 26, weight: .bold))

                    Text("Multiplayer Server")
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            Divider()

            HStack {
                Circle()
                    .fill(controller.allRunning ? Color.green : Color.red)
                    .frame(width: 12, height: 12)

                Text(controller.allRunning ? "ONLINE" : "OFFLINE")
                    .font(.headline)

                Spacer()

                Button {
                    controller.refreshStatus()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Refresh status")
            }

            VStack(spacing: 10) {
                statusRow(
                    title: "Game Server",
                    subtitle: "127.0.0.1:18767",
                    running: controller.nodeRunning
                )

                statusRow(
                    title: "Cloudflare Tunnel",
                    subtitle: "catfighter.armedgaltactical.com",
                    running: controller.tunnelRunning
                )
            }

            HStack(spacing: 12) {
                Button {
                    controller.start()
                } label: {
                    Label("Start Server", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .controlSize(.large)
                .disabled(controller.allRunning)

                Button {
                    controller.stop()
                } label: {
                    Label("Stop Server", systemImage: "stop.fill")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .controlSize(.large)
                .disabled(!controller.nodeRunning && !controller.tunnelRunning)
            }

            Button {
                controller.openGame()
            } label: {
                Label("Open Cat Fighter", systemImage: "safari")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .controlSize(.large)

            HStack {
                Button("Open Logs") {
                    controller.openLogs()
                }

                Spacer()

                Text(controller.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(24)
        .frame(width: 460)
        .onReceive(timer) { _ in
            controller.refreshStatus()
        }
    }

    private func statusRow(
        title: String,
        subtitle: String,
        running: Bool
    ) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .fontWeight(.medium)

                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: running ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(running ? Color.green : Color.red)
        }
        .padding(12)
        .background(Color.secondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

@main
struct CatFighterServerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
