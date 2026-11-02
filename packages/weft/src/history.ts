// @weft-js/core/history: undo and redo for scopes with `{ history: { limit } }` (research 14 §2.10), and the action
// transactions they need. One step per action call (nested calls join the outer); writes outside any action group per
// microtask into one step named `<scope>.write`. Boxes with `history: false` are left out. The weft() Vite plugin
// imports this where the option is used.

import { Box, DEV, derived } from './index'
import { features, owners, type History, type HistoryEntry, type Instance, type Timeline } from './scope'

type Change = { box: Box<unknown>; before: unknown }
type Tx = { name: string; changes: Map<Box<unknown>, Change> }
type Step = { entry: HistoryEntry; changes: { box: Box<unknown>; before: unknown; after: unknown }[] }

let tx: Tx | null = null
let loose: Tx | null = null
let replaying = false

const logs = new WeakMap<Instance, Log>()

class Log implements Timeline, History {
  past: Step[] = []
  future: Step[] = []
  version = new Box(0)
  canUndo = derived(() => (this.version.value, this.past.length > 0))
  canRedo = derived(() => (this.version.value, this.future.length > 0))
  entries = derived(() => (this.version.value, this.past.map(p => p.entry)))
  constructor(private limit: number) {}

  push(action: string, changes: Change[]) {
    this.past.push({ entry: { action, at: Date.now() }, changes: changes.map(c => ({ box: c.box, before: c.before, after: c.box.v })) })
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
    this.version.value++
  }
  private apply(step: Step, key: 'before' | 'after') {
    replay(() => { for (const c of step.changes) c.box.w(c[key]) })
    this.version.value++
  }
  undo() {
    const step = this.past.pop()
    if (step) { this.future.push(step); this.apply(step, 'before') }
  }
  redo() {
    const step = this.future.pop()
    if (step) { this.past.push(step); this.apply(step, 'after') }
  }
  clear() {
    this.past = []
    this.future = []
    this.version.value++
  }
}

function replay(fn: () => void) {
  replaying = true
  try { fn() } finally { replaying = false }
}

function commit(t: Tx) {
  const byLog = new Map<Log, Change[]>()
  for (const c of t.changes.values()) {
    const log = logs.get(owners.get(c.box)!)
    if (log && c.box.opts?.history !== false && !Object.is(c.before, c.box.v)) {
      let list = byLog.get(log)
      if (!list) byLog.set(log, (list = []))
      list.push(c)
    }
  }
  for (const [log, changes] of byLog) log.push(t.name, changes)
}

features.history = {
  create(inst, limit) {
    const log = new Log(limit)
    logs.set(inst, log)
    return log
  },
  action(name, fn) {
    const wrapped = ((...args: never[]) => {
      if (tx) return fn(...args)
      const t: Tx = (tx = { name, changes: new Map() })
      try {
        return fn(...args)
      } finally {
        // An async action's transaction is its synchronous part; writes after an `await` group as `<scope>.write`.
        tx = null
        commit(t)
      }
    }) as typeof fn
    if (DEV) Object.defineProperty(wrapped, 'name', { value: name })
    return wrapped
  },
  record(inst, box, before) {
    if (replaying) return
    let t = tx
    if (!t) {
      if (!loose) {
        loose = { name: `${inst.name}.write`, changes: new Map() }
        queueMicrotask(() => { const l = loose!; loose = null; commit(l) })
      }
      t = loose
    }
    if (!t.changes.has(box)) t.changes.set(box, { box, before })
  },
  replay,
}
