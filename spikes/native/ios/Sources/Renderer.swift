import UIKit

/// Applies op batches to real UIKit views, mirrors the tree into weft-layout, and sets frames from it.
/// The same loop exists in TS (js/src/ops.ts `decode`) and will exist in Kotlin.
final class Renderer {
  private struct Node { let type: NodeType; let view: UIView; var props: [Prop: Any] = [:]; var children: [UInt32] = []; var parent: UInt32 = 0 }
  private var nodes: [UInt32: Node] = [:]
  private var root: UInt32 = 0
  /// Texts each input reported to JS that JS hasn't echoed back yet (see `.value`).
  private var reported: [UInt32: [String]] = [:]
  private var tree: OpaquePointer!
  let container: UIView
  var onEvent: ((UInt32, String, String) -> Void)?
  var log: ((String) -> Void)?

  init(container: UIView) {
    self.container = container
    let measure: wl_measure_fn = { user, id, kw, kh, aw, _, out in
      let r = Unmanaged<Renderer>.fromOpaque(user!).takeUnretainedValue()
      let size = r.measure(id, availW: kw.isNaN ? aw : kw)
      out![0] = kw.isNaN ? size.width : kw
      out![1] = kh.isNaN ? size.height : kh
    }
    tree = wl_tree_new(measure, Unmanaged.passUnretained(self).toOpaque())
  }

  // MARK: ops

