// ---- connection (09 §5.3, §5.4) -------------------------------------------------------------------------------------

/** What the connection banner shows; `undefined`: nothing. */
export type ConnView = 'offline' | 'reconnecting' | 'online' | 'stale' | undefined

/** What the banner shows: offline over reconnecting over a stale deploy; `recovered` is the short "Back online". */
export function connView({
  online,
  state,
  stale,
  recovered,
}: {
  online: boolean
  state?: string | undefined
  stale?: boolean | undefined
  recovered?: boolean | undefined
}): ConnView {
  if (!online || state === 'offline') return 'offline'
  if (state === 'reconnecting' || state === 'connecting') return 'reconnecting'
  if (recovered) return 'online'
  return stale ? 'stale' : undefined
}

// ---- keyboard shortcuts (09 §7) -------------------------------------------------------------------------------------

/** One keyboard shortcut in the registry. */
export interface Shortcut {
  /** Space-separated steps, `+` within one: `?`, `g m`, `mod+k`. `mod` is ⌘ on Apple platforms and Ctrl elsewhere. */
  keys: string
  label: string
  group?: string
  /** Only while this holds (and the overlay lists it only then). */
  when?: () => boolean
  run?: (e: KeyboardEvent) => void
}

const NAMES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  enter: 'Enter',
  space: ' ',
}

const GLYPHS: Record<string, string> = {
  esc: 'Esc',
  escape: 'Esc',
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
  enter: 'Enter',
  space: 'Space',
  shift: 'Shift',
}

const SEQUENCE_MS = 1000

const MODS = new Set(['mod', 'ctrl', 'cmd', 'alt', 'shift'])

const parts = (step: string) => (step === '+' ? ['+'] : step.split('+'))

/** Whether `mod` means ⌘: an Apple platform, from the navigator. */
export const isApple = (nav: { platform?: string; userAgent?: string } | undefined) =>
  /mac|iphone|ipad|ipod/i.test(nav?.platform ?? nav?.userAgent ?? '')

/** The chips for each step: `[['⌘', 'K']]`, or `[['Ctrl', 'K']]`, `[['G'], ['M']]`. */
export function shortcutLabels(keys: string, apple: boolean) {
  return keys
    .trim()
    .split(/\s+/)
    .map((step) =>
      parts(step).map((p) => {
        const k = p.toLowerCase()
        if (k === 'mod' || k === 'cmd') return apple ? '⌘' : 'Ctrl'
        if (k === 'ctrl') return 'Ctrl'
        if (k === 'alt') return apple ? '⌥' : 'Alt'
        return GLYPHS[k] ?? p.toUpperCase()
      }),
    )
}

/** A single-key shortcut has no ⌘, Ctrl or Alt: WCAG 2.1.4 lets the user turn these off. */
export const isSingleKey = (keys: string) =>
  !keys
    .split(/\s+/)
    .some((s) => parts(s).some((p) => ['mod', 'ctrl', 'cmd', 'alt'].includes(p.toLowerCase())))

/** A field that takes typing: a single-key shortcut never fires there. */
export function isTextTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  if (!el?.tagName) return false
  if (
    el.isContentEditable ||
    el.closest?.(
      '[contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]',
    )
  )
    return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return (
    el.tagName === 'INPUT' &&
    !/^(button|checkbox|color|file|image|radio|range|reset|submit)$/i.test(
      (el as HTMLInputElement).type,
    )
  )
}

function matches(step: string, e: KeyboardEvent, apple: boolean) {
  const list = parts(step)
  const key = list.find((p) => !MODS.has(p.toLowerCase())) ?? ''
  const want = list.map((p) => p.toLowerCase())
  const mod = want.includes('mod')
  const named = NAMES[key.toLowerCase()]
  const hit = named ? e.key === named : e.key.toLowerCase() === key.toLowerCase()
  // a symbol's shift is part of the key: `?` is Shift+/ on one layout and something else on another
  const shiftCounts = want.includes('shift') || /^[a-z0-9]$/i.test(key) || !!named
  return (
    hit &&
    e.metaKey === (want.includes('cmd') || (mod && apple)) &&
    e.ctrlKey === (want.includes('ctrl') || (mod && !apple)) &&
    e.altKey === want.includes('alt') &&
    (!shiftCounts || e.shiftKey === want.includes('shift'))
  )
}

