import AppKit
import Foundation
import WebKit

@main
@MainActor
final class TerminalOneApp: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private let serviceURL = URL(string: ProcessInfo.processInfo.environment["TERMINALONE_URL"] ?? "http://127.0.0.1:11001")!

    static func main() {
        let app = NSApplication.shared
        let delegate = TerminalOneApp()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: configuration)
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "TerminalOne"
        window.setFrameAutosaveName("TerminalOneMainWindow")
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        ensureBackendAndLoad()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func ensureBackendAndLoad() {
        DispatchQueue.global(qos: .userInitiated).async { [serviceURL, weak self] in
            if !Self.isHealthy(serviceURL) {
                Self.startBackend()
            }
            let deadline = Date().addingTimeInterval(12)
            while Date() < deadline && !Self.isHealthy(serviceURL) {
                Thread.sleep(forTimeInterval: 0.25)
            }
            let healthy = Self.isHealthy(serviceURL)
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                if healthy {
                    self.webView.load(URLRequest(url: serviceURL))
                } else {
                    self.presentStartupError()
                }
            }
        }
    }

    nonisolated private static func isHealthy(_ baseURL: URL) -> Bool {
        let healthURL = baseURL.appendingPathComponent("health")
        var request = URLRequest(url: healthURL)
        request.timeoutInterval = 1
        let semaphore = DispatchSemaphore(value: 0)
        var ok = false
        URLSession.shared.dataTask(with: request) { _, response, _ in
            ok = (response as? HTTPURLResponse)?.statusCode == 200
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 1.5)
        return ok
    }

    nonisolated private static func startBackend() {
        var candidates: [String] = []
        if let configured = ProcessInfo.processInfo.environment["TERMINALONE_T1"] {
            candidates.append(configured)
        }
        if let resource = Bundle.main.path(forResource: "launcher-path", ofType: "txt"),
           let path = try? String(contentsOfFile: resource, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) {
            candidates.append(path)
        }
        candidates += [
            NSString(string: "~/.local/bin/t1").expandingTildeInPath,
            "/usr/local/bin/t1",
            NSString(string: "~/bin/t1").expandingTildeInPath,
        ]
        guard let launcher = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else { return }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: launcher)
        process.arguments = ["--serve-only"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try? process.run()
    }

    private func presentStartupError() {
        let alert = NSAlert()
        alert.messageText = "TerminalOne could not start"
        alert.informativeText = "Run ‘t1 doctor’ in a terminal for the exact cause and repair command."
        alert.alertStyle = .critical
        alert.addButton(withTitle: "OK")
        alert.runModal()
        NSApp.terminate(nil)
    }
}
