// The APG menu button (02 §6, "The account menu"): one menu, any number of triggers.
import { place, pushLayer, type Align, type Side } from './layers'

export interface MenuOptions {
  open: boolean
  /** The trigger that opened it: focus goes back here. */
  trigger: () => HTMLElement | null | undefined
  /** Which item takes focus on open (↑ on a trigger opens at the last). */
  at?: 'first' | 'last'
  /** Anchor it to the trigger while open (placed once shown, followed through scroll and resize). */
  side?: Side
  align?: Align
  onClose(): void
}


const ITEMS = '[role^="menuitem"]:not([aria-disabled="true"])'
const TYPEAHEAD_MS = 500

/**
 * Items rove (tabindex is -1 in the markup, so the menu is never a tab stop): ↑/↓ wrap, Home/End and PageUp/PageDown
 * jump, printable keys are typeahead (keys within 500ms build a prefix; one letter repeated cycles its matches),
 * Enter/Space activate. Escape closes and returns to the trigger, Tab closes and returns so focus moves on from it,
 * an outside press closes without moving focus.
 */
export function menu(el: HTMLElement, opts: MenuOptions) {
  let o = opts
  let remove: (() => void) | undefined
  let typed = ''
  let typedAt = 0
  const items = () => [...el.querySelectorAll<HTMLElement>(ITEMS)]
  const win = el.ownerDocument.defaultView!
  const reposition = (e?: Event) => {
    const t = o.trigger()
    if (o.side && t && e?.target !== el && el.matches(':popover-open')) place(el, t, o.side, o.align, 6)
  }
  const show = () => {
    if (remove) return
    reposition()
    win.addEventListener('resize', reposition)
    win.addEventListener('scroll', reposition, true)
    remove = pushLayer({ el, trigger: o.trigger(), close: reason => { if (reason === 'escape') o.trigger()?.focus(); o.onClose() } })
    const all = items()
    ;(o.at === 'last' ? all.at(-1) : all[0])?.focus({ preventScroll: true })
  }
  const hide = () => {
    remove?.()
    remove = undefined
    typed = ''
    win.removeEventListener('resize', reposition)
    win.removeEventListener('scroll', reposition, true)
  }
  const onKey = (e: KeyboardEvent) => {
    const all = items()
    const at = all.indexOf(el.ownerDocument.activeElement as HTMLElement)
    const go = (i: number) => { e.preventDefault(); all[(i + all.length) % all.length]?.focus() }
    if (e.key === 'ArrowDown') return go(at + 1)
    if (e.key === 'ArrowUp') return go(at - 1)
    if (e.key === 'Home' || e.key === 'PageUp') return go(0)
    if (e.key === 'End' || e.key === 'PageDown') return go(all.length - 1)
    if (e.key === 'Tab') { o.trigger()?.focus(); return o.onClose() } // no preventDefault: Tab moves on from the trigger
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return all[at]?.click() }
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
    const now = performance.now()
    const key = e.key.toLowerCase()
    typed = now - typedAt < TYPEAHEAD_MS ? typed + key : key
    typedAt = now
    const prefix = [...typed].every(c => c === key) ? key : typed
    const from = prefix.length === 1 ? at + 1 : Math.max(at, 0)
    const hit = [...all.slice(from), ...all.slice(0, from)].find(i => i.textContent!.trim().toLowerCase().startsWith(prefix))
    if (hit) { e.preventDefault(); hit.focus() }
  }
  el.addEventListener('keydown', onKey)
  if (o.open) show()
  return {
    update(next: MenuOptions) {
      o = next
      if (o.open) show()
      else hide()
    },
    destroy() { el.removeEventListener('keydown', onKey); hide() },
  }
}
