// Real hover, focus and press, written to anything with a `.value`. No framework, no network.
// Hover ignores touch, so it stays false on a phone. Focus is what the browser would ring (`:focus-visible`). Each flag
// counts the elements holding it, so a row bound twice falls only when the last one lets go, and `destroy` lets go:
// an element removed under the pointer gets no pointerleave, and that is how a hover sticks.

export interface Flag { value: boolean }
export interface Interactive { hover: Flag; focus: Flag; pressed: Flag }

const holders = new WeakMap<Flag, Set<Element>>()

function hold(flag: Flag, el: Element, on: boolean) {
  let set = holders.get(flag)
  if (!set) holders.set(flag, (set = new Set()))
  if (on) set.add(el)
  else set.delete(el)
  const any = set.size > 0
  if (flag.value !== any) flag.value = any
}

export function interact(el: HTMLElement, ui: Interactive) {
  const doc = el.ownerDocument, win = doc.defaultView!
  const hoverable = win.matchMedia?.('(hover: hover)').matches ?? true
  const release = () => { hold(ui.hover, el, false); hold(ui.focus, el, false); hold(ui.pressed, el, false) }
  const up = () => hold(ui.pressed, el, false)
  const on: [EventTarget, string, (e: any) => void][] = [
    [el, 'pointerenter', (e: PointerEvent) => { if (e.pointerType !== 'touch') hold(ui.hover, el, true) }],
    [el, 'pointerleave', (e: PointerEvent) => { if (e.pointerType !== 'touch') hold(ui.hover, el, false) }],
    [el, 'focusin', () => { if (el.matches(':focus-visible, :has(:focus-visible)')) hold(ui.focus, el, true) }],
    [el, 'focusout', (e: FocusEvent) => { if (!el.contains(e.relatedTarget as Node | null)) hold(ui.focus, el, false) }],
    [el, 'pointerdown', () => hold(ui.pressed, el, true)],
    [el, 'keydown', (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') hold(ui.pressed, el, true) }],
    [el, 'keyup', up],
    [win, 'pointerup', up],
    [win, 'pointercancel', up],
    [win, 'blur', up],
    // Nothing fires a pointerleave for a tab that went away.
    [doc, 'visibilitychange', () => { if (doc.visibilityState === 'hidden') release() }],
    [win, 'pagehide', release],
  ]
  for (const [target, type, fn] of on) target.addEventListener(type, fn)
  if (hoverable && el.matches(':hover')) hold(ui.hover, el, true) // hydrated under the pointer
  return {
    update() {},
    destroy() {
      for (const [target, type, fn] of on) target.removeEventListener(type, fn)
      release()
    },
  }
}