/** A registry of shortcuts, so the overlay is always true. Most apps use the shared `shortcuts`. */
export function createShortcuts() {
  const list = new Set<Shortcut>()
  const subs = new Set<() => void>()
  const docs = new Map<Document, { n: number; stop(): void }>()
  let singleKeys = true
  const notify = () => subs.forEach((s) => s())

  return {
    /** Add a shortcut; the returned function removes it. */
    register(s: Shortcut) {
      list.add(s)
      notify()
      return () => {
        list.delete(s)
        notify()
      }
    },
    /** Everything registered now, in order, `when` applied. */
    list: () => [...list].filter((s) => !s.when || s.when()),
    /** Called when the list or the setting changes. */
    subscribe(fn: () => void) {
      subs.add(fn)
      return () => void subs.delete(fn)
    },
    /** Whether single-key shortcuts fire. */
    get singleKeys() {
      return singleKeys
    },
    set singleKeys(on: boolean) {
      singleKeys = on
      notify()
    },
    /** Start listening on a document; the returned function stops. Shared between callers. */
    listen(doc: Document) {
      let d = docs.get(doc)
      if (!d) {
        const fn = shortcutListener(doc, list, () => singleKeys)
        doc.addEventListener('keydown', fn)
        d = { n: 0, stop: () => doc.removeEventListener('keydown', fn) }
        docs.set(doc, d)
      }
      d.n++
      const entry = d
      return () => {
        if (--entry.n === 0) {
          entry.stop()
          docs.delete(doc)
        }
      }
    },
  }
}

function shortcutListener(doc: Document, list: Set<Shortcut>, enabled: () => boolean) {
  let held: { steps: string[]; s: Shortcut }[] = []
  let heldAt = 0
  return (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing || e.repeat) return
    if (['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) return
    const apple = isApple(doc.defaultView?.navigator)
    const live = [...list].filter((s) => !s.when || s.when())
    const open = (s: Shortcut) => !isSingleKey(s.keys) || (enabled() && !isTextTarget(e.target))
    const pending = e.timeStamp - heldAt < SEQUENCE_MS ? held : []
    const next = pending
      .filter((h) => matches(h.steps[0] ?? '', e, apple))
      .map((h) => ({ ...h, steps: h.steps.slice(1) }))
    const start = live
      .filter(open)
      .map((s) => ({ s, steps: s.keys.trim().split(/\s+/) }))
      .filter((h) => matches(h.steps[0] ?? '', e, apple))
      .map((h) => ({ ...h, steps: h.steps.slice(1) }))
    const hits = [...next, ...start]
    const done = hits.find((h) => !h.steps.length)
    held = done ? [] : hits
    heldAt = e.timeStamp
    if (done?.s.run) {
      e.preventDefault()
      done.s.run(e)
    }
  }
}

/** A shortcuts registry, as `createShortcuts` makes it. */
export type Shortcuts = ReturnType<typeof createShortcuts>

/** The app's one registry: `shortcuts.register({ keys, label, group, when, run })`. */
export const shortcuts = /* @__PURE__ */ createShortcuts()

/** Shortcuts whose name or keys hold `query`. */
export function filterShortcuts<S extends Shortcut>(
  list: readonly S[],
  query: string,
  apple: boolean,
) {
  const q = query.trim().toLowerCase()
  if (!q) return [...list]
  return list.filter(
    (s) =>
      s.label.toLowerCase().includes(q) ||
      s.keys.toLowerCase().includes(q) ||
      shortcutLabels(s.keys, apple).flat().join(' ').toLowerCase().includes(q),
  )
}

/** `text` split around `query`, for `<mark>`. */
export function markParts(text: string, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return [{ at: 0, text, hit: false }]
  const out: { at: number; text: string; hit: boolean }[] = []
  const low = text.toLowerCase()
  let at = 0
  for (let i = low.indexOf(q); i >= 0; i = low.indexOf(q, at)) {
    if (i > at) out.push({ at, text: text.slice(at, i), hit: false })
    out.push({ at: i, text: text.slice(i, i + q.length), hit: true })
    at = i + q.length
  }
  if (at < text.length) out.push({ at, text: text.slice(at), hit: false })
  return out
}
