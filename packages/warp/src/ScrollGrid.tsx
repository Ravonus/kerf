import { derived, onCleanup, onMount, state, untrack } from 'weft'
import { measureEngine, type MeasureHandle, type MeasureProvider } from 'weft/text'
import { slices, uid, virtualizer, type Virtualizer } from '@weft/warp-core'
import './styles'
import '@weft/warp-core/styles/data/scroll-grid.css'

export interface GridColumn {
  id: string
  header: string
  /** Pixels. Default 104. */
  width?: number
  /** The text wraps, and rows are as tall as it needs. */
  wrap?: boolean
}
export interface ScrollGridProps {
  label: string
  rows: number
  columns: readonly GridColumn[]
  /** The cell at a row and column. */
  cell: (row: number, column: GridColumn) => any
  /** The first column, the row's name. */
  rowHeader: (row: number) => string
  /** The corner cell's text. */
  corner?: string
  /** Default `480px`. */
  height?: string
  rowHeight?: number
  headerWidth?: number
  /** Marks a cell critical (a negative value). */
  negative?: (row: number, column: GridColumn) => boolean
}

const RH = 34, CW = 104, HW = 132, LEADING = 1.4, PAD = 12, INSET = 20
const HELP = 'Arrow keys move one cell, Page Up and Page Down one screen, Home and End to the row ends, Control with Home or End to the grid ends.'

