// The custom open of a real <select> (redesign §5). The element stays the form control, the accessible name and the
// `change` event; on fine pointers this cancels the OS popup and shows warp's list in the top layer, driven from the
// select itself. On coarse pointers, and with no script, the OS control stays (03 §4).
import { place, pushLayer } from './layers'
import { moveShuttle } from './shuttle'
import { uid } from './store'

const CHECK = '<svg data-icon viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.5 9.5 17 19 7"/></svg>'
const TYPEAHEAD_MS = 500

export function selectMenu(sel: HTMLSelectElement) {
  const doc = sel.ownerDocument
  const win = doc.defaultView!
  if (!win.matchMedia?.('(pointer: fine)').matches) return { update() {}, destroy() {} }
  const id = uid('sel')
  const anchor = sel.closest<HTMLElement>('[data-part="control"]') ?? sel
  let panel: HTMLElement | undefined
  let face: HTMLElement
  let rows: { el: HTMLElement; option: HTMLOptionElement }[] = []
  let at = -1
  let remove: (() => void) | undefined
  let typed = ''
  let typedAt = 0

  function build() {
    const box = doc.createElement('div')
    box.dataset.scope = 'select'
    box.dataset.part = 'content'
    box.id = id
    box.setAttribute('role', 'listbox')
    box.setAttribute('popover', 'manual')
    box.style.position = 'fixed' // it lives in the field, whose control positions its children
    box.setAttribute('aria-label', sel.labels?.[0]?.querySelector('[data-part="label-text"]')?.textContent ?? sel.name)
    face = doc.createElement('span')
    face.dataset.part = 'shuttle'
    box.append(face)
    rows = []
    const add = (option: HTMLOptionElement, parent: HTMLElement) => {
      const el = doc.createElement('div')
      el.dataset.part = 'item'
      el.id = `${id}-${rows.length}`
      el.setAttribute('role', 'option')
      el.setAttribute('aria-selected', String(option.selected))
      if (option.disabled) el.setAttribute('aria-disabled', 'true')
      el.textContent = option.textContent
      const tick = doc.createElement('span')
      tick.dataset.part = 'indicator'
      tick.innerHTML = CHECK
      el.append(tick)
      parent.append(el)
      if (!option.disabled) rows.push({ el, option })
    }
    for (const child of sel.children) {
      if (child instanceof win.HTMLOptGroupElement) {
        const group = doc.createElement('div')
        group.setAttribute('role', 'group')
        const name = doc.createElement('div')
        name.dataset.part = 'group-label'
        name.textContent = child.label
        group.setAttribute('aria-label', child.label)
        group.append(name)
        for (const o of child.children) add(o as HTMLOptionElement, group)
        box.append(group)
      } else add(child as HTMLOptionElement, box)
    }
    box.addEventListener('pointermove', e => {
      const el = (e.target as Element).closest<HTMLElement>('[role="option"]')
      const i = rows.findIndex(r => r.el === el)
      if (i >= 0 && i !== at) go(i, false)
    })
    box.addEventListener('mousedown', e => e.preventDefault()) // focus stays on the select
    box.addEventListener('click', e => {
      const i = rows.findIndex(r => r.el === (e.target as Element).closest('[role="option"]'))
      if (i >= 0) commit(i)
    })
    return box
  }

  function go(i: number, scroll = true) {
    rows[at]?.el.removeAttribute('data-highlighted')
    at = i
    const r = rows[i]
    if (!r) return
    r.el.setAttribute('data-highlighted', '')
    sel.setAttribute('aria-activedescendant', r.el.id)
    const top = r.el.offsetTop
    moveShuttle(face, top, top + r.el.offsetHeight)
    if (scroll) r.el.scrollIntoView?.({ block: 'nearest' })
  }

  function open() {
    if (panel || sel.disabled) return
    panel = build()
    sel.after(panel)
    panel.style.minInlineSize = `${anchor.getBoundingClientRect().width}px`
    panel.showPopover?.()
    place(panel, anchor, 'bottom', 'start', 6)
    face.setAttribute('data-instant', '')
    go(Math.max(0, rows.findIndex(r => r.option.selected)))
    void face.offsetWidth
    face.setAttribute('data-on', '')
    win.requestAnimationFrame(() => face.removeAttribute('data-instant'))
    sel.setAttribute('aria-expanded', 'true')
    sel.setAttribute('aria-controls', id)
    remove = pushLayer({ el: panel, trigger: anchor, close })
  }

  function close() {
    const box = panel
    if (!box) return
    panel = undefined
    at = -1
    remove?.()
    remove = undefined
    sel.setAttribute('aria-expanded', 'false')
    sel.removeAttribute('aria-activedescendant')
    sel.removeAttribute('aria-controls')
    box.hidePopover?.()
    setTimeout(() => box.remove(), 240) // after its exit transition
  }

  function commit(i: number) {
    const r = rows[i]
    close()
    if (!r || r.option.selected) return
    sel.selectedIndex = r.option.index
    sel.dispatchEvent(new Event('input', { bubbles: true }))
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const onDown = (e: MouseEvent) => {
    if (e.button || sel.disabled) return
    e.preventDefault() // the OS popup
    sel.focus({ preventScroll: true })
    if (panel) close()
    else open()
  }
  const onKey = (e: KeyboardEvent) => {
    if (!panel) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
      return
    }
    const n = rows.length
    const move = (i: number) => { e.preventDefault(); go((i + n) % n) }
    if (e.key === 'ArrowDown') return move(at + 1)
    if (e.key === 'ArrowUp') return move(at - 1)
    if (e.key === 'Home' || e.key === 'PageUp') return move(0)
    if (e.key === 'End' || e.key === 'PageDown') return move(n - 1)
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return commit(at) }
    if (e.key === 'Tab') return commit(at)
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
    e.preventDefault()
    const now = performance.now()
    typed = now - typedAt < TYPEAHEAD_MS ? typed + e.key.toLowerCase() : e.key.toLowerCase()
    typedAt = now
    const hit = rows.findIndex(r => r.option.text.toLowerCase().startsWith(typed))
    if (hit >= 0) go(hit)
  }
  const onBlur = () => close()
  sel.addEventListener('mousedown', onDown)
  sel.addEventListener('keydown', onKey)
  sel.addEventListener('blur', onBlur)
  sel.setAttribute('aria-expanded', 'false')
  return {
    update() {},
    destroy() {
      close()
      sel.removeEventListener('mousedown', onDown)
      sel.removeEventListener('keydown', onKey)
      sel.removeEventListener('blur', onBlur)
    },
  }
}
