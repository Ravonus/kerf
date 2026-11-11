// A select drawn by a stage (APG select-only combobox): the trigger is a skinned button that keeps focus, and its list
// floats in the top layer as a stage of its own (`floatStage`), so it paints in the look it opened from and nothing
// under it clips or shows through. The rows answer to the keys, typeahead and the pointer, as veneer's Select does.
import { place, pushLayer } from './layers'
import { listKey } from './picker'
import type { Action } from './store'
import { typeahead } from './typeahead'

/** Options for `stageSelect`. */
export interface StageSelectOptions {
  value: string
  onPick(value: string): void
}

function selectKeys(h: {
  shown: () => boolean
  locked: () => boolean
  show: (move?: 'first' | 'last') => void
  type: (key: string) => void
  typed: ReturnType<typeof typeahead>
  at: () => number
  rows: () => HTMLElement[]
  pick: (i: number) => void
  go: (i: number) => void
}) {
  const { shown, locked, show, type, typed, at, rows, pick, go } = h
  return (e: KeyboardEvent) => {
    if (e.isComposing || e.defaultPrevented) return
    const { key } = e,
      printable = key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
    if (!shown()) {
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
    if (key === 'Tab') return pick(at())
    if (key === ' ' && typed.typing) {
      e.preventDefault()
      return type(key)
    }
    const m = listKey(key, at(), rows().length, { page: 8 })
    if (m.handled) {
      e.preventDefault()
      return m.pick ? pick(at()) : go(m.to)
    }
    if (printable) {
      e.preventDefault()
      type(key)
    }
  }
}

function selectPointer(
  rows: () => HTMLElement[],
  at: () => number,
  go: (i: number, keyed?: boolean) => void,
  pick: (i: number) => void,
) {
  const rowAt = (e: Event) =>
    rows().findIndex((r) => r === (e.target as Element).closest?.('[role="option"]'))
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const i = rowAt(e)
    if (i >= 0 && i !== at()) go(i, false)
  }
  const onDown = (e: MouseEvent) => e.preventDefault() // focus stays on the trigger, where the keys are
  // A row's click would also reach a <label> round the select and press the trigger again, so the list keeps it.
  const onPress = (e: MouseEvent) => {
    e.preventDefault()
    const i = rowAt(e)
    if (i >= 0) pick(i)
  }
  return { onMove, onDown, onPress }
}

function followSelect(
  win: Window,
  trigger: HTMLButtonElement,
  float: () => HTMLElement | undefined,
) {
  let frame = 0
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
  const cancel = () => {
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0
  }
  return { reposition, follow, cancel }
}

type SelectState = { at: number; shown: boolean; remove?: (() => void) | undefined }

function selectVisibility(h: {
  state: SelectState
  float: () => HTMLElement | undefined
  locked: () => boolean
  rows: () => HTMLElement[]
  trigger: HTMLButtonElement
  options: () => StageSelectOptions
  reposition: () => void
  win: Window
  follow: (e: Event) => void
  go: (i: number, keyed?: boolean) => void
  typed: ReturnType<typeof typeahead>
  cancel: () => void
}) {
  const {
    state,
    float,
    locked,
    rows,
    trigger,
    options,
    reposition,
    win,
    follow,
    go,
    typed,
    cancel,
  } = h
  function show(move?: 'first' | 'last') {
    const f = float()
    if (state.shown || locked() || !f) return
    state.shown = true
    const all = rows()
    const start =
      move === 'last'
        ? all.length - 1
        : move === 'first'
          ? 0
          : Math.max(
              0,
              all.findIndex((r) => r.dataset.value === options().value),
            )
    trigger.setAttribute('aria-expanded', 'true')
    f.showPopover?.()
    reposition()
    state.remove = pushLayer({ el: f, trigger, close: () => hide(true) })
    win.addEventListener('resize', follow)
    win.addEventListener('scroll', follow, true)
    state.at = -1
    go(start, !!move)
  }

  function hide(refocus = false) {
    if (!state.shown) return
    state.shown = false
    rows()[state.at]?.removeAttribute('data-highlighted')
    state.at = -1
    typed.clear()
    trigger.removeAttribute('aria-activedescendant')
    trigger.setAttribute('aria-expanded', 'false')
    win.removeEventListener('resize', follow)
    win.removeEventListener('scroll', follow, true)
    cancel()
    const remove = state.remove
    remove?.()
    state.remove = undefined
    const f = float()
    if (f?.matches(':popover-open')) f.hidePopover?.()
    if (refocus) trigger.focus({ preventScroll: true })
  }
  return { show, hide }
}

function highlightSelect(
  state: SelectState,
  trigger: HTMLButtonElement,
  rows: () => HTMLElement[],
  i: number,
  keyed = true,
) {
  const all = rows()
  all[state.at]?.removeAttribute('data-highlighted')
  state.at = i
  const r = all[i]
  if (!r) return trigger.removeAttribute('aria-activedescendant')
  r.setAttribute('data-highlighted', '')
  trigger.setAttribute('aria-activedescendant', r.id)
  if (keyed) r.scrollIntoView?.({ block: 'nearest' })
}

function pickSelect(
  i: number,
  rows: () => HTMLElement[],
  hide: (refocus?: boolean) => void,
  options: () => StageSelectOptions,
) {
  const value = rows()[i]?.dataset.value
  hide(true)
  if (value !== undefined && value !== options().value) options().onPick(value)
}

function selectRows(doc: Document, trigger: HTMLButtonElement) {
  const list = () => doc.getElementById(trigger.getAttribute('aria-controls') ?? '')
  const float = () => list()?.closest<HTMLElement>('[popover]') ?? undefined
  const rows = () => [
    ...(list()?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? []),
  ]
  return { list, float, rows }
}

/** Wires a trigger to the list its `aria-controls` names; the rows are its `[role="option"]`s, each with a `data-value`. */
export function stageSelect(
  trigger: HTMLButtonElement,
  opts: StageSelectOptions,
): Action<StageSelectOptions> {
  let o = opts
  const state: SelectState = { at: -1, shown: false }
  const doc = trigger.ownerDocument,
    win = doc.defaultView!,
    typed = typeahead()
  const { list, float, rows } = selectRows(doc, trigger)
  const locked = () => trigger.disabled

  const go = (i: number, keyed = true) => highlightSelect(state, trigger, rows, i, keyed)

  const { reposition, follow, cancel } = followSelect(win, trigger, float)

  const { show, hide } = selectVisibility({
    state,
    float,
    locked,
    rows,
    trigger,
    options: () => o,
    reposition,
    win,
    follow,
    go,
    typed,
    cancel,
  })

  const pick = (i: number) => pickSelect(i, rows, hide, () => o)

  function type(key: string) {
    const all = rows(),
      hit = typed.next(key, all, state.at, (r) => r.textContent ?? '')
    if (hit) go(all.indexOf(hit))
  }

  const onKey = selectKeys({
    shown: () => state.shown,
    locked,
    show,
    type,
    typed,
    at: () => state.at,
    rows,
    pick,
    go,
  })

  const { onMove, onDown, onPress } = selectPointer(rows, () => state.at, go, pick)
  const onClick = () => (state.shown ? hide(true) : show())
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