/** The two-axis grid (06 §6): rows and columns are each a window on one scroller, plus the active cell's row and column. */
export function ScrollGrid(props: ScrollGridProps) {
  const id = uid('grid')
  let el: HTMLElement | undefined, canvas: HTMLElement | undefined
  let ys: Virtualizer | undefined, xs: Virtualizer | undefined
  let engine: MeasureProvider | null = null
  let stop: (() => void) | undefined
  const rh = untrack(() => props.rowHeight ?? RH), hw = untrack(() => props.headerWidth ?? HW)
  const columns = derived(() => props.columns)
  const rows = state<number[]>(Array.from({ length: Math.min(untrack(() => props.rows), 12) }, (_, i) => i))
  const cols = state<number[]>(Array.from({ length: Math.min(untrack(() => columns.value.length), 12) }, (_, i) => i))
  const active = state<[number, number]>([0, 0])
  const shownCols = derived(() => cols.value.flatMap(c => (columns.value[c] ? [{ c, col: columns.value[c] }] : [])))
  const handles = new Map<string, MeasureHandle>()
  let font = '', line = 0
  const wrapped = derived(() => columns.value.flatMap((c, i) => (c.wrap ? [{ c, i }] : [])))
  const cellId = (r: number, c: number) => `${id}-r${r}-c${c}`

  const handle = (r: number, c: GridColumn) => {
    const key = `${r}\0${c.id}`
    let h = handles.get(key)
    if (!h) { h = engine!.prepare(String(props.cell(r, c) ?? ''), font); handles.set(key, h) }
    return h
  }
  const size = (r: number) => {
    if (!engine || !wrapped.value.length) return rh
    let most = rh
    for (const { c } of wrapped.value) most = Math.max(most, engine.layout(handle(r, c), (c.width ?? CW) - INSET, line).height + PAD)
    return most
  }

  function focusCell([r, c]: [number, number], align = true) {
    active.value = [r, c]
    ys?.update({})
    xs?.update({})
    if (align) reveal(r, c)
    el!.setAttribute('aria-activedescendant', cellId(r, c))
  }

  function reveal(r: number, c: number) {
    const top = el!.scrollTop, y = ys!.sizes.offset(r), h = ys!.sizes.get(r), room = el!.clientHeight - rh
    if (y < top) el!.scrollTop = y
    else if (y + h > top + room) el!.scrollTop = y + h - room
    const left = el!.scrollLeft, x = xs!.sizes.offset(c), w = xs!.sizes.get(c), wide = el!.clientWidth - hw
    if (x < left) el!.scrollLeft = x
    else if (x + w > left + wide) el!.scrollLeft = x + w - wide
  }

  function onKeyDown(e: KeyboardEvent) {
    const [r, c] = active.value, lastR = props.rows - 1, lastC = columns.value.length - 1, ctrl = e.ctrlKey || e.metaKey
    const page = Math.max(1, Math.floor((el!.clientHeight - rh) / rh) - 1)
    const to: Record<string, [number, number]> = {
      ArrowDown: [r + 1, c], ArrowUp: [r - 1, c], ArrowRight: [r, c + 1], ArrowLeft: [r, c - 1], PageDown: [r + page, c], PageUp: [r - page, c],
      Home: ctrl ? [0, 0] : [r, 0], End: ctrl ? [lastR, lastC] : [r, lastC],
    }
    const next = to[e.key]
    if (!next) return
    e.preventDefault()
    focusCell([Math.max(0, Math.min(lastR, next[0])), Math.max(0, Math.min(lastC, next[1]))])
  }

  onMount(() => {
    queueMicrotask(() => {
      if (!el) return
      const allRows = Array.from({ length: untrack(() => props.rows) }, (_, i) => i)
      ys = virtualizer(el, { keys: allRows, spacer: canvas!, estimate: rh, size, head: rh, sized: true, pinned: () => [active.value[0]], overscan: 200, onRange: i => (rows.value = i) })
      xs = virtualizer(el, { keys: untrack(() => columns.value.map((_, i) => i)), spacer: canvas!, axis: 'x', estimate: i => untrack(() => columns.value[i].width ?? CW), head: hw, sized: true, pinned: () => [active.value[1]], overscan: 200, onRange: i => (cols.value = i) })
      for (const [row, key] of held.splice(0)) row.set(ys.attach(row.node, key))
      for (const [cell, key] of heldCols.splice(0)) cell.set(xs.attach(cell.node, key))
      if (!untrack(() => wrapped.value.length)) return
      measureEngine().then(e => {
        if (!e || !el) return
        const c = getComputedStyle(el)
        font = `${c.fontWeight} ${c.fontSize} ${c.fontFamily}`
        line = parseFloat(c.fontSize) * LEADING
        engine = e
        ys!.refresh(rows.value[0] ?? 0, (rows.value.at(-1) ?? 0) + 1)
        let at = 0, lo = 0
        stop = slices(() => {
          if (at >= allRows.length) { ys!.refresh(lo, at); return false }
          size(at++)
          if (at - lo >= 256) { ys!.refresh(lo, at); lo = at }
          return true
        })
      })
    })
    onCleanup(() => { stop?.(); ys?.destroy(); xs?.destroy() })
  })

  type Held = { node: HTMLElement; set: (undo: () => void) => void }
  const held: [Held, number][] = [], heldCols: [Held, number][] = []
  const watch = (node: () => HTMLElement, axis: 'x' | 'y', key: number) => onMount(() => {
    let undo: (() => void) | undefined
    const v = axis === 'y' ? ys : xs
    if (v) undo = v.attach(node(), key)
    else (axis === 'y' ? held : heldCols).push([{ node: node(), set: u => (undo = u) }, key])
    onCleanup(() => undo?.())
  })

  function Cell(p: { r: number; entry: { c: number; col: GridColumn } }) {
    let node: HTMLElement | undefined
    const c = untrack(() => p.entry.c)
    watch(() => node!, 'x', c)
    const on = () => active.value[0] === p.r && active.value[1] === c
    const wrap = () => p.entry.col.wrap
    return (
      <div
        ref={(n: any) => (node = n)} id={cellId(p.r, c)} data-part="cell" role="gridcell" aria-colindex={c + 2} aria-selected={on() ? 'true' : undefined} data-active={on() ? '' : undefined}
        data-neg={props.negative?.(p.r, p.entry.col) ? '' : undefined}
        style={`inline-size:${p.entry.col.width ?? CW}px;block-size:100%;transform:translateX(${hw + c * CW}px)${wrap() ? `;white-space:normal;line-height:${LEADING};justify-content:start;align-items:start;padding-block:${PAD / 2}px` : ''}`}
        onPointerDown={() => focusCell([p.r, c], false)}
      >{props.cell(p.r, p.entry.col)}</div>
    )
  }

  function Head(p: { entry: { c: number; col: GridColumn } }) {
    let node: HTMLElement | undefined
    const c = untrack(() => p.entry.c)
    watch(() => node!, 'x', c)
    return <div ref={(n: any) => (node = n)} data-part="col-head" role="columnheader" aria-colindex={c + 2} style={`inline-size:${p.entry.col.width ?? CW}px;transform:translateX(${hw + c * CW}px)`}>{p.entry.col.header}</div>
  }

  function Row(p: { r: number }) {
    let node: HTMLElement | undefined
    const r = untrack(() => p.r)
    watch(() => node!, 'y', r)
    return (
      <div ref={(n: any) => (node = n)} data-part="row" role="row" aria-rowindex={r + 2} style={`inline-size:${hw}px;min-inline-size:100%;transform:translateY(${rh + r * rh}px)`}>
        <div data-part="row-head" role="rowheader" aria-colindex="1" style={`position:sticky;inset-inline-start:0;inline-size:${hw}px;block-size:100%`}>{props.rowHeader(r)}</div>
        {shownCols.value.map(e => <Cell key={e.c} r={r} entry={e} />)}
      </div>
    )
  }

  return (
    <div
      ref={(n: any) => (el = n)} data-scope="scroll-grid" role="grid" id={id} aria-label={props.label} aria-describedby={`${id}-help`} aria-readonly="true"
      aria-rowcount={props.rows + 1} aria-colcount={columns.value.length + 1} aria-activedescendant={cellId(0, 0)} tabindex="0" onKeyDown={onKeyDown}
      style={props.height ? `block-size:${props.height}` : undefined}
    >
      <div ref={(n: any) => (canvas = n)} data-part="canvas" role="presentation">
        <div data-part="head-row" role="row" aria-rowindex="1" style="position:sticky;inset-block-start:0">
          <div data-part="corner" role="columnheader" aria-colindex="1" style={`position:sticky;inset-inline-start:0;inline-size:${hw}px`}>{props.corner ?? props.label}</div>
          {shownCols.value.map(e => <Head key={e.c} entry={e} />)}
        </div>
        {rows.value.map(r => <Row key={r} r={r} />)}
      </div>
      <p id={`${id}-help`} class="vh">{HELP}</p>
    </div>
  )
}
