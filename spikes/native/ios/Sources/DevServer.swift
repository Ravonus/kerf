import Foundation
import Network

/// Debug-only dev socket for `weft device` (scripts/device.mts): line-delimited JSON over TCP on 127.0.0.1, on the
/// first free port from 9301, so several simulators can run at once. A simulator shares the Mac's loopback, so the
/// CLI connects directly; nothing listens on any other interface.
final class DevServer {
  typealias Handler = (_ request: [String: Any], _ reply: @escaping ([String: Any]) -> Void) -> Void
  private let handle: Handler
  private let log: (String) -> Void
  private var listener: NWListener?
  private let queue = DispatchQueue(label: "weft.dev")
  private(set) var port: UInt16 = 0

  init(log: @escaping (String) -> Void, handle: @escaping Handler) {
    self.log = log
    self.handle = handle
  }

  func start(from first: UInt16 = 9301, last: UInt16 = 9310) {
    guard first <= last, let port = NWEndpoint.Port(rawValue: first) else { log("dev socket: no free port"); return }
    let params = NWParameters.tcp
    params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: port)
    guard let l = try? NWListener(using: params) else { start(from: first + 1, last: last); return }
    l.stateUpdateHandler = { [weak self] state in
      guard let self else { return }
      switch state {
      case .ready: self.port = first; self.log("dev socket 127.0.0.1:\(first)")
      case .failed: l.cancel(); self.start(from: first + 1, last: last) // port taken: try the next
      default: break
      }
    }
    l.newConnectionHandler = { [weak self] c in self?.serve(c) }
    l.start(queue: queue)
    listener = l
  }

  private func serve(_ c: NWConnection) {
    var buffer = Data()
    var pending = 0, ended = false // close only after every request has had its reply
    func closeIfDone() { if ended && pending == 0 { c.cancel() } }
    func read() {
      c.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, done, error in
        guard let self else { return }
        if let data { buffer.append(data) }
        while let nl = buffer.firstIndex(of: 0x0A) {
          let line = buffer[buffer.startIndex..<nl]
          buffer.removeSubrange(buffer.startIndex...nl)
          let req = (try? JSONSerialization.jsonObject(with: line)) as? [String: Any]
          pending += 1
          let send: ([String: Any]) -> Void = { res in
            var out = (try? JSONSerialization.data(withJSONObject: res)) ?? Data(#"{"ok":false,"error":"unencodable reply"}"#.utf8)
            out.append(0x0A)
            c.send(content: out, completion: .contentProcessed { [weak self] _ in self?.queue.async { pending -= 1; closeIfDone() } })
          }
          if let req { DispatchQueue.main.async { self.handle(req, send) } } else { send(["ok": false, "error": "not a JSON object"]) }
        }
        if error != nil { c.cancel() } else if done { ended = true; closeIfDone() } else { read() }
      }
    }
    c.start(queue: queue)
    read()
  }
}
