// What the pickers share beyond the calendar (04 §1.2, §2): the one panel that is an anchored popover on a desktop and
// a modal sheet on a phone, the list keys of a slot list or combobox, and the default range presets.
import { dialog, popover, type PopoverOptions } from './overlays'
import { addDays, addMonths, monthStart, type DateRange, type IsoDate } from './temporal'
import { place, pushLayer, type Align, type Side } from './layers'
import { leave, stay } from './motion'

/** How a picker opens: anchored, as a sheet, or whichever fits. */
export type Presentation = 'auto' | 'popover' | 'sheet'

/** Sheet or popover: under 600px of viewport a popover won't fit. `[data-form="phone"]` is the specimen's phone frame. */
export function isSheet(el: Element, presentation: Presentation = 'auto') {
  if (presentation !== 'auto') return presentation === 'sheet'
  const frame = el.closest<HTMLElement>('[data-form]')
  return frame
    ? frame.dataset.form === 'phone'
    : (el.ownerDocument.defaultView?.innerWidth ?? 1024) < 600
}

/** Options for a picker's panel. */
export interface PanelOptions {
  open: boolean
  trigger: HTMLElement
  onClose(): void
  presentation?: Presentation | undefined
  side?: Side | undefined
  align?: Align | undefined
}

/**
 * The picker panel, a `<dialog popover="manual">`: decided each time it opens, `popover()` anchors it (focus stays
 * non-modal, the field keeps :focus-within) or `dialog()` opens it modal as the sheet. `data-state="open"` holds its
 * sweep; focus lands on the panel's `[data-initial]`.
 */
export function pickerPanel(el: HTMLDialogElement, opts: PanelOptions) {
  let o = opts
  let cur: { update(n: PopoverOptions): void; destroy(): void } | null = null
  const close = () => o.onClose()
  const sync = () => {
    if (o.open && !cur) {
      if (isSheet(el, o.presentation)) {
        el.dataset.presentation = 'sheet'
        el.dataset.state = 'open'
        el.setAttribute('aria-modal', 'true')
        cur = dialog(el, { open: true, onClose: close })
      } else {
        delete el.dataset.presentation
        el.removeAttribute('aria-modal')
        cur = popover(el, {
          open: true,
          trigger: o.trigger,
          onClose: close,
          side: o.side,
          align: o.align,
        })
      }
    } else if (!o.open && cur) {
      cur.update({ open: false, trigger: o.trigger, onClose: close })
      cur.destroy()
      cur = null
    }
  }
  sync()
  return {
    update(next: PanelOptions) {
      o = next
      sync()
    },
    destroy() {
      cur?.destroy()
    },
  }
}

export interface ListMove {
  to: number
  pick?: boolean
  handled: boolean
}

/** A slot list or combobox's keys over `count` options: arrows, a page of `page`, Home/End, Enter (and Space, unless typing). */
export function listKey(
  key: string,
  at: number,
  count: number,
  { page = 4, wrap = false, typing = false } = {},
): ListMove {
  const step = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page }[key]
  if (step)
    return {
      to:
        wrap && Math.abs(step) === 1
          ? (at + step + count) % count
          : Math.max(0, Math.min(count - 1, at + step)),
      handled: true,
    }
  if (!typing && key === 'Home') return { to: 0, handled: true }
  if (!typing && key === 'End') return { to: count - 1, handled: true }
  if (key === 'Enter' || (!typing && key === ' ')) return { to: at, pick: true, handled: true }
  return { to: at, handled: false }
}

/** A shortcut in a range picker. */
export type RangePreset = {
  id: string
  label: string
  range: (today: IsoDate, weekStart: number) => DateRange
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** The rail's defaults (04 DateRangeField). Today and Yesterday are the locale's own words. */
export const defaultPresets = (locale: string): RangePreset[] => {
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const span = (start: string, end: string) => ({ start: start as IsoDate, end: end as IsoDate })
  return [
    { id: 'today', label: capital(rel.format(0, 'day')), range: (t) => span(t, t) },
    {
      id: 'yesterday',
      label: capital(rel.format(-1, 'day')),
      range: (t) => span(addDays(t, -1), addDays(t, -1)),
    },
    { id: '7d', label: 'Last 7 days', range: (t) => span(addDays(t, -6), t) },
    { id: '30d', label: 'Last 30 days', range: (t) => span(addDays(t, -29), t) },
    { id: 'month', label: 'This month', range: (t) => span(monthStart(t), t) },
    {
      id: 'lastmonth',
      label: 'Last month',
      range: (t) => span(monthStart(addMonths(t, -1)), addDays(monthStart(t), -1)),
    },
    { id: 'ytd', label: 'Year to date', range: (t) => span(`${t.slice(0, 4)}-01-01`, t) },
  ]
}

/**
 * The popup of a combobox (04 §3, APG): anchored like a popover, but presentational: focus never leaves the input, and
 * the input owns the keys. It is a layer, so Escape closes it before any dialog around it (the input sees that as
 * `defaultPrevented`), and `onClose` hears that and a press outside.
 */
export function comboPopup(
  el: HTMLElement,
  opts: { open: boolean; anchor: HTMLElement; onClose(): void },
) {
  let o = opts
  const win = el.ownerDocument.defaultView!
  const reposition = () => el.matches(':popover-open') && place(el, o.anchor, 'bottom', 'start', 8)
  let shown = false
  let remove: (() => void) | undefined
  const sync = () => {
    if (o.open === shown) return
    shown = o.open
    if (shown) {
      const back = stay(el)
      el.dataset.state = 'open'
      if (back) {
        remove = pushLayer({ el, trigger: o.anchor, close: () => o.onClose() })
        return
      }
      el.style.minInlineSize = `${o.anchor.getBoundingClientRect().width}px`
      el.showPopover?.()
      reposition()
      win.addEventListener('resize', reposition)
      win.addEventListener('scroll', reposition, true)
      remove = pushLayer({ el, trigger: o.anchor, close: () => o.onClose() })
    } else off()
  }
  const off = () => {
    remove?.()
    remove = undefined
    leave(el, () => {
      if (el.matches?.(':popover-open')) el.hidePopover?.()
      win.removeEventListener('resize', reposition)
      win.removeEventListener('scroll', reposition, true)
    })
  }
  sync()
  return {
    update(next: typeof opts) {
      o = next
      sync()
    },
    destroy: off,
  }
}
