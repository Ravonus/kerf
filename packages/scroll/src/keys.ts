// Keyboard scrolling, with the keys and step sizes browsers use. A key the area can't act on (already at that edge)
// is left alone, so it reaches the scroller outside or the page.
import type { Engine } from './engine'
import { pageStep } from './wheel'
import type { Axis } from './types'

/** Roles whose widgets use the arrow keys themselves. */
const WIDGETS =
  /^(?:slider|listbox|menu|menubar|grid|treegrid|tree|tablist|radiogroup|spinbutton|combobox|textbox|toolbar|option|menuitem|tab|radio)$/

/** Whether keys typed at `el` belong to it rather than to scrolling. `space` asks about the space bar. */
export function ownsKeys(el: Element | null, space: boolean) {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const t = (el as HTMLInputElement).type
    return space || !/^(?:checkbox|radio|button|submit|reset|image|file|color)$/.test(t)
  }
  const role = el.getAttribute('role') ?? ''
  if (WIDGETS.test(role)) return true
  if (space)
    return (
      tag === 'BUTTON' ||
      tag === 'SUMMARY' ||
      tag === 'A' ||
      role === 'button' ||
      role === 'checkbox' ||
      role === 'switch'
    )
  return false
}

/** The move a key asks for, or null. */
export function keyMove(
  e: Engine,
  ev: KeyboardEvent,
): { axis: Axis; by?: number; to?: number } | null {
  const line = e.o.lineHeight
  const { x, y } = e.ax
  switch (ev.key) {
    case 'ArrowDown':
      return { axis: 'y', by: line }
    case 'ArrowUp':
      return { axis: 'y', by: -line }
    case 'ArrowRight':
      return { axis: 'x', by: line }
    case 'ArrowLeft':
      return { axis: 'x', by: -line }
    case 'PageDown':
      return { axis: 'y', by: pageStep(y.view) }
    case 'PageUp':
      return { axis: 'y', by: -pageStep(y.view) }
    case ' ':
      return { axis: 'y', by: (ev.shiftKey ? -1 : 1) * pageStep(y.view) }
    case 'Home':
      return y.max > 0 || !x.on
        ? { axis: 'y', to: y.min }
        : { axis: 'x', to: e.rtl ? x.max : x.min }
    case 'End':
      return y.max > 0 || !x.on
        ? { axis: 'y', to: y.max }
        : { axis: 'x', to: e.rtl ? x.min : x.max }
    default:
      return null
  }
}

/** Listen for keys on the viewport and anything focused inside it. Returns the cleanup. */
export function keyInput(e: Engine) {
  const onKey = (ev: KeyboardEvent) => {
    if (!e.o.keyboard || ev.defaultPrevented || ev.altKey || ev.metaKey) return
    if (ev.ctrlKey && ev.key !== 'Home' && ev.key !== 'End') return
    const move = keyMove(e, ev)
    if (!move || ownsKeys(ev.target as Element, ev.key === ' ')) return
    const a = e.ax[move.axis]
    const heading = a.anim?.kind === 'tween' ? a.anim.to : a.pos
    const dir = move.to !== undefined ? Math.sign(move.to - heading) : Math.sign(move.by ?? 0)
    if (!a.on || !e.canMove(move.axis, dir)) return
    ev.preventDefault()
    if (move.to !== undefined) e.tweenTo(move.axis, move.to, 'key')
    else e.tweenBy(move.axis, move.by ?? 0, 'key')
  }
  e.vp.addEventListener('keydown', onKey)
  return () => e.vp.removeEventListener('keydown', onKey)
}
