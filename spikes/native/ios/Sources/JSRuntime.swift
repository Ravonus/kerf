import Foundation
import JavaScriptCore

/// Runs the app bundle on its own serial queue (the JS thread). Op batches go to the main thread; user events
/// come back here. JavaScriptCore drains microtasks when each call into the context returns.
final class JSRuntime {
  let queue = DispatchQueue(label: "weft.js")
  private var context: JSContext!
  private var timers: [Int: DispatchSourceTimer] = [:]
  private var nextTimer = 1
  private let onOps: (Data, Int) -> Void
  let log: (String) -> Void

  init(onOps: @escaping (Data, Int) -> Void, log: @escaping (String) -> Void) {
    self.onOps = onOps
    self.log = log
  }

  func start(bundle: String) {
    queue.async { [self] in
      context = JSContext()!
      context.exceptionHandler = { [log] _, exc in log("js error: \(exc?.toString() ?? "?") \(exc?.objectForKeyedSubscript("stack")?.toString() ?? "")") }
      let host = JSValue(newObjectIn: context)!
      let apply: @convention(block) (JSValue, Int) -> Void = { [self] bytes, ops in
        let ctx = context.jsGlobalContextRef
        let ptr = JSObjectGetTypedArrayBytesPtr(ctx, bytes.jsValueRef, nil)
        let len = JSObjectGetTypedArrayByteLength(ctx, bytes.jsValueRef, nil)
        let offset = JSObjectGetTypedArrayByteOffset(ctx, bytes.jsValueRef, nil)
        guard let ptr else { return }
        onOps(Data(bytes: ptr.advanced(by: offset), count: len), ops) // one copy per flush
      }
      let logBlock: @convention(block) (String) -> Void = { [log] line in log("js: \(line)") }
      host.setObject(apply, forKeyedSubscript: "apply" as NSString)
      host.setObject(logBlock, forKeyedSubscript: "log" as NSString)
      context.setObject(host, forKeyedSubscript: "__weftHost" as NSString)
      installTimers()
      context.evaluateScript(bundle, withSourceURL: URL(string: "app.js"))
    }
  }

  /// Called from the main thread.
  func dispatch(_ id: UInt32, _ event: String, _ payload: String = "") {
    queue.async { [self] in
      context.objectForKeyedSubscript("__weft").objectForKeyedSubscript("dispatch")
        .call(withArguments: [id, event, payload])
    }
  }

  private func installTimers() {
    let make: (JSValue, Double, Bool) -> Int = { [self] fn, ms, repeats in
      let id = nextTimer; nextTimer += 1
      let t = DispatchSource.makeTimerSource(queue: queue)
      let interval = DispatchTimeInterval.milliseconds(max(0, Int(ms)))
      t.schedule(deadline: .now() + interval, repeating: repeats ? interval : .never)
      t.setEventHandler { [weak self] in
        fn.call(withArguments: [])
        if !repeats { self?.timers.removeValue(forKey: id)?.cancel() }
      }
      timers[id] = t
      t.resume()
      return id
    }
    let setTimeout: @convention(block) (JSValue, Double) -> Int = { make($0, $1, false) }
    let setInterval: @convention(block) (JSValue, Double) -> Int = { make($0, $1, true) }
    let clear: @convention(block) (Int) -> Void = { [self] id in timers.removeValue(forKey: id)?.cancel() }
    context.setObject(setTimeout, forKeyedSubscript: "setTimeout" as NSString)
    context.setObject(setInterval, forKeyedSubscript: "setInterval" as NSString)
    context.setObject(clear, forKeyedSubscript: "clearTimeout" as NSString)
    context.setObject(clear, forKeyedSubscript: "clearInterval" as NSString)
  }
}
