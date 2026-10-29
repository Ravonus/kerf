// The fast-lane host: applies ops to an in-memory tree, lays it out with the same weft-layout crate the phones
// link (compiled to wasm), and counts every op. Tests and `weft device`-style snapshots run against it with no
// simulator. Text is measured with a rough metrics table, so text-dependent sizes are approximate by design.
import { readFileSync } from 'node:fs'
import { decode } from './ops'
import type { Reply, Request, SnapNode } from './device'
import { platform, setViewport, viewport, type Rect } from './platform'
import { dispatch, flush, type Host } from './runtime'
import { Align, Controls, LayoutKey, Space, TextRole, type NodeTypeName, type PropName } from './protocol.gen'

export type HNode = { id: number; type: NodeTypeName; props: Partial<Record<PropName, string | number | boolean>>; children: number[]; parent: number }
export type Frame = { x: number; y: number; w: number; h: number; contentW: number; contentH: number }

type Wasm = {
  memory: WebAssembly.Memory
  wl_tree_new_wasm(): number
  wl_node(t: number, id: number, measured: number): void
  wl_remove(t: number, id: number): void
  wl_insert(t: number, parent: number, id: number, before: number): void
  wl_set(t: number, id: number, key: number, v: number): void
  wl_dirty(t: number, id: number): void
  wl_compute(t: number, root: number, w: number, h: number): void
  wl_frame(t: number, id: number, out: number): number
  wl_alloc(bytes: number): number
}

const WASM = new URL('../../../../crates/weft-layout/target/wasm32-unknown-unknown/release/weft_layout.wasm', import.meta.url)

/** Size of a measured leaf, shared by the Node host and documented as the hosts' contract. */
export function measureLeaf(n: HNode, availW: number): [number, number] {
  const role = TextRole[(n.props.role as keyof typeof TextRole) ?? 'body'] ?? TextRole.body
  const line = Math.ceil(role.size * 1.3)
  const text = String(n.props.text ?? n.props.value ?? n.props.placeholder ?? '')
  const natural = text.length * role.size * 0.52
  if (n.type === 'Choice') {
    // segmented control: equal segments wide enough for the longest option, 32pt tall
    const opts = String(n.props.options ?? '').split('\u001f')
    const seg = Math.max(...opts.map(o => o.length)) * TextRole.body.size * 0.52 + 24
    return [Math.ceil(seg * opts.length), 32]
  }
  if (n.type === 'Input') return [Number.isFinite(availW) && availW > 0 ? availW : 200, Controls.minHeight[platform.os]]
  if (n.type === 'Button') { const min = Controls.minHeight[platform.os]; return [Math.max(min, Math.ceil(natural + Controls.buttonPadX * 2)), Math.max(min, line)] } // at least square
  if (!text) return [0, 0]
  if (Number.isFinite(availW) && availW > 0 && natural > availW) return [availW, line * Math.ceil(natural / availW)]
  return [Math.ceil(natural), line]
}

export class RecordingHost implements Host {
  nodes = new Map<number, HNode>()
  root = 0
  applies: number[] = []
  private w!: Wasm
  private t = 0
  private out = 0

  /** Natural leaf sizes from a device dump, to compare layout engines with identical text metrics. */
  natural?: Map<number, [number, number]>

  constructor(public width = 390, public height = 844) {
    const mod = new WebAssembly.Module(readFileSync(WASM))
    const inst = new WebAssembly.Instance(mod, {
      env: {
        weft_measure: (id: number, kw: number, kh: number, aw: number, _ah: number, out: number) => {
          const n = this.nodes.get(id)
          const avail = Number.isNaN(kw) ? aw : kw
          const nat = this.natural?.get(id)
          const [w, h] = !n ? [0, 0] : nat ? (n.type === 'Input' && avail > 0 && Number.isFinite(avail) ? [avail, nat[1]] : nat) : measureLeaf(n, avail)
          const f = new Float32Array(this.w.memory.buffer, out, 2)
          f[0] = Number.isNaN(kw) ? w : kw
          f[1] = Number.isNaN(kh) ? h : kh
        },
      },
    })
    this.w = inst.exports as unknown as Wasm
    this.t = this.w.wl_tree_new_wasm()
    this.out = this.w.wl_alloc(24)
  }

  /** Ops in the most recent batch. */
  get lastOps() { return this.applies.at(-1) ?? 0 }

  private held: [Uint8Array, number][] | null = null

  /** Queue incoming batches instead of applying them, to model a busy main thread. */
  hold() { this.held = [] }
  /** Apply the oldest queued batch. */
  releaseOne() { const b = this.held?.shift(); if (b) this.run(...b) }
  release() { const q = this.held ?? []; this.held = null; for (const b of q) this.run(...b) }

