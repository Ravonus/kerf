// `interaction()` (research 45): UI state as plain boxes. `hover`, `focus` and `pressed` are this page's and
// nothing else's, so an effect on them can't run for somebody else's hover and can't echo: what arrives from elsewhere
// is only ever written to `remote`, and only the three local boxes are sent. `share` makes one row per key on this page
// (same page = same box); `@kerf-js/start/share` carries it further. Neither `kerf` nor a veneer component pulls this in.

import {
  DEV,
  createRoot,
  effect,
  getOwner,
  onCleanup,
  state,
  untrack,
  type Derived,
  type State,
} from './index'

/** How many pointers hover, how many focuses sit inside, and how many presses are down. */
export interface Counts {
  hover: number
  focus: number
  pressed: number
}
/** What an action directive returns: `update` after a prop change, `destroy` at the end. */
export interface Action {
  update(): void
  destroy(): void
}

/** A hover, focus and press tracker, with the handlers that feed it. */
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

/** How `interaction` behaves. */
export interface InteractionOptions {
  /**
   * Share it. Same key, same row: on this page at once, across tabs and clients in a `@kerf-js/start` app. Read once: a
   * function is how a prop goes in (`share: () => \`todo:${props.id}\``), and a new key is a new `key` on the component.
   */
  share?: string | (() => string)
}

/** One tracker's line into a shared one: `set` reports its bits, `leave` takes them away. */
export interface ShareLine {
  set(bits: number): void
  leave(): void
}

/** `@kerf-js/veneer/ui` and `@kerf-js/start/share` plug in here, as `@kerf-js/core/sync` does for `features.sync`. */
export const seams: {
  attach?: (el: HTMLElement, ui: Interaction) => Action
  line?: ((key: string, heard: (counts: Counts) => void) => ShareLine) | undefined
} = {}

/** Nothing hovered, focused or pressed. */
export const NONE: Counts = Object.freeze({ hover: 0, focus: 0, pressed: 0 })
/** Hover, focus and pressed as one number, so a change costs a compare. */
export const bitsOf = (hover: boolean, focus: boolean, pressed: boolean) =>
  (hover ? 1 : 0) | (focus ? 2 : 0) | (pressed ? 4 : 0)

function row(): Interaction & { remote: State<Counts> } {
  const made: Interaction & { remote: State<Counts> } = {
    hover: state(false),
    focus: state(false),
    pressed: state(false),
    remote: state(NONE),
    attach(el) {
      if (DEV && !seams.attach)
        throw new Error("interaction(): nothing draws `ui`\n  fix: import '@kerf-js/veneer/ui'")
      return seams.attach!(el, made)
    },
  }
  return made
}

const page = new Map<string, { ui: ReturnType<typeof row>; refs: number; close(): void }>()

/** Tracks hover, focus and press on an element, for what a style can't reach. */
export function interaction(options: InteractionOptions = {}): Interaction {
  const share = options.share
  if (share === undefined || typeof document === 'undefined') return row()
  const key = typeof share === 'function' ? untrack(share) : share
  let held = page.get(key)
  if (!held) {
    held = createRoot((dispose) => {
      const ui = row()
      const line = seams.line?.(key, (counts) => {
        ui.remote.value = counts
      })
      if (line)
        effect(
          () => bitsOf(ui.hover.value, ui.focus.value, ui.pressed.value),
          (bits, was) => {
            if (was !== undefined || bits) line.set(bits)
          },
        )
      return {
        ui,
        refs: 0,
        close() {
          line?.leave()
          dispose()
        },
      }
    }, null)
    page.set(key, held)
  }
  const entry = held
  entry.refs++
  if (getOwner())
    onCleanup(() => {
      if (--entry.refs) return
      page.delete(key)
      entry.close()
    })
  return entry.ui
}
