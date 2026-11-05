// The palette's row pool and match highlights.
import { derived, effect, untrack } from '@weft-js/core'
import { Icon } from './Icon'
import type { Command } from './CommandPalette'

export type Row =
  | { head: string; item?: undefined; at?: undefined }
  | { head?: undefined; item: Command; at: number }

const HIT = 'warp-palette-hit'

/** Rows for groups in `order`, numbered in the order the arrows walk them. */
export function arrange(commands: Command[], order: readonly string[] = []) {
  const groups = new Map<string, Command[]>()
  for (const c of commands) {
    const name = c.group ?? ''
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name)!.push(c)
  }
  const rank = (n: string) => {
    const i = order.indexOf(n)
    return i < 0 ? order.length : i
  }
  const rows: Row[] = []
  let at = 0
  for (const [name, list] of [...groups].sort((a, b) => rank(a[0]) - rank(b[0]))) {
    if (name) rows.push({ head: name })
    for (const item of list) rows.push({ item, at: at++ })
  }
  return rows
}

/** Marks where `words` start in the rows' text, through the CSS Custom Highlight API: no markup, no row is rebuilt. */
export function paint(list: HTMLElement | undefined, query: string, rows: readonly Row[]) {
  const win = list?.ownerDocument.defaultView
  if (!win?.CSS?.highlights || typeof win.Highlight !== 'function') return
  const ranges: Range[] = []
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const mark = (node: Text | null | undefined, indices: number[]) => {
    for (const i of indices) {
      if (!node || i >= node.length) continue
      const r = new win.Range()
      r.setStart(node, i)
      r.setEnd(node, i + 1)
      ranges.push(r)
    }
  }
  rows.forEach((row, n) => {
    if (!row.item) return
    const el = list!.querySelectorAll(':scope > [data-part="row"]')[n]
    const label = el?.querySelector('[data-part="text"]')?.firstChild as Text | null
    const hint = el?.querySelector('[data-part="hint"]')?.firstChild as Text | null
    if (row.item.hits) return mark(label, row.item.hits)
    for (const node of [label, hint]) {
      const text = node?.data.toLowerCase() ?? ''
      for (const w of words) {
        const i = text.indexOf(w)
        if (i >= 0)
          mark(
            node,
            Array.from({ length: w.length }, (_, k) => i + k),
          )
      }
    }
  })
  win.CSS.highlights.set(HIT, new win.Highlight(...ranges))
}

/** Writes `value` only if it differs, and hides the node when there is nothing to show. */
const put = (el: HTMLElement, value: string | undefined) => {
  el.hidden = !value
  if (value && el.textContent !== value) el.textContent = value
}

/** One row of the pool. Everything but the active mark is one write pass per change of row, so a list costs little to open. */
export function Slot({
  row,
  id,
  active,
  onPick,
  onHover,
}: {
  row: () => Row | undefined
  id: string
  active: () => number
  onPick: (at: number) => void
  onHover: (at: number) => void
}) {
  const r = derived(() => row())
  const at = () => untrack(() => r.value?.at ?? -1)
  let box!: HTMLElement,
    head!: HTMLElement,
    option!: HTMLElement,
    text!: HTMLElement,
    hint!: HTMLElement,
    keys!: HTMLElement
  const view = (
    <div ref={(n) => (box = n)} data-part="row" role="presentation" hidden="">
      <div ref={(n) => (head = n)} data-part="group-label" role="presentation" hidden=""></div>
      <div
        ref={(n) => (option = n)}
        data-part="item"
        hidden=""
        aria-selected={r.value?.item ? (r.value.at === active() ? 'true' : 'false') : undefined}
        onPointerMove={() => {
          if (at() !== active()) onHover(at())
        }}
        onClick={() => onPick(at())}
      >
        {r.value?.item?.icon && <Icon name={r.value?.item?.icon} />}
        <span ref={(n) => (text = n)} data-part="text"></span>
        <span ref={(n) => (hint = n)} data-part="hint" hidden=""></span>
        <span ref={(n) => (keys = n)} data-part="shortcut" hidden=""></span>
      </div>
    </div>
  )
  effect(
    () => r.value,
    (v) => {
      const item = v?.item
      box.hidden = !v
      put(head, v?.head)
      option.hidden = !item
      if (item) {
        option.setAttribute('role', 'option')
        option.id = `${id}-${v.at}`
      } else {
        option.removeAttribute('role')
        option.removeAttribute('id')
      }
      text.textContent = item?.label ?? ''
      put(hint, item?.hint)
      put(keys, item?.shortcut)
    },
  )
  return view
}
