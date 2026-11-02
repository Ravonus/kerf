// The list of a Select (APG select-only combobox; docs/design/warp/redesign.md §5): warp's panel on every device. Focus
// stays on the trigger and aria-activedescendant names the active row; a long list adds a search input, which then holds
// focus the same way. A phone gets a modal sheet instead, where focus moves onto the rows, since mobile screen readers
// follow aria-activedescendant unreliably. The panel is built on first open and kept, so a page of closed selects costs
// a button each.
import { dialog } from './overlays'
import { place, pushLayer } from './layers'
import { isSheet, listKey, type Presentation } from './picker'
import { moveShuttle } from './shuttle'
import { uid } from './store'
import { typeahead } from './typeahead'
import type { ChangeReason } from './temporal'

const CHECK = '<svg data-icon viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.5 9.5 17 19 7"/></svg>'
const SEARCH = '<svg data-icon viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
const GAP = 6
const MAX_HEIGHT = 320

export type ListItem = { value: string; label: string; disabled?: boolean; hint?: string; group?: string }

export interface ListboxOptions {
  /** Given, it holds the list open or shut; left out, the list answers to the keys and presses alone. */
  open?: boolean
  label: string
  items: ListItem[]
  value: string
  presentation?: Presentation
  /** A search input over the rows. */
  search?: boolean
  onPick(value: string, reason: ChangeReason): void
  onOpenChange?(open: boolean): void
}

type Row = { el: HTMLElement; item: ListItem; top: number; height: number }

