import { measureWrapped } from './ScrollGrid/measure'
import { CW, PAD, makeCell, makeHead, makeRow } from './ScrollGrid/parts'
import { derived, onCleanup, onMount, state, untrack } from '@weft-js/core'
import { type MeasureHandle, type MeasureProvider } from '@weft-js/core/text'
import { uid, virtualizer, type Virtualizer } from '@weft-js/warp-core'
import './styles'
import '@weft-js/warp-core/styles/data/scroll-grid.css'

/** One ScrollGrid column. */
export interface GridColumn {
  id: string
  header: string
  /** Pixels. Default 104. */
  width?: number | undefined
  /** The text wraps, and rows are as tall as it needs. */
  wrap?: boolean
}
/** Props for ScrollGrid. */
export interface ScrollGridProps {
  label: string
  rows: number
  columns: readonly GridColumn[]
  /** The cell at a row and column. */
  cell: (row: number, column: GridColumn) => unknown
  /** The first column, the row's name. */
  rowHeader: (row: number) => string
  /** The corner cell's text. */
  corner?: string
  /** Default `480px`. */
  height?: string
  /** Each row's height, in pixels. Default 34. */
  rowHeight?: number
  /** The pinned first column's width, in pixels. Default 132. */
  headerWidth?: number
  /** Marks a cell critical (a negative value). */
  negative?: (row: number, column: GridColumn) => boolean
}

const RH = 34,
  HW = 132,
  INSET = 20
const HELP =
  'Arrow keys move one cell, Page Up and Page Down one screen, Home and End to the row ends, Control with Home or End to the grid ends.'

export type GridRuntime = {
  el: HTMLElement | undefined
  canvas: HTMLElement | undefined
  ys: Virtualizer | undefined
  xs: Virtualizer | undefined
  engine: MeasureProvider | null
  stop: (() => void) | undefined
  font: string
  line: number
}

type Held = { node: HTMLElement; set: (undo: () => void) => void }
function mountGrid({
  runtime,
  props,
  rh,
  hw,
  size,
  rows,
  cols,
  columns,
  wrapped,
  active,
  held,
  heldCols,
}: {
  runtime: GridRuntime
  props: ScrollGridProps
  rh: number
  hw: number
  size: (row: number) => number
  rows: { value: number[] }
  cols: { value: number[] }
  columns: { readonly value: readonly GridColumn[] }
  wrapped: { readonly value: { c: GridColumn; i: number }[] }
  active: { readonly value: [number, number] }
  held: () => [Held, number][]
  heldCols: () => [Held, number][]
}) {
  onMount(() => {
    queueMicrotask(() => {
      if (!runtime.el) return
      const allRows = Array.from({ length: untrack(() => props.rows) }, (_, i) => i)
      runtime.ys = virtualizer(runtime.el, {
        keys: allRows,
        spacer: runtime.canvas!,
        estimate: rh,
        size,
        head: rh,
        sized: true,
        pinned: () => [active.value[0]],
        overscan: 200,
        onRange: (i) => (rows.value = i),
      })
      runtime.xs = virtualizer(runtime.el, {
        keys: untrack(() => columns.value.map((_, i) => i)),
        spacer: runtime.canvas!,
        axis: 'x',
        estimate: (i) => untrack(() => columns.value[i]!.width ?? CW),
        head: hw,
        sized: true,
        pinned: () => [active.value[1]],
        overscan: 200,
        onRange: (i) => (cols.value = i),
      })
      for (const [row, key] of held().splice(0)) row.set(runtime.ys.attach(row.node, key))
      for (const [cell, key] of heldCols().splice(0)) cell.set(runtime.xs.attach(cell.node, key))
      if (!untrack(() => wrapped.value.length)) return
      measureWrapped({ runtime, rows, size, count: allRows.length })
    })
    onCleanup(() => {
      runtime.stop?.()
      runtime.ys?.destroy()
      runtime.xs?.destroy()
    })
  })
}

