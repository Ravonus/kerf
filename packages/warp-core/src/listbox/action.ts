import { dialog } from '../overlays'
import { place, pushLayer } from '../layers'
import { isSheet, listKey } from '../picker'
import { moveShuttle } from '../shuttle'
import { uid } from '../store'
import { typeahead } from '../typeahead'
import type { ChangeReason } from '../temporal'
import type { ListboxOptions, ListItem } from '../listbox'

const CHECK =
  '<svg data-icon viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.5 9.5 17 19 7"/></svg>'
const SEARCH =
  '<svg data-icon viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
const GAP = 6
const MAX_HEIGHT = 320
type Row = { el: HTMLElement; item: ListItem; top: number; height: number }

export class ListboxAction {
  #trigger: HTMLButtonElement
  #o!: ListboxOptions
  #doc!: Document
  #win!: Window & typeof globalThis
  #id!: string
  #control!: HTMLElement
  #typed!: ReturnType<typeof typeahead>
  #box!: HTMLDialogElement | undefined
  #list!: HTMLElement
  #face!: HTMLElement
  #find!: HTMLInputElement | undefined
  #empty!: HTMLElement
  #all!: Row[] // every row built
  #rows!: Row[] // the ones arrows reach: enabled, and in the search's hits
  #at!: number
  #shown!: boolean
  #sheet!: boolean
  #sheetCtl!: ReturnType<typeof dialog> | undefined
  #remove!: (() => void) | undefined
  #frame!: number
  constructor(trigger: HTMLButtonElement, opts: ListboxOptions) {
    this.#trigger = trigger
    this.#o = opts
    this.#doc = this.#trigger.ownerDocument
    this.#win = this.#doc.defaultView!
    this.#id = uid('sel')
    this.#control = this.#trigger.closest<HTMLElement>('[data-part="control"]') ?? this.#trigger
    this.#typed = typeahead()
    this.#all = []
    this.#rows = []
    this.#at = -1
    this.#shown = false
    this.#sheet = false
    this.#frame = 0
    this.#trigger.addEventListener('click', this.#onClick)
    this.#trigger.addEventListener('keydown', this.#onKey)
    this.#trigger.addEventListener('focusout', this.#onLeave)
    if (this.#o.open) this.#show()
  }
  #locked() {
    return this.#trigger.disabled || this.#trigger.getAttribute('aria-readonly') === 'true'
  }
  #el(tag: string, part: string, parent?: HTMLElement) {
    const n = this.#doc.createElement(tag)
    n.dataset.part = part
    parent?.append(n)
    return n
  }
  #build() {
    this.#box?.remove()
    this.#box = this.#doc.createElement('dialog')
    this.#box.dataset.scope = 'select'
    this.#box.dataset.part = 'content'
    this.#box.setAttribute('popover', 'manual')
    this.#box.setAttribute('aria-label', this.#o.label)
    this.#el('div', 'handle', this.#box).setAttribute('aria-hidden', 'true')
    const head = this.#el('div', 'sheet-head', this.#box)
    head.append(this.#doc.createElement('span'))
    head.firstElementChild!.textContent = this.#o.label
    const done = this.#el('button', 'done', head) as HTMLButtonElement
    done.type = 'button'
    done.textContent = 'Done'
    done.onclick = () => this.#hide(true)
    this.#find = undefined
    if (this.#o.search) {
      const wrap = this.#el('label', 'search', this.#box)
      // oxlint-disable-next-line weft/no-html-sink -- SEARCH is a constant in this file
      wrap.innerHTML = SEARCH
      this.#find = this.#doc.createElement('input')
      this.#find.type = 'search'
      this.#find.setAttribute('role', 'combobox')
      this.#find.setAttribute('aria-label', `Search ${this.#o.label}`)
      this.#find.setAttribute('aria-expanded', 'true')
      this.#find.setAttribute('aria-controls', this.#id)
      this.#find.setAttribute('aria-autocomplete', 'list')
      this.#find.autocomplete = 'off'
      this.#find.placeholder = 'Search'
      this.#find.dataset.initial = ''
      this.#find.oninput = this.#filter
      wrap.append(this.#find)
    }
    this.#list = this.#el('div', 'list', this.#box)
    this.#list.id = this.#id
    this.#list.setAttribute('role', 'listbox')
    this.#list.setAttribute('aria-label', this.#o.label)
    if (this.#o.multiple) this.#list.setAttribute('aria-multiselectable', 'true')
    this.#face = this.#el('span', 'shuttle', this.#list)
    this.#all = []
    this.#buildRows()
    this.#empty = this.#el('p', 'empty', this.#box)
    this.#empty.textContent = 'No match'
    this.#empty.hidden = true
    const rowAt = (e: Event) => {
      const target = (e.target as Element).closest?.('[role="option"]')
      return this.#rows.findIndex((r) => r.el === target)
    }
    this.#list.onpointermove = (e) => {
      if (e.pointerType === 'touch') return
      const i = rowAt(e)
      if (i >= 0 && i !== this.#at) this.#go(i, false)
    }
    this.#list.onmousedown = (e) => e.preventDefault() // focus stays where the keys are
    this.#list.onclick = (e) => {
      const i = rowAt(e)
      if (i >= 0) this.#pick(i, e.detail ? 'pointer' : 'keyboard')
    }
    this.#box.addEventListener('keydown', this.#onKey)
    this.#box.addEventListener('focusout', this.#onLeave)
    this.#control.append(this.#box)
  }
  #buildRows() {
    const groups = new Map<string, HTMLElement>()
    for (const item of this.#o.items) {
      let parent = this.#list
      if (item.group) {
        let group = groups.get(item.group)
        if (!group) {
          group = this.#doc.createElement('div')
          group.setAttribute('role', 'group')
          group.setAttribute('aria-label', item.group)
          this.#el('div', 'group-label', group).textContent = item.group
          this.#list.append(group)
          groups.set(item.group, group)
        }
        parent = group
      }
      const row = this.#el('div', 'item', parent)
      row.id = `${this.#id}-${this.#all.length}`
      row.setAttribute('role', 'option')
      if (item.disabled) row.setAttribute('aria-disabled', 'true')
      row.textContent = item.label
      if (item.hint) this.#el('small', 'item-hint', row).textContent = item.hint
      // oxlint-disable-next-line weft/no-html-sink -- CHECK is a constant in this file
      this.#el('span', 'indicator', row).innerHTML = CHECK
      this.#all.push({ el: row, item, top: 0, height: 0 })
    }
  }
  #measure() {
    for (const r of this.#rows) {
      r.top = r.el.offsetTop
      r.height = r.el.offsetHeight
    }
  }
  #go(i: number, keyed = true) {
    const was = this.#rows[this.#at]
    if (was) {
      was.el.removeAttribute('data-highlighted')
      was.el.removeAttribute('data-keyboard')
    }
    this.#at = i
    const r = this.#rows[i]
    if (!r) return this.#host().removeAttribute('aria-activedescendant')
    r.el.setAttribute('data-highlighted', '')
    if (keyed) r.el.setAttribute('data-keyboard', '')
    moveShuttle(this.#face, r.top, r.top + r.height)
    if (this.#sheet && !this.#find) r.el.focus({ preventScroll: true })
    else this.#host().setAttribute('aria-activedescendant', r.el.id)
    if (keyed) r.el.scrollIntoView?.({ block: 'nearest' })
  }
  // what holds focus while the list is open
  #host(): HTMLElement {
    return this.#find ?? this.#trigger
  }
  #filter = () => {
    const q = this.#find!.value.trim().toLowerCase()
    const next: Row[] = []
    for (const r of this.#all) {
      const hit =
        !q || r.item.label.toLowerCase().includes(q) || !!r.item.hint?.toLowerCase().includes(q)
      r.el.hidden = !hit
      if (hit && !r.item.disabled) next.push(r)
    }
    for (const g of this.#list.querySelectorAll<HTMLElement>('[role="group"]'))
      g.hidden = !g.querySelector('[role="option"]:not([hidden])')
    this.#empty.hidden = next.length > 0
    this.#rows[this.#at]?.el.removeAttribute('data-highlighted')
    this.#rows = next
    this.#at = -1
    this.#measure()
    this.#go(
      q
        ? 0
        : Math.max(
            0,
            this.#rows.findIndex((r) => this.#on(r.item.value)),
          ),
      false,
    )
  }
  #on = (v: string) => (this.#o.multiple ? !!this.#o.values?.includes(v) : v === this.#o.value)
  #mark() {
    for (const r of this.#all) r.el.setAttribute('aria-selected', String(this.#on(r.item.value)))
  }
  #reposition = () => {
    this.#frame = 0
    if (!this.#box?.matches(':popover-open')) return
    const t = this.#trigger.getBoundingClientRect()
    this.#box.style.setProperty(
      '--_avail',
      `${Math.round(Math.min(MAX_HEIGHT, Math.max(t.top, this.#win.innerHeight - t.bottom) - GAP - 8))}px`,
    )
    place(this.#box, this.#control, 'bottom', 'start', GAP)
  }
  #follow = (e: Event) => {
    // a resize's target is the window, which no node contains; the panel's own scroll needn't move it
    if ((e.type === 'scroll' && this.#box!.contains(e.target as Node)) || this.#frame) return
    this.#frame = this.#win.requestAnimationFrame(this.#reposition)
  }
  #show(move?: 'first' | 'last') {
    if (this.#shown || this.#locked()) return
    this.#shown = true
    if (!this.#box) this.#build()
    const b = this.#box!
    this.#mark()
    this.#sheet = isSheet(this.#trigger, this.#o.presentation)
    if (this.#find) {
      this.#find.value = ''
      for (const r of this.#all) r.el.hidden = false
      this.#empty.hidden = true
    }
    this.#rows = this.#all.filter((r) => !r.item.disabled)
    const start =
      move === 'last'
        ? this.#rows.length - 1
        : move === 'first'
          ? 0
          : Math.max(
              0,
              this.#rows.findIndex((r) => this.#on(r.item.value)),
            )
    this.#trigger.setAttribute('aria-expanded', 'true')
    this.#control.setAttribute('data-hold', '')
    if (this.#sheet) {
      b.dataset.presentation = 'sheet'
      b.style.minInlineSize = ''
      b.removeAttribute('role')
      b.setAttribute('aria-modal', 'true')
      for (const r of this.#all) r.el.tabIndex = -1
      if (!this.#find && this.#rows[start]) this.#rows[start].el.dataset.initial = ''
      this.#sheetCtl = dialog(b, { open: true, onClose: () => this.#hide(true) })
      delete this.#rows[start]?.el.dataset.initial
    } else {
      delete b.dataset.presentation
      b.setAttribute('role', 'none') // the popup is presentational: the listbox inside it is what the trigger controls
      b.removeAttribute('aria-modal')
      for (const r of this.#all) r.el.removeAttribute('tabindex')
      this.#trigger.setAttribute('aria-controls', this.#id)
      b.style.minInlineSize = `${this.#control.getBoundingClientRect().width}px`
      b.showPopover?.()
      ;(this.#find ?? this.#trigger).focus({ preventScroll: true }) // a dialog shown as a popover takes focus for itself, and Safari never gave it to a pressed button
      this.#reposition()
      this.#remove = pushLayer({ el: b, trigger: this.#control, close: () => this.#hide(true) })
      this.#win.addEventListener('resize', this.#follow)
      this.#win.addEventListener('scroll', this.#follow, true)
    }
    this.#measure()
    this.#at = -1
    this.#face.setAttribute('data-instant', '')
    this.#go(start, !!move)
    this.#rows[start]?.el.scrollIntoView?.({ block: 'nearest' })
    void this.#face.offsetWidth
    this.#face.setAttribute('data-on', '')
    this.#win.requestAnimationFrame(() => this.#face.removeAttribute('data-instant'))
    this.#o.onOpenChange?.(true)
  }
  #hide(refocus = false) {
    if (!this.#shown) return
    this.#shown = false
    const b = this.#box!
    const r = this.#rows[this.#at]
    if (r) {
      r.el.removeAttribute('data-highlighted')
      r.el.removeAttribute('data-keyboard')
    }
    this.#at = -1
    this.#typed.clear()
    this.#host().removeAttribute('aria-activedescendant')
    this.#trigger.setAttribute('aria-expanded', 'false')
    this.#trigger.removeAttribute('aria-controls')
    this.#control.removeAttribute('data-hold')
    this.#win.removeEventListener('resize', this.#follow)
    this.#win.removeEventListener('scroll', this.#follow, true)
    if (this.#frame) this.#win.cancelAnimationFrame(this.#frame)
    this.#frame = 0
    if (this.#sheetCtl) {
      this.#sheetCtl.update({ open: false, onClose() {} })
      this.#sheetCtl.destroy()
      this.#sheetCtl = undefined
    } else {
      this.#remove?.()
      this.#remove = undefined
      if (b.matches?.(':popover-open')) b.hidePopover?.()
    }
    if (refocus) this.#trigger.focus({ preventScroll: true })
    this.#o.onOpenChange?.(false)
  }
  #pick(i: number, reason: ChangeReason) {
    const r = this.#rows[i]
    if (this.#o.multiple) return void (r && this.#o.onPick(r.item.value, reason)) // a list of many stays open
    this.#hide(true)
    if (r && r.item.value !== this.#o.value) this.#o.onPick(r.item.value, reason)
  }
  #type(key: string) {
    const hit = this.#typed.next(key, this.#rows, this.#at, (r) => r.item.label)
    if (hit) this.#go(this.#rows.indexOf(hit))
  }
  #onKey = (e: KeyboardEvent) => {
    if (e.isComposing || e.defaultPrevented) return
    const { key } = e
    const printable = key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
    if (!this.#shown) {
      if (this.#locked()) return
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        e.preventDefault()
        this.#show()
      } else if (key === 'Home' || key === 'End') {
        e.preventDefault()
        this.#show(key === 'Home' ? 'first' : 'last')
      } else if (printable) {
        e.preventDefault()
        this.#show()
        if (!this.#find) this.#type(key)
      }
      return
    }
    if (key === 'Tab') {
      if (this.#sheet || this.#o.multiple) this.#hide(true)
      else this.#pick(this.#at, 'keyboard')
      return
    }
    if (key === ' ' && this.#typed.typing && !this.#find) {
      e.preventDefault()
      return this.#type(key)
    }
    if (!this.#rows.length) return
    const m = listKey(key, this.#at, this.#rows.length, { page: 8, typing: !!this.#find })
    if (m.handled) {
      e.preventDefault()
      return m.pick ? this.#pick(this.#at, 'keyboard') : this.#go(m.to)
    }
    if (printable && !this.#find) {
      e.preventDefault()
      this.#type(key)
    }
  }
  // a press outside is the layer's; this is focus going elsewhere with no press, in the popover
  #onLeave = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null
    if (!this.#shown || this.#sheet || !to || this.#box?.contains(to) || this.#trigger.contains(to))
      return
    this.#hide()
  }
  #onClick = () => {
    if (this.#shown) this.#hide(true)
    else this.#show()
  }
  update(next: ListboxOptions) {
    const stale =
      next.items !== this.#o.items ||
      !!next.search !== !!this.#o.search ||
      next.label !== this.#o.label
    this.#o = next
    if (stale) {
      // a list that changed under an open panel closes: its rows, and so the active one, are gone
      this.#hide()
      this.#box?.remove()
      this.#box = undefined
    }
    if (this.#shown) this.#mark()
    if (next.open !== undefined && next.open !== this.#shown) {
      if (next.open) this.#show()
      else this.#hide()
    }
  }
  destroy() {
    this.#hide()
    this.#box?.remove()
    this.#trigger.removeEventListener('click', this.#onClick)
    this.#trigger.removeEventListener('keydown', this.#onKey)
    this.#trigger.removeEventListener('focusout', this.#onLeave)
  }
}