export function listbox(trigger: HTMLButtonElement, opts: ListboxOptions) {
  let o = opts
  const doc = trigger.ownerDocument
  const win = doc.defaultView!
  const id = uid('sel')
  const control = trigger.closest<HTMLElement>('[data-part="control"]') ?? trigger
  const typed = typeahead()
  let box: HTMLDialogElement | undefined
  let list: HTMLElement
  let face: HTMLElement
  let find: HTMLInputElement | undefined
  let empty: HTMLElement
  let all: Row[] = [] // every row built
  let rows: Row[] = [] // the ones arrows reach: enabled, and in the search's hits
  let at = -1
  let shown = false
  let sheet = false
  let sheetCtl: ReturnType<typeof dialog> | undefined
  let remove: (() => void) | undefined
  let frame = 0

  function el(tag: string, part: string, parent?: HTMLElement) {
    const n = doc.createElement(tag)
    n.dataset.part = part
    parent?.append(n)
    return n
  }

  function build() {
    box?.remove()
    box = doc.createElement('dialog')
    box.dataset.scope = 'select'
    box.dataset.part = 'content'
    box.setAttribute('popover', 'manual')
    box.setAttribute('aria-label', o.label)
    el('div', 'handle', box).setAttribute('aria-hidden', 'true')
    const head = el('div', 'sheet-head', box)
    head.append(doc.createElement('span'))
    head.firstElementChild!.textContent = o.label
    const done = el('button', 'done', head) as HTMLButtonElement
    done.type = 'button'
    done.textContent = 'Done'
    done.onclick = () => hide(true)
    find = undefined
    if (o.search) {
      const wrap = el('label', 'search', box)
      wrap.innerHTML = SEARCH
      find = doc.createElement('input')
      find.type = 'search'
      find.setAttribute('role', 'combobox')
      find.setAttribute('aria-label', `Search ${o.label}`)
      find.setAttribute('aria-expanded', 'true')
      find.setAttribute('aria-controls', id)
      find.setAttribute('aria-autocomplete', 'list')
      find.autocomplete = 'off'
      find.placeholder = 'Search'
      find.dataset.initial = ''
      find.oninput = filter
      wrap.append(find)
    }
    list = el('div', 'list', box)
    list.id = id
    list.setAttribute('role', 'listbox')
    list.setAttribute('aria-label', o.label)
    face = el('span', 'shuttle', list)
    all = []
    const groups = new Map<string, HTMLElement>()
    for (const item of o.items) {
      let parent = list
      if (item.group) {
        let group = groups.get(item.group)
        if (!group) {
          group = doc.createElement('div')
          group.setAttribute('role', 'group')
          group.setAttribute('aria-label', item.group)
          el('div', 'group-label', group).textContent = item.group
          list.append(group)
          groups.set(item.group, group)
        }
        parent = group
      }
      const row = el('div', 'item', parent)
      row.id = `${id}-${all.length}`
      row.setAttribute('role', 'option')
      if (item.disabled) row.setAttribute('aria-disabled', 'true')
      row.textContent = item.label
      if (item.hint) el('small', 'item-hint', row).textContent = item.hint
      el('span', 'indicator', row).innerHTML = CHECK
      all.push({ el: row, item, top: 0, height: 0 })
    }
    empty = el('p', 'empty', box)
    empty.textContent = 'No match'
    empty.hidden = true
    const rowAt = (e: Event) => rows.findIndex(r => r.el === (e.target as Element).closest('[role="option"]'))
    list.onpointermove = e => { if (e.pointerType === 'touch') return; const i = rowAt(e); if (i >= 0 && i !== at) go(i, false) }
    list.onmousedown = e => e.preventDefault() // focus stays where the keys are
    list.onclick = e => { const i = rowAt(e); if (i >= 0) pick(i, e.detail ? 'pointer' : 'keyboard') }
    box.addEventListener('keydown', onKey)
    box.addEventListener('focusout', onLeave)
    control.append(box)
  }

  function measure() {
    for (const r of rows) { r.top = r.el.offsetTop; r.height = r.el.offsetHeight }
  }

  function go(i: number, keyed = true) {
    const was = rows[at]
    if (was) { was.el.removeAttribute('data-highlighted'); was.el.removeAttribute('data-keyboard') }
    at = i
    const r = rows[i]
    if (!r) return host().removeAttribute('aria-activedescendant')
    r.el.setAttribute('data-highlighted', '')
    if (keyed) r.el.setAttribute('data-keyboard', '')
    moveShuttle(face, r.top, r.top + r.height)
    if (sheet && !find) r.el.focus({ preventScroll: true })
    else host().setAttribute('aria-activedescendant', r.el.id)
    if (keyed) r.el.scrollIntoView?.({ block: 'nearest' })
  }

  // what holds focus while the list is open
  const host = (): HTMLElement => find ?? trigger

  function filter() {
    const q = find!.value.trim().toLowerCase()
    const next: Row[] = []
    for (const r of all) {
      const hit = !q || r.item.label.toLowerCase().includes(q) || !!r.item.hint?.toLowerCase().includes(q)
      r.el.hidden = !hit
      if (hit && !r.item.disabled) next.push(r)
    }
    for (const g of list.querySelectorAll<HTMLElement>('[role="group"]')) g.hidden = !g.querySelector('[role="option"]:not([hidden])')
    empty.hidden = next.length > 0
    if (rows[at]) rows[at].el.removeAttribute('data-highlighted')
    rows = next
    at = -1
    measure()
    go(q ? 0 : Math.max(0, rows.findIndex(r => r.item.value === o.value)), false)
  }

  function mark() {
    for (const r of all) r.el.setAttribute('aria-selected', String(r.item.value === o.value))
  }

  function reposition() {
    frame = 0
    if (!box?.matches(':popover-open')) return
    const t = trigger.getBoundingClientRect()
    box.style.setProperty('--_avail', `${Math.round(Math.min(MAX_HEIGHT, Math.max(t.top, win.innerHeight - t.bottom) - GAP - 8))}px`)
    place(box, control, 'bottom', 'start', GAP)
  }
  const follow = (e: Event) => {
    if (box!.contains(e.target as Node) || frame) return
    frame = win.requestAnimationFrame(reposition)
  }

  function show(move?: 'first' | 'last') {
    if (shown || trigger.disabled) return
    shown = true
    if (!box) build()
    const b = box!
    mark()
    sheet = isSheet(trigger, o.presentation)
    if (find) { find.value = ''; for (const r of all) r.el.hidden = false; empty.hidden = true }
    rows = all.filter(r => !r.item.disabled)
    const start = move === 'last' ? rows.length - 1 : move === 'first' ? 0 : Math.max(0, rows.findIndex(r => r.item.value === o.value))
    trigger.setAttribute('aria-expanded', 'true')
    control.setAttribute('data-hold', '')
    if (sheet) {
      b.dataset.presentation = 'sheet'
      b.style.minInlineSize = ''
      b.removeAttribute('role')
      b.setAttribute('aria-modal', 'true')
      for (const r of all) r.el.tabIndex = -1
      if (!find && rows[start]) rows[start].el.dataset.initial = ''
      sheetCtl = dialog(b, { open: true, onClose: () => hide(true) })
      delete rows[start]?.el.dataset.initial
    } else {
      delete b.dataset.presentation
      b.setAttribute('role', 'none') // the popup is presentational: the listbox inside it is what the trigger controls
      b.removeAttribute('aria-modal')
      for (const r of all) r.el.removeAttribute('tabindex')
      trigger.setAttribute('aria-controls', id)
      b.style.minInlineSize = `${control.getBoundingClientRect().width}px`
      b.showPopover?.()
      ;(find ?? trigger).focus({ preventScroll: true }) // a dialog shown as a popover takes focus for itself, and Safari never gave it to a pressed button
      reposition()
      remove = pushLayer({ el: b, trigger: control, close: () => hide(true) })
      win.addEventListener('resize', follow)
      win.addEventListener('scroll', follow, true)
    }
    measure()
    at = -1
    face.setAttribute('data-instant', '')
    go(start, !!move)
    rows[start]?.el.scrollIntoView?.({ block: 'nearest' })
    void face.offsetWidth
    face.setAttribute('data-on', '')
    win.requestAnimationFrame(() => face.removeAttribute('data-instant'))
    o.onOpenChange?.(true)
  }

  function hide(refocus = false) {
    if (!shown) return
    shown = false
    const b = box!
    const r = rows[at]
    if (r) { r.el.removeAttribute('data-highlighted'); r.el.removeAttribute('data-keyboard') }
    at = -1
    typed.clear()
    host().removeAttribute('aria-activedescendant')
    trigger.setAttribute('aria-expanded', 'false')
    trigger.removeAttribute('aria-controls')
    control.removeAttribute('data-hold')
    win.removeEventListener('resize', follow)
    win.removeEventListener('scroll', follow, true)
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0
    if (sheetCtl) {
      sheetCtl.update({ open: false, onClose() {} })
      sheetCtl.destroy()
      sheetCtl = undefined
    } else {
      remove?.()
      remove = undefined
      if (b.matches?.(':popover-open')) b.hidePopover?.()
    }
    if (refocus) trigger.focus({ preventScroll: true })
    o.onOpenChange?.(false)
  }

  function pick(i: number, reason: ChangeReason) {
    const r = rows[i]
    hide(true)
    if (r && r.item.value !== o.value) o.onPick(r.item.value, reason)
  }

  function type(key: string) {
    const hit = typed.next(key, rows, at, r => r.item.label)
    if (hit) go(rows.indexOf(hit))
  }

  function onKey(e: KeyboardEvent) {
    if (e.isComposing || e.defaultPrevented) return
    const { key } = e
    const printable = key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
    if (!shown) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') { e.preventDefault(); show() }
      else if (key === 'Home' || key === 'End') { e.preventDefault(); show(key === 'Home' ? 'first' : 'last') }
      else if (printable) { e.preventDefault(); show(); if (!find) type(key) }
      return
    }
    if (key === 'Tab') return void (sheet ? hide(true) : pick(at, 'keyboard'))
    if (key === ' ' && typed.typing && !find) { e.preventDefault(); return type(key) }
    if (!rows.length) return
    const m = listKey(key, at, rows.length, { page: 8, typing: !!find })
    if (m.handled) {
      e.preventDefault()
      return m.pick ? pick(at, 'keyboard') : go(m.to)
    }
    if (printable && !find) { e.preventDefault(); type(key) }
  }

  // a press outside is the layer's; this is focus going elsewhere with no press, in the popover
  function onLeave(e: FocusEvent) {
    const to = e.relatedTarget as Node | null
    if (!shown || sheet || !to || box?.contains(to) || trigger.contains(to)) return
    hide()
  }

  const onClick = () => {
    if (shown) hide(true)
    else show()
  }

  trigger.addEventListener('click', onClick)
  trigger.addEventListener('keydown', onKey)
  trigger.addEventListener('focusout', onLeave)
  if (o.open) show()
  return {
    update(next: ListboxOptions) {
      const stale = next.items !== o.items || !!next.search !== !!o.search || next.label !== o.label
      o = next
      if (stale) {
        // a list that changed under an open panel closes: its rows, and so the active one, are gone
        hide()
        box?.remove()
        box = undefined
      }
      if (shown) mark()
      if (next.open !== undefined && next.open !== shown) { if (next.open) show(); else hide() }
    },
    destroy() {
      hide()
      box?.remove()
      trigger.removeEventListener('click', onClick)
      trigger.removeEventListener('keydown', onKey)
      trigger.removeEventListener('focusout', onLeave)
    },
  }
}
