import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

func alert(_ message: String) {
    app.activate(ignoringOtherApps: true)
    let dialog = NSAlert()
    dialog.messageText = message
    dialog.addButton(withTitle: "OK")
    dialog.runModal()
}

let script = Bundle.main.url(forResource: "Start LAN Server", withExtension: "command")!
let check = Process()
check.executableURL = URL(fileURLWithPath: "/bin/bash")
check.arguments = [script.path, "--check"]
do {
    try check.run()
    check.waitUntilExit()
    switch check.terminationStatus {
    case 0:
        let launch = Process()
        launch.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        launch.arguments = ["-a", "Terminal", script.path]
        try launch.run()
        launch.waitUntilExit()
        if launch.terminationStatus != 0 { alert("Unable to open Terminal for Cat Fighter LAN Server") }
    case 10:
        alert("Cat Fighter LAN Server is already running")
    default:
        alert("Port 8767 is in use by another process. Stop that process before starting Cat Fighter LAN Server.")
    }
} catch {
    alert("Unable to start Cat Fighter LAN Server: \(error.localizedDescription)")
}
