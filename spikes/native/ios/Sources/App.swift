import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let c = UISceneConfiguration(name: nil, sessionRole: session.role)
    c.delegateClass = SceneDelegate.self
    return c
  }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    window = UIWindow(windowScene: scene)
    window!.rootViewController = HostController()
    window!.makeKeyAndVisible()
  }
}

/// Hosts the weft root inside the safe area and writes a log the spike scripts read back.
final class HostController: UIViewController {
  private let content = UIView()
  private var renderer: Renderer!
  private var js: JSRuntime!
  private var dev: DevServer?
  private var viewport: [String: Any] = [:]
  private let logURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("weft.log")

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    view.addSubview(content)
    try? Data().write(to: logURL)
    renderer = Renderer(container: content)
    renderer.log = { [weak self] in self?.log($0) }
    js = JSRuntime(onOps: { [weak self] data, ops in
      DispatchQueue.main.async { self?.renderer.apply(data, ops: ops) }
    }, log: { [weak self] line in DispatchQueue.main.async { self?.log(line) } })
    renderer.onEvent = { [weak self] id, event, payload in self?.js.dispatch(id, event, payload) }
    let bundle = try! String(contentsOf: Bundle.main.url(forResource: "app", withExtension: "js")!, encoding: .utf8)
    js.start(bundle: bundle)

    #if DEBUG
    dev = DevServer(log: { [weak self] in self?.log($0) }) { [weak self] req, reply in
      guard let self else { return }
      switch req["cmd"] as? String {
      case "hello": reply(["ok": true, "os": "ios", "device": UIDevice.current.name, "port": Int(self.dev?.port ?? 0)])
      case "viewport": reply(["ok": true, "viewport": self.viewport])
      case "snapshot": reply(["ok": true, "viewport": self.viewport, "root": self.renderer.devSnapshot()])
      case "frames": var f = self.renderer.frames(); f["viewport"] = self.viewport; reply(["ok": true, "frames": f])
      case "tap", "type", "select": self.renderer.devAct(req, done: reply)
      default: reply(["ok": false, "error": "unknown cmd; try hello, viewport, snapshot, frames, tap, type, select"])
      }
    }
    dev?.start()
    #endif

    // Spike hook: dump the laid-out tree for the Node comparison (scripts/compare-layout.mjs).
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [self] in
      let url = logURL.deletingLastPathComponent().appendingPathComponent("frames.json")
      try? renderer.dumpFrames().write(to: url)
      log("frames written")
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let frame = view.bounds.inset(by: view.safeAreaInsets)
    if content.frame != frame {
      content.frame = frame
      renderer.layout()
      // The app picks its form from this (size class, panes); it mounts on the first one. iOS has no hinges.
      viewport = ["w": Double(frame.width), "h": Double(frame.height)]
      js.dispatch(0, "viewport", "{\"w\":\(frame.width),\"h\":\(frame.height)}")
    }
  }

  private func log(_ line: String) {
    print("[weft] \(line)")
    guard let h = try? FileHandle(forWritingTo: logURL) else { return }
    h.seekToEndOfFile()
    h.write(Data("\(Date().timeIntervalSince1970) \(line)\n".utf8))
    try? h.close()
  }
}