  apply(bytes: Uint8Array, ops: number) {
    if (this.held) this.held.push([bytes, ops])
    else this.run(bytes, ops)
  }

  private run(bytes: Uint8Array, ops: number) {
    this.applies.push(ops)
    const { w, t } = this
    for (const op of decode(bytes)) {
      switch (op.op) {
        case 'CREATE': {
          this.nodes.set(op.id, { id: op.id, type: op.type, props: {}, children: [], parent: 0 })
          const measured = op.type === 'Text' || op.type === 'Button' || op.type === 'Input' || op.type === 'Choice'
          w.wl_node(t, op.id, measured ? 1 : 0)
          if (op.type === 'Row') w.wl_set(t, op.id, LayoutKey.direction, 1)
          if (op.type === 'Scroll') w.wl_set(t, op.id, LayoutKey.scroll, 1)
          break
        }
        case 'REMOVE': {
          const n = this.nodes.get(op.id)
          if (!n) break
          this.detach(n)
          const drop = (x: HNode) => { this.nodes.delete(x.id); x.children.forEach(c => drop(this.nodes.get(c)!)) }
          drop(n)
          w.wl_remove(t, op.id)
          break
        }
        case 'INSERT': {
          const p = this.nodes.get(op.parent)!, n = this.nodes.get(op.id)!
          this.detach(n)
          const at = op.before ? p.children.indexOf(op.before) : -1
          if (at < 0) p.children.push(n.id); else p.children.splice(at, 0, n.id)
          n.parent = p.id
          w.wl_insert(t, op.parent, op.id, op.before)
          break
        }
        case 'SET': {
          const n = this.nodes.get(op.id)!
          if (n.type === 'Input' && op.prop === 'value') {
            // Same rule as the phones: a value matching a report JS hasn't caught up with is a late echo and is
            // dropped (with the older reports); any other value is a real JS write and wins.
            const pending = this.reported.get(n.id) ?? []
            const at = pending.indexOf(String(op.value))
            if (at >= 0) pending.splice(0, at + 1)
            else { n.props.value = op.value; pending.length = 0 }
            break
          }
          n.props[op.prop] = op.value
          this.layoutProp(n, op.prop, op.value)
          break
        }
        case 'ROOT': this.root = op.id; break
        case 'LISTEN': break
      }
    }
    if (this.root) w.wl_compute(t, this.root, this.width, this.height)
  }

  private detach(n: HNode) {
    const p = this.nodes.get(n.parent)
    if (p) p.children.splice(p.children.indexOf(n.id), 1)
    n.parent = 0
  }

  private layoutProp(n: HNode, prop: PropName, v: string | number | boolean) {
    const { w, t } = this
    switch (prop) {
      case 'gap': w.wl_set(t, n.id, LayoutKey.gap, Space[v as keyof typeof Space]); break
      case 'pad': w.wl_set(t, n.id, LayoutKey.pad, Space[v as keyof typeof Space]); break
      case 'grow': w.wl_set(t, n.id, LayoutKey.grow, Number(v)); break
      case 'align': w.wl_set(t, n.id, LayoutKey.align, Align[v as keyof typeof Align]); break
      case 'justify': w.wl_set(t, n.id, LayoutKey.justify, Align[v as keyof typeof Align]); break
      case 'width': w.wl_set(t, n.id, LayoutKey.width, Number(v)); break
      case 'height': w.wl_set(t, n.id, LayoutKey.height, Number(v)); break
      case 'text': case 'role': case 'value': case 'placeholder': w.wl_dirty(t, n.id); break
    }
  }

  /** The window changed (rotation, unfold, posture): tell the app, as a host does, and lay out at the new size. */
  resize(width: number, height: number, hinge?: Rect) {
    this.width = width
    this.height = height
    setViewport({ w: width, h: height, hinge })
    if (this.root) this.w.wl_compute(this.t, this.root, width, height)
  }

  /** Frame relative to the screen (scroll offsets are 0 in the fast lane). */
  frame(id: number): Frame {
    const f = new Float32Array(this.w.memory.buffer, this.out, 6)
    if (!this.w.wl_frame(this.t, id, this.out)) throw new Error(`no frame for ${id}`)
    const own = { x: f[0], y: f[1], w: f[2], h: f[3], contentW: f[4], contentH: f[5] }
    const p = this.nodes.get(id)?.parent
    if (!p) return own
    const pf = this.frame(p)
    return { ...own, x: own.x + pf.x, y: own.y + pf.y }
  }