  func apply(_ data: Data, ops: Int) {
    let start = CACurrentMediaTime()
    data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      var at = 0
      func u() -> UInt32 { let w = raw.loadUnaligned(fromByteOffset: at, as: UInt32.self); at += 4; return w }
      while at < raw.count {
        guard let op = Op(rawValue: u()) else { log?("unknown op at \(at - 4)"); return }
        switch op {
        case .create: create(u(), NodeType(rawValue: u())!)
        case .remove: remove(u())
        case .insert: let p = u(), id = u(), before = u(); insert(p, id, before)
        case .setBool: let id = u(), prop = u(); set(id, Prop(rawValue: prop)!, u() == 1)
        case .setNum:
          let id = u(), prop = u()
          let v = raw.loadUnaligned(fromByteOffset: at, as: Double.self); at += 8
          set(id, Prop(rawValue: prop)!, v)
        case .setStr:
          let id = u(), prop = u(), len = Int(u())
          let s = String(decoding: UnsafeRawBufferPointer(rebasing: raw[at..<at + len]), as: UTF8.self)
          at += (len + 3) & ~3
          set(id, Prop(rawValue: prop)!, s)
        case .listen: listen(u(), EventKind(rawValue: u())!)
        case .root: root = u(); container.addSubview(nodes[root]!.view)
        }
      }
    }
    layout()
    log?(String(format: "apply ops=%d bytes=%d main=%.2fms", ops, data.count, (CACurrentMediaTime() - start) * 1000))
  }

  private func create(_ id: UInt32, _ type: NodeType) {
    let view: UIView
    switch type {
    case .Stack, .Row: view = UIView()
    case .Scroll: let s = UIScrollView(); s.alwaysBounceVertical = true; view = s
    case .Text: let l = UILabel(); l.numberOfLines = 0; l.font = font("body"); view = l
    case .Button:
      var c = UIButton.Configuration.gray()
      c.cornerStyle = .medium
      view = UIButton(configuration: c)
    case .Input:
      let f = UITextField()
      f.borderStyle = .roundedRect
      f.font = font("body")
      f.clearButtonMode = .whileEditing
      view = f
    case .Choice: view = UISegmentedControl()
    }
    nodes[id] = Node(type: type, view: view)
    wl_node(tree, id, Renderer.measured(type) ? 1 : 0)
    if type == .Row { wl_set(tree, id, LayoutKey.direction.rawValue, 1) }
    if type == .Scroll { wl_set(tree, id, LayoutKey.scroll.rawValue, 1) }
  }

  /// Leaves whose size comes from the platform.
  static func measured(_ t: NodeType) -> Bool { t == .Text || t == .Button || t == .Input || t == .Choice }

  private func remove(_ id: UInt32) {
    guard let n = nodes[id] else { return }
    detach(id)
    n.view.removeFromSuperview()
    func drop(_ x: UInt32) { if let c = nodes.removeValue(forKey: x) { c.children.forEach(drop) } }
    drop(id)
    wl_remove(tree, id)
  }

  private func detach(_ id: UInt32) {
    guard let p = nodes[id]?.parent, p != 0 else { return }
    nodes[p]?.children.removeAll { $0 == id }
    nodes[id]?.parent = 0
  }

  private func insert(_ parent: UInt32, _ id: UInt32, _ before: UInt32) {
    detach(id)
    guard var p = nodes[parent], let n = nodes[id] else { return }
    if before != 0, let i = p.children.firstIndex(of: before) {
      p.children.insert(id, at: i)
      p.view.insertSubview(n.view, belowSubview: nodes[before]!.view)
    } else {
      p.children.append(id)
      p.view.addSubview(n.view)
    }
    nodes[parent] = p
    nodes[id]?.parent = parent
    wl_insert(tree, parent, id, before)
  }

  private func listen(_ id: UInt32, _ event: EventKind) {
    guard let view = nodes[id]?.view else { return }
    switch event {
    case .tap: (view as? UIButton)?.addAction(UIAction { [weak self] _ in self?.onEvent?(id, "tap", "") }, for: .touchUpInside)
    case .input:
      let field = view as? UITextField
      field?.addAction(UIAction { [weak self] _ in
        let text = field?.text ?? ""
        self?.reported[id, default: []].append(text)
        self?.onEvent?(id, "input", text)
      }, for: .editingChanged)
    case .select:
      let seg = view as? UISegmentedControl
      seg?.addAction(UIAction { [weak self] _ in self?.onEvent?(id, "select", "\(seg?.selectedSegmentIndex ?? -1)") }, for: .valueChanged)
    }
  }

  private func set(_ id: UInt32, _ prop: Prop, _ value: Any) {
    guard var n = nodes[id] else { return }
    n.props[prop] = value
    nodes[id] = n
    let v = n.view
    switch prop {
    case .text:
      let s = value as? String ?? ""
      if let l = v as? UILabel { l.text = s }
      if let b = v as? UIButton { b.configuration?.title = s }
      wl_dirty(tree, id)
    case .role:
      (v as? UILabel)?.font = font(value as? String ?? "body")
      wl_dirty(tree, id)
    case .value:
      // The field owns its text. JS values that only echo what the field reported earlier arrive late (the user
      // kept typing) and are dropped; a value JS chose itself (clear, format) is applied.
      if let f = v as? UITextField, let s = value as? String {
        if let i = reported[id, default: []].firstIndex(of: s) { reported[id]!.removeFirst(i + 1) }
        else { reported[id] = []; if f.text != s { f.text = s } }
      }
    case .placeholder: (v as? UITextField)?.placeholder = value as? String
    case .label:
      v.accessibilityLabel = value as? String
      v.accessibilityIdentifier = value as? String
    case .disabled: (v as? UIControl)?.isEnabled = !(value as? Bool ?? false)
    case .tone:
      if let b = v as? UIButton {
        let tone = value as? String ?? "plain"
        var c: UIButton.Configuration
        switch tone {
        case "accent": c = .filled()
        case "tab", "tab-on":
          // Tab bar item: no chrome, the selected one tinted (UITabBar's look, as a plain button for the spike).
          c = .plain()
          c.baseForegroundColor = tone == "tab-on" ? .tintColor : .secondaryLabel
          c.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { a in
            var a = a; a.font = UIFont.systemFont(ofSize: 15, weight: tone == "tab-on" ? .semibold : .medium); return a
          }
        case "side", "side-on":
          // Sidebar row (UICollectionView's sidebar list look): leading text, the selected row on a rounded fill.
          c = .plain()
          c.baseForegroundColor = .label
          if tone == "side-on" { c.background.backgroundColor = .tertiarySystemFill }
          c.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { a in
            var a = a; a.font = UIFont.systemFont(ofSize: 17, weight: tone == "side-on" ? .semibold : .regular); return a
          }
        default: c = .gray()
        }
        c.cornerStyle = .medium
        c.title = b.configuration?.title
        b.configuration = c
        b.contentHorizontalAlignment = tone.hasPrefix("side") ? .leading : .center
      }
    case .options:
      if let seg = v as? UISegmentedControl {
        let selected = n.props[.selected] as? Double
        seg.removeAllSegments()
        for (i, t) in (value as? String ?? "").split(separator: "\u{1F}", omittingEmptySubsequences: false).enumerated() {
          seg.insertSegment(withTitle: String(t), at: i, animated: false)
        }
        if let selected { seg.selectedSegmentIndex = Int(selected) }
        wl_dirty(tree, id)
      }
    case .selected: (v as? UISegmentedControl)?.selectedSegmentIndex = Int(value as? Double ?? -1)
    case .surface:
      let surface = value as? String ?? ""
      guard surface == "bar" || surface == "sidebar" else { break }
      v.backgroundColor = .secondarySystemBackground
      let skirt = UIView() // the surface's background carried into the unsafe area it borders; sized in layout()
      skirt.backgroundColor = v.backgroundColor
      skirt.tag = Renderer.skirtTag
      v.insertSubview(skirt, at: 0)
      let line = UIView() // hairline on the edge facing the content; placed in layout()
      line.backgroundColor = .separator
      line.tag = Renderer.skirtTag + 1
      v.addSubview(line)
    case .gap: wl_set(tree, id, LayoutKey.gap.rawValue, spaceTokens[value as? String ?? ""] ?? 0)
    case .pad: wl_set(tree, id, LayoutKey.pad.rawValue, spaceTokens[value as? String ?? ""] ?? 0)
    case .grow: wl_set(tree, id, LayoutKey.grow.rawValue, Float(value as? Double ?? 0))
    case .align: wl_set(tree, id, LayoutKey.align.rawValue, alignTokens[value as? String ?? ""] ?? 3)
    case .justify: wl_set(tree, id, LayoutKey.justify.rawValue, alignTokens[value as? String ?? ""] ?? 0)
    case .width: wl_set(tree, id, LayoutKey.width.rawValue, Float(value as? Double ?? .nan))
    case .height: wl_set(tree, id, LayoutKey.height.rawValue, Float(value as? Double ?? .nan))
    }
  }

  // MARK: layout

  private func font(_ role: String) -> UIFont {
    let r = textRoles[role] ?? textRoles["body"]!
    let weight: UIFont.Weight = r.weight >= 600 ? .semibold : r.weight >= 500 ? .medium : .regular
    return UIFont.systemFont(ofSize: r.size, weight: weight)
  }

  /// Platform measurement, so wrapping matches what UIKit draws.
  fileprivate func measure(_ id: UInt32, availW: Float) -> (width: Float, height: Float) {
    guard let n = nodes[id] else { return (0, 0) }
    let w = availW.isFinite && availW > 0 ? CGFloat(availW) : .greatestFiniteMagnitude
    switch n.type {
    case .Input: return (availW.isFinite && availW > 0 ? availW : 200, controlMinHeight)
    case .Choice:
      let s = n.view.sizeThatFits(CGSize(width: w, height: .greatestFiniteMagnitude))
      return (Float(ceil(min(s.width, w))), Float(ceil(s.height)))
    case .Button:
      let s = n.view.sizeThatFits(CGSize(width: w, height: .greatestFiniteMagnitude))
      return (Float(ceil(s.width)), max(controlMinHeight, Float(ceil(s.height))))
    default:
      if (n.props[.text] as? String ?? "").isEmpty { return (0, 0) }
      let s = n.view.sizeThatFits(CGSize(width: w, height: .greatestFiniteMagnitude))
      return (Float(ceil(min(s.width, w))), Float(ceil(s.height)))
    }
  }

  func layout() {
    guard root != 0 else { return }
    let b = container.bounds
    wl_compute(tree, root, Float(b.width), Float(b.height))
    var f = [Float](repeating: 0, count: 6)
    func place(_ id: UInt32) {
      guard let n = nodes[id], wl_frame(tree, id, &f) == 1 else { return }
      n.view.frame = CGRect(x: CGFloat(f[0]), y: CGFloat(f[1]), width: CGFloat(f[2]), height: CGFloat(f[3]))
      (n.view as? UIScrollView)?.contentSize = CGSize(width: CGFloat(f[4]), height: CGFloat(f[5]))
      n.children.forEach(place)
    }
    place(root)
    extendBars()
  }

  private static let skirtTag = 0x5eed

  /// Layout runs inside the safe area. A surface (bottom bar, sidebar) that touches an edge of it draws its background
  /// on to the screen edge on that side: under the home indicator, beside the Dynamic Island in landscape, under the
  /// status bar for a sidebar. That's what UITabBar and the sidebar do. Frames don't change.
  private func extendBars() {
    guard let sup = container.superview else { return }
    let c = container.frame, b = container.bounds
    let out = UIEdgeInsets(top: c.minY, left: c.minX, bottom: sup.bounds.height - c.maxY, right: sup.bounds.width - c.maxX)
    for n in nodes.values {
      guard let skirt = n.view.subviews.first(where: { $0.tag == Renderer.skirtTag }) else { continue } // not viewWithTag: it searches descendants
      let f = n.view.convert(n.view.bounds, to: container)
      let near = { (a: CGFloat, b: CGFloat) in abs(a - b) < 0.5 }
      let grow = UIEdgeInsets(top: near(f.minY, 0) ? out.top : 0, left: near(f.minX, 0) ? out.left : 0,
                              bottom: near(f.maxY, b.height) ? out.bottom : 0, right: near(f.maxX, b.width) ? out.right : 0)
      skirt.frame = n.view.bounds.inset(by: UIEdgeInsets(top: -grow.top, left: -grow.left, bottom: -grow.bottom, right: -grow.right))
      if let line = n.view.subviews.first(where: { $0.tag == Renderer.skirtTag + 1 }) {
        let px = 1 / UIScreen.main.scale
        line.frame = (n.props[.surface] as? String) == "bar"
          ? CGRect(x: skirt.frame.minX, y: 0, width: skirt.frame.width, height: px)
          : CGRect(x: n.view.bounds.width - px, y: skirt.frame.minY, width: px, height: skirt.frame.height)
      }
    }
  }

  /// Frames, types, labels and measured leaf sizes as JSON, for comparing against the Node layout.
  func dumpFrames() -> Data {
    var f = [Float](repeating: 0, count: 6)
    var out: [[String: Any]] = []
    func walk(_ id: UInt32) {
      guard let n = nodes[id], wl_frame(tree, id, &f) == 1 else { return }
      var row: [String: Any] = ["id": id, "type": "\(n.type)", "label": n.props[.label] as? String ?? "", "text": n.props[.text] as? String ?? "",
                                "x": f[0], "y": f[1], "w": f[2], "h": f[3], "contentH": f[5]]
      if Renderer.measured(n.type) {
        let s = measure(id, availW: .infinity) // natural size, so Node can lay out with the device's text metrics
        row["natW"] = s.width
        row["natH"] = s.height
      }
      out.append(row)
      n.children.forEach(walk)
    }
    walk(root)
    return try! JSONSerialization.data(withJSONObject: ["width": container.bounds.width, "height": container.bounds.height, "nodes": out], options: [.prettyPrinted])
  }
}
