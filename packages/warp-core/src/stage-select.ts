// A select drawn by a stage (APG select-only combobox): the trigger is a skinned button that keeps focus, and its list
// floats in the top layer as a stage of its own (`floatStage`), so it paints in the look it opened from and nothing
// under it clips or shows through. The rows answer to the keys, typeahead and the pointer, as warp's Select does.
import { place, pushLayer } from './layers'
import { listKey } from './picker'
import type { Action } from './store'
import { typeahead } from './typeahead'

/** Options for `stageSelect`. */
export interface StageSelectOptions {
  value: string
  onPick(value: string): void
}

/** Wires a trigger to the list its `aria-controls` names; the rows are its `[role="option"]`s, each with a `data-value`. */
export function stageSelect(
  trigger: HTMLButtonElement,
  opts: StageSelectOptions,
): Action<StageSelectOptions> {
  let o = opts,
    at = -1,
    shown = false,
    remove: (() => void) | undefined,
    frame = 0
  const doc = trigger.ownerDocument,
    win = doc.defaultView!,
    typed = typeahead()
  const list = () => doc.getElementById(trigger.getAttribute('aria-controls') ?? '')
  const float = () => list()?.closest<HTMLElement>('[popover]') ?? undefined
  const rows = () => [
    ...(list()?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? []),
  ]
  const locked = () => trigger.disabled

  function go(i: number, keyed = true) {
    const all = rows()
    all[at]?.removeAttribute('data-highlighted')
    at = i
    const r = all[i]
    if (!r) return trigger.removeAttribute('aria-activedescendant')
    r.setAttribute('data-highlighted', '')
    trigger.setAttribute('aria-activedescendant', r.id)
    if (keyed) r.scrollIntoView?.({ block: 'nearest' })
  }

  function reposition() {
    frame = 0
    const f = float()
    if (!f?.matches(':popover-open')) return
    f.style.minInlineSize = `${trigger.getBoundingClientRect().width}px`
    place(f, trigger, 'bottom', 'start', 4)
  }
  const follow = (e: Event) => {
    if ((e.type === 'scroll' && float()?.contains(e.target as Node)) || frame) return
    frame = win.requestAnimationFrame(reposition)
  }

  function show(move?: 'first' | 'last') {
    const f = float()
    if (shown || locked() || !f) return
    shown = true
    const all = rows()
    const start =
      move === 'last'
        ? all.length - 1
        : move === 'first'
          ? 0
          : Math.max(
              0,
              all.findIndex((r) => r.dataset.value === o.value),
            )
    trigger.setAttribute('aria-expanded', 'true')
    f.showPopover?.()
    reposition()
    remove = pushLayer({ el: f, trigger, close: () => hide(true) })
    win.addEventListener('resize', follow)
    win.addEventListener('scroll', follow, true)
    at = -1
    go(start, !!move)
  }

  function hide(refocus = false) {
    if (!shown) return
    shown = false
    rows()[at]?.removeAttribute('data-highlighted')
    at = -1
    typed.clear()
    trigger.removeAttribute('aria-activedescendant')
    trigger.setAttribute('aria-expanded', 'false')
    win.removeEventListener('resize', follow)
    win.removeEventListener('scroll', follow, true)
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0
    remove?.()
    remove = undefined
    const f = float()
    if (f?.matches(':popover-open')) f.hidePopover?.()
    if (refocus) trigger.focus({ preventScroll: true })
  }

  function pick(i: number) {
    const value = rows()[i]?.dataset.value
    hide(true)
    if (value !== undefined && value !== o.value) o.onPick(value)
  }

  function type(key: string) {
    const all = rows(),
      hit = typed.next(key, all, at, (r) => r.textContent ?? '')
    if (hit) go(all.indexOf(hit))
  }

  function onKey(e: KeyboardEvent) {
    if (e.isComposing || e.defaultPrevented) return
    const { key } = e,
      printable = key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
    if (!shown) {
      if (locked()) return
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        e.preventDefault()
        show()
      } else if (key === 'Home' || key === 'End') {
        e.preventDefault()
        show(key === 'Home' ? 'first' : 'last')
      } else if (printable) {
        e.preventDefault()
        show()
        type(key)
      }
      return
    }
    if (key === 'Tab') return pick(at)
    if (key === ' ' && typed.typing) {
      e.preventDefault()
      return type(key)
    }
    const m = listKey(key, at, rows().length, { page: 8 })
    if (m.handled) {
      e.preventDefault()
      return m.pick ? pick(at) : go(m.to)
    }
    if (printable) {
      e.preventDefault()
      type(key)
    }
  }

  const rowAt = (e: Event) =>
    rows().findIndex((r) => r === (e.target as Element).closest?.('[role="option"]'))
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const i = rowAt(e)
    if (i >= 0 && i !== at) go(i, false)
  }
  const onDown = (e: MouseEvent) => e.preventDefault() // focus stays on the trigger, where the keys are
  // A row's click would also reach a <label> round the select and press the trigger again, so the list keeps it.
  const onPress = (e: MouseEvent) => {
    e.preventDefault()
    const i = rowAt(e)
    if (i >= 0) pick(i)
  }
  const onClick = () => (shown ? hide(true) : show())
  const onLeave = () => hide()

  const wired = list()
  trigger.addEventListener('click', onClick)
  trigger.addEventListener('keydown', onKey)
  trigger.addEventListener('blur', onLeave)
  wired?.addEventListener('pointermove', onMove)
  wired?.addEventListener('mousedown', onDown)
  wired?.addEventListener('click', onPress)
  return {
    update(next) {
      o = next
    },
    destroy() {
      hide()
      trigger.removeEventListener('click', onClick)
      trigger.removeEventListener('keydown', onKey)
      trigger.removeEventListener('blur', onLeave)
      wired?.removeEventListener('pointermove', onMove)
      wired?.removeEventListener('mousedown', onDown)
      wired?.removeEventListener('click', onPress)
    },
  }
}