  all(pred: (n: HNode) => boolean = () => true): HNode[] {
    const out: HNode[] = []
    const walk = (id: number) => { const n = this.nodes.get(id)!; if (pred(n)) out.push(n); n.children.forEach(walk) }
    if (this.root) walk(this.root)
    return out
  }

  byLabel(label: string) { return this.one(n => n.props.label === label, `label "${label}"`) }
  byText(text: string) { return this.one(n => n.props.text === text, `text "${text}"`) }
  private one(pred: (n: HNode) => boolean, what: string) {
    const found = this.all(pred)
    if (found.length !== 1) throw new Error(`expected one node with ${what}, found ${found.length}`)
    return found[0]
  }

  private reported = new Map<number, string[]>()

  tap(n: HNode) { if (n.props.disabled !== true) dispatch(n.id, 'tap') }
  /** Picks segment `index` of a `Choice` node. */
  select(n: HNode, index: number) { dispatch(n.id, 'select', String(index)) }
  type(n: HNode, text: string) { this.report(n, text) }

  /** Types one key at a time without letting JS answer in between, like a fast typist on a busy JS thread. */
  typeKeys(n: HNode, keys: string) {
    for (const k of keys) this.report(n, String(n.props.value ?? '') + k)
  }

  private report(n: HNode, text: string) {
    n.props.value = text
    const pending = this.reported.get(n.id) ?? []
    pending.push(text)
    this.reported.set(n.id, pending.slice(-32))
    dispatch(n.id, 'input', text)
  }

  // ---- the `weft device` protocol, same answers as the phones (src/device.ts) ----

  devSnapshot(id = this.root): SnapNode {
    const n = this.nodes.get(id)!, f = this.frame(id), p = n.props
    const o: SnapNode = { id, type: n.type, frame: [f.x, f.y, f.w, f.h], visible: f.x < this.width && f.x + f.w > 0 && f.y < this.height && f.y + f.h > 0 }
    for (const k of ['label', 'text', 'tone', 'role', 'surface'] as const) if (typeof p[k] === 'string' && p[k] !== '') o[k] = p[k] as string
    if (n.type === 'Input') o.value = String(p.value ?? '')
    if (n.type === 'Choice') { o.selected = Number(p.selected); o.options = String(p.options ?? '').split('\u001f') }
    if (p.disabled === true) o.disabled = true
    if (n.children.length) o.children = n.children.map(c => this.devSnapshot(c))
    return o
  }

  async dev(req: Request): Promise<Reply> {
    const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); flush() }
    switch (req.cmd) {
      case 'hello': return { ok: true, os: platform.os, device: `node ${this.width}×${this.height}`, port: 0 }
      case 'viewport': return { ok: true, viewport: viewport.value }
      case 'snapshot': return { ok: true, viewport: viewport.value, root: this.devSnapshot() }
      case 'frames': return { ok: true, frames: { width: this.width, height: this.height, viewport: viewport.value, nodes: [] } }
    }
    const found = req.id !== undefined ? this.all(n => n.id === req.id) : req.label !== undefined ? this.all(n => n.props.label === req.label) : null
    if (!found) return { ok: false, error: `${req.cmd} needs a label or an id` }
    const what = req.label !== undefined ? `labelled "${req.label}"` : `with id ${req.id}`
    if (found.length !== 1) return { ok: false, error: found.length ? `${found.length} nodes ${what}: ids [${found.map(n => n.id).join(', ')}]; pass an id` : `no node ${what}` }
    const n = found[0]
    if (req.cmd === 'tap' && n.type === 'Button') {
      if (n.props.disabled === true) return { ok: false, error: `${n.id} is disabled` }
      this.tap(n)
    } else if (req.cmd === 'type' && n.type === 'Input') this.type(n, req.text)
    else if (req.cmd === 'select' && n.type === 'Choice') this.select(n, req.index)
    else return { ok: false, error: `can't ${req.cmd} a ${n.type}` }
    await settle()
    const f = this.frame(n.id)
    return { ok: true, id: n.id, visible: f.y < this.height && f.y + f.h > 0 }
  }

  /** Compact tree for agents: type, label/text, and frame. */
  snapshot(id = this.root, depth = 0): string {
    const n = this.nodes.get(id)!, f = this.frame(id)
    const name = n.props.label ?? n.props.text
    const line = `${'  '.repeat(depth)}${n.type}${name !== undefined ? ` "${name}"` : ''} [${f.x},${f.y} ${f.w}×${f.h}]`
    return [line, ...n.children.map(c => this.snapshot(c, depth + 1))].join('\n')
  }
}
