// PROTOTYPE (research 40): `interaction()`, UI state as plain boxes. `hover`, `focus` and `pressed` are this page's and
// nothing else's, so an effect on them can't run for somebody else's hover and can't echo: what arrives from elsewhere
// is only ever written to `remote`, and only the three local boxes are sent. `share` makes one row per key on this page
// (same page = same box); `@weft/start/share` carries it further. Neither `weft` nor a warp component pulls this in.

import { DEV, createRoot, effect, getOwner, onCleanup, state, type Derived, type State } from './index'

export interface Counts { hover: number; focus: number; pressed: number }
export interface Action { update(): void; destroy(): void }

export interface Interaction {
  /** On this page: safe to run logic on. */
  hover: State<boolean>
  focus: State<boolean>
  pressed: State<boolean>
  /** How many others have it: other tabs, then other clients. Never who. */
  remote: Derived<Counts>
  /** What a component calls on its host. */
  attach(el: HTMLElement): Action
}

export interface InteractionOptions {
  /** Share it. Same key, same row: on this page at once, further with `@weft/start/share`. */
  share?: string
}

export interface ShareLine { set(bits: number): void; leave(): void }

/** `@weft/warp/ui` and `@weft/start/share` plug in here, as `weft/sync` does for `features.sync`. */
export const seams: {
  attach?: (el: HTMLElement, ui: Interaction) => Action
  line?: (key: string, heard: (counts: Counts) => void) => ShareLine
} = {}

export const NONE: Counts = Object.freeze({ hover: 0, focus: 0, pressed: 0 })
export const bitsOf = (hover: boolean, focus: boolean, pressed: boolean) => (hover ? 1 : 0) | (focus ? 2 : 0) | (pressed ? 4 : 0)

function row(): Interaction & { remote: State<Counts> } {
  const made: Interaction & { remote: State<Counts> } = {
    hover: state(false), focus: state(false), pressed: state(false), remote: state(NONE),
    attach(el) {
      if (DEV && !seams.attach) throw new Error("interaction(): nothing draws `ui`\n  fix: import '@weft/warp/ui'")
      return seams.attach!(el, made)
    },
  }
  return made
}

const page = new Map<string, { ui: ReturnType<typeof row>; refs: number; close(): void }>()

export function interaction(options: InteractionOptions = {}): Interaction {
  const key = options.share
  if (key === undefined || typeof document === 'undefined') return row()
  let held = page.get(key)
  if (!held) {
    held = createRoot(dispose => {
      const ui = row()
      const line = seams.line?.(key, counts => { ui.remote.value = counts })
      if (line) effect(() => bitsOf(ui.hover.value, ui.focus.value, ui.pressed.value), (bits, was) => { if (was !== undefined || bits) line.set(bits) })
      return { ui, refs: 0, close() { line?.leave(); dispose() } }
    }, null)
    page.set(key, held!)
  }
  const entry = held!
  entry.refs++
  if (getOwner()) onCleanup(() => {
    if (--entry.refs) return
    page.delete(key)
    entry.close()
  })
  return entry.ui
}