function gridSize({
  runtime,
  props,
  handles,
  wrapped,
  rh,
}: {
  runtime: GridRuntime
  props: ScrollGridProps
  handles: Map<string, MeasureHandle>
  wrapped: { readonly value: { c: GridColumn; i: number }[] }
  rh: number
}) {
  const handle = (r: number, c: GridColumn) => {
    const key = `${r}\0${c.id}`
    let h = handles.get(key)
    if (!h) {
      h = runtime.engine!.prepare(
        String((props.cell(r, c) as string | number | null | undefined) ?? ''),
        runtime.font,
      )
      handles.set(key, h)
    }
    return h
  }
  const size = (r: number) => {
    if (!runtime.engine || !wrapped.value.length) return rh
    let most = rh
    for (const { c } of wrapped.value)
      most = Math.max(
        most,
        runtime.engine.layout(handle(r, c), (c.width ?? CW) - INSET, runtime.line).height + PAD,
      )
    return most
  }

  return size
}

function gridNavigation({
  runtime,
  props,
  active,
  columns,
  rh,
  hw,
  cellId,
}: {
  runtime: GridRuntime
  props: ScrollGridProps
  active: { value: [number, number] }
  columns: { readonly value: readonly GridColumn[] }
  rh: number
  hw: number
  cellId: (row: number, column: number) => string
}) {
  function focusCell([r, c]: [number, number], align = true) {
    active.value = [r, c]
    runtime.ys?.update({})
    runtime.xs?.update({})
    if (align) reveal(r, c)
    runtime.el!.setAttribute('aria-activedescendant', cellId(r, c))
  }

  function reveal(r: number, c: number) {
    const top = runtime.el!.scrollTop,
      y = runtime.ys!.sizes.offset(r),
      h = runtime.ys!.sizes.get(r),
      room = runtime.el!.clientHeight - rh
    if (y < top) runtime.el!.scrollTop = y
    else if (y + h! > top + room) runtime.el!.scrollTop = y + h! - room
    const left = runtime.el!.scrollLeft,
      x = runtime.xs!.sizes.offset(c),
      w = runtime.xs!.sizes.get(c),
      wide = runtime.el!.clientWidth - hw
    if (x < left) runtime.el!.scrollLeft = x
    else if (x + w! > left + wide) runtime.el!.scrollLeft = x + w! - wide
  }

  function onKeyDown(e: KeyboardEvent) {
    const [r, c] = active.value,
      lastR = props.rows - 1,
      lastC = columns.value.length - 1,
      ctrl = e.ctrlKey || e.metaKey
    const page = Math.max(1, Math.floor((runtime.el!.clientHeight - rh) / rh) - 1)
    const to: Record<string, [number, number]> = {
      ArrowDown: [r + 1, c],
      ArrowUp: [r - 1, c],
      ArrowRight: [r, c + 1],
      ArrowLeft: [r, c - 1],
      PageDown: [r + page, c],
      PageUp: [r - page, c],
      Home: ctrl ? [0, 0] : [r, 0],
      End: ctrl ? [lastR, lastC] : [r, lastC],
    }
    const next = to[e.key]
    if (!next) return
    e.preventDefault()
    focusCell([Math.max(0, Math.min(lastR, next[0])), Math.max(0, Math.min(lastC, next[1]))])
  }

  return { focusCell, onKeyDown }
}

function gridWindows(props: ScrollGridProps, columns: { readonly value: readonly GridColumn[] }) {
  const rows = state<number[]>(
    Array.from(
      {
        length: Math.min(
          untrack(() => props.rows),
          12,
        ),
      },
      (_, i) => i,
    ),
  )
  const cols = state<number[]>(
    Array.from(
      {
        length: Math.min(
          untrack(() => columns.value.length),
          12,
        ),
      },
      (_, i) => i,
    ),
  )
  return { rows, cols }
}

