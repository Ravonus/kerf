// @weft-js/core/hmr: hot updates for dev builds (PLAN §3.6, research 21). Only compiled dev modules import it (the compiler's
// `hmr` option, set by the weft() Vite plugin when serving); production builds never do.
//
// Each top-level component is registered under `file#Name` with a hash of its source. A registered component mounts
// as a derived value that re-runs when its entry's version changes, so a new module version swaps the implementation
// in place: the old run's effects and cleanups are disposed and its nodes replaced. Body-level `state()` boxes are
// wrapped in `keep(box, "Name", "count:<hash of init>")` by the compiler; a re-run with the same key gets the old
// value back. Child components created during a re-run take the state of the child at the same place in the
// previous run (same component, same order), so an edit keeps the state below it too.

import { Box, derived, flush, getOwner, untrack, type Owner, type State } from './index'
import { createComponent } from './dom'
import { hmr as scopes } from './scope'

type Comp = (props: never) => unknown

interface Entry {
  name: string
  fn: Comp
  hash: string
  /** Bumped when the implementation changes; every mounted instance reads it. */
  v: Box<number>
}

interface Frame {
  e: Entry
  /** The owner a body-level `state()` call runs under (the instance's derived node). */
  node: Owner | null
  /** Boxes by key, this run's and the previous run's. */
  boxes: Map<string, Box<unknown>>
  from?: Map<string, Box<unknown>> | undefined
  /** Registered children created during this run, by entry, in order; and the previous run's, to inherit from. */
  kids: Map<Entry, Frame[]>
  old?: Map<Entry, Frame[]> | undefined
  seen?: Map<Entry, number> | undefined
}

const entries = new Map<string, Entry>()
let frame: Frame | null = null

/** For tests: instances re-run by updates so far (callers reset it). */
export const hmrStats = { reruns: 0 }

/**
 * Register a module's components (emitted at the end of each compiled dev module, under `if (import.meta.hot)`).
 * The first registration of a name creates its entry; a later one, from a new module version, swaps the
 * implementation and re-renders mounted instances of every component whose hash changed. When none did, the module
 * re-ran because something it imports changed, and all of them re-render.
 */
export function hot(file: string, comps: Record<string, [Comp, string]>) {
  scopes.on = true
  const mine: Entry[] = [],
    changed: Entry[] = []
  let reran = false
  for (const name in comps) {
    const [fn, hash] = comps[name]!
    const id = `${file}#${name}`
    let e = entries.get(id)
    if (!e) entries.set(id, (e = { name, fn, hash, v: new Box(0) }))
    else {
      reran = true
      if (e.hash !== hash) changed.push(e)
      e.fn = fn
      e.hash = hash
    }
    mine.push(e)
    // Old and new function objects both route to the entry, so importers holding either mount the latest.
    const entry = e
    ;(fn as Comp & { $$h?: unknown }).$$h = (props: unknown, n?: string, loc?: string) =>
      mount(entry, props, n, loc)
  }
  if (!reran) return
  const restore = capture()
  for (const e of changed.length ? changed : mine) e.v.value++
  flush()
  restore()
}

/** Where a node sits: from its id, or from the body. */
function path(el: Element): string {
  const steps: string[] = []
  for (let at: Element | null = el; at && at !== document.documentElement; at = at.parentElement) {
    if (at.id) return `#${CSS.escape(at.id)} ${steps.join(' ')}`.trim()
    steps.unshift(
      at === document.body
        ? 'body'
        : `> :nth-child(${[...at.parentElement!.children].indexOf(at) + 1})`,
    )
  }
  return steps.join(' ')
}

/**
 * What a re-render can lose that isn't in a `state`: what's been typed in an uncontrolled field, focus and the caret,
 * and how far things are scrolled. A swap replaces nodes, so these go back by where the node sat.
 */
function capture() {
  if (typeof document === 'undefined') return () => {}
  const fields = [...document.querySelectorAll<HTMLInputElement>('input,textarea,select')].map(
    (el) => ({ el, at: path(el), value: el.value, checked: el.checked }),
  )
  const scrolled = [...document.querySelectorAll('*')]
    .filter((el) => el.scrollTop || el.scrollLeft)
    .map((el) => ({ el, at: path(el), top: el.scrollTop, left: el.scrollLeft }))
  const active = document.activeElement as HTMLInputElement | null
  const focus =
    active && active !== document.body
      ? { el: active, at: path(active), start: active.selectionStart, end: active.selectionEnd }
      : undefined
  const find = <T extends Element>(was: { el: T; at: string }) =>
    was.el.isConnected ? was.el : document.querySelector<T>(was.at)
  return () => {
    for (const f of fields) {
      const el = find(f)
      if (!el || el === f.el || el.localName !== f.el.localName) continue
      if (el.value !== f.value) el.value = f.value
      el.checked = f.checked
    }
    const scroll = () => {
      for (const s of scrolled) {
        const el = find(s)
        if (el) {
          el.scrollTop = s.top
          el.scrollLeft = s.left
        }
      }
    }
    scroll()
    requestAnimationFrame?.(scroll) // the browser's scroll anchoring moves it again at the next layout
    if (!focus) return
    const el = find(focus)
    if (!el || el === document.activeElement) return
    el.focus({ preventScroll: true })
    if (focus.start != null) el.setSelectionRange?.(focus.start, focus.end)
  }
}

function mount(e: Entry, props: unknown, name?: string, loc?: string) {
  const parent = frame
  let from: Map<string, Box<unknown>> | undefined
  if (parent?.old) {
    const n = parent.seen!.get(e) ?? 0
    parent.seen!.set(e, n + 1)
    from = parent.old.get(e)?.[n]?.boxes
  }
  const f: Frame = { e, node: null, boxes: from ?? new Map(), kids: new Map() }
  if (parent) {
    let list = parent.kids.get(e)
    if (!list) parent.kids.set(e, (list = []))
    list.push(f)
  }
  let last: unknown
  let runs = 0
  const d = derived(() => {
    void e.v.value
    const outer = frame
    f.node = getOwner()
    f.from = f.boxes
    f.boxes = new Map()
    f.old = f.kids
    f.kids = new Map()
    f.seen = new Map()
    frame = f
    if (runs++) hmrStats.reruns++
    try {
      return (last = createComponent(e.fn, props as never, name, loc))
    } catch (err) {
      if (runs === 1) throw err
      console.error(
        `weft hmr: <${e.name}> threw while updating; keeping its last output until the next edit\n`,
        err,
      )
      return last
    } finally {
      frame = outer
      f.from = f.old = f.seen = undefined
    }
  })
  untrack(() => d.value) // run now, in creation order, like an unregistered component
  return () => d.value
}

/** Compiled from a component's body-level `const x = state(init)`: the previous run's value when the key matches. */
export function keep<T>(box: State<T>, comp: string, key: string): State<T> {
  const f = frame
  if (f && f.e.name === comp && getOwner() === f.node) {
    const old = f.from?.get(key)
    if (old) (box as Box<T>).v = old.v as T
    f.boxes.set(key, box as Box<unknown>)
  }
  return box
}