function gridWatch(runtime: GridRuntime, held: [Held, number][], heldCols: [Held, number][]) {
  return (node: () => HTMLElement, axis: 'x' | 'y', key: number) =>
    onMount(() => {
      let undo: (() => void) | undefined
      const v = axis === 'y' ? runtime.ys : runtime.xs
      if (v) undo = v.attach(node(), key)
      else (axis === 'y' ? held : heldCols).push([{ node: node(), set: (u) => (undo = u) }, key])
      onCleanup(() => undo?.())
    })
}

function gridModel(props: ScrollGridProps) {
  const runtime: GridRuntime = {
    el: undefined,
    canvas: undefined,
    ys: undefined,
    xs: undefined,
    engine: null,
    stop: undefined,
    font: '',
    line: 0,
  }
  const id = uid('grid')
  const rh = untrack(() => props.rowHeight ?? RH),
    hw = untrack(() => props.headerWidth ?? HW)
  const columns = derived(() => props.columns)
  const { rows, cols } = gridWindows(props, columns)
  const active = state<[number, number]>([0, 0])
  const shownCols = derived(() =>
    cols.value.flatMap((c) => (columns.value[c] ? [{ c, col: columns.value[c] }] : [])),
  )
  const handles = new Map<string, MeasureHandle>()
  const wrapped = derived(() => columns.value.flatMap((c, i) => (c.wrap ? [{ c, i }] : [])))
  const cellId = (r: number, c: number) => `${id}-r${r}-c${c}`

  const size = gridSize({ runtime, props: untrack(() => props), handles, wrapped, rh })

  const { focusCell, onKeyDown } = gridNavigation({
    runtime,
    props: untrack(() => props),
    active,
    columns,
    rh,
    hw,
    cellId,
  })

  mountGrid({
    runtime,
    props,
    rh,
    hw,
    size,
    rows,
    cols,
    columns,
    wrapped,
    active,
    held: () => held,
    heldCols: () => heldCols,
  })

  const held: [Held, number][] = [],
    heldCols: [Held, number][] = []
  const watch = gridWatch(runtime, held, heldCols)

  const Cell = makeCell({ props, watch, active, cellId, focusCell, hw })
  const Head = makeHead(watch, hw)
  const Row = makeRow({ props, watch, shownCols, hw, rh, Cell })

  return { runtime, id, columns, rows, shownCols, hw, cellId, onKeyDown, Head, Row }
}

/** The two-axis grid (06 §6): rows and columns are each a window on one scroller, plus the active cell's row and column. */
export function ScrollGrid(props: ScrollGridProps) {
  const { runtime, id, columns, rows, shownCols, hw, cellId, onKeyDown, Head, Row } = untrack(() =>
    gridModel(props),
  )
  return (
    <div
      ref={(n) => (runtime.el = n)}
      data-scope="scroll-grid"
      role="grid"
      id={id}
      aria-label={props.label}
      aria-describedby={`${id}-help`}
      aria-readonly="true"
      aria-rowcount={props.rows + 1}
      aria-colcount={columns.value.length + 1}
      aria-activedescendant={cellId(0, 0)}
      tabindex="0"
      onKeyDown={onKeyDown}
      style={props.height ? `block-size:${props.height}` : undefined}
    >
      <div ref={(n) => (runtime.canvas = n)} data-part="canvas" role="presentation">
        <div
          data-part="head-row"
          role="row"
          aria-rowindex="1"
          style="position:sticky;inset-block-start:0"
        >
          <div
            data-part="corner"
            role="columnheader"
            aria-colindex="1"
            style={`position:sticky;inset-inline-start:0;inline-size:${hw}px`}
          >
            {props.corner ?? props.label}
          </div>
          {shownCols.value.map((e) => (
            <Head key={e.c} entry={e} />
          ))}
        </div>
        {rows.value.map((r) => (
          <Row key={r} r={r} />
        ))}
      </div>
      <p id={`${id}-help`} class="vh">
        {HELP}
      </p>
    </div>
  )
}
