import { untrack } from '@weft-js/core'
import type { GridColumn, ScrollGridProps } from '../ScrollGrid'

export const CW = 104,
  LEADING = 1.4,
  PAD = 12

type GridWatch = (node: () => HTMLElement, axis: 'x' | 'y', key: number) => void
export function makeCell(
  props: ScrollGridProps,
  watch: GridWatch,
  active: { readonly value: [number, number] },
  cellId: (row: number, column: number) => string,
  focusCell: (cell: [number, number], align?: boolean) => void,
  hw: number,
) {
  function Cell(p: { r: number; entry: { c: number; col: GridColumn } }) {
    let node: HTMLElement | undefined
    const c = untrack(() => p.entry.c)
    watch(() => node!, 'x', c)
    const on = () => active.value[0] === p.r && active.value[1] === c
    const wrap = () => p.entry.col.wrap
    return (
      <div
        ref={(n) => (node = n)}
        id={cellId(p.r, c)}
        data-part="cell"
        role="gridcell"
        aria-colindex={c + 2}
        aria-selected={on() ? 'true' : undefined}
        data-active={on() ? '' : undefined}
        data-neg={props.negative?.(p.r, p.entry.col) ? '' : undefined}
        style={`inline-size:${p.entry.col.width ?? CW}px;block-size:100%;transform:translateX(${hw + c * CW}px)${wrap() ? `;white-space:normal;line-height:${LEADING};justify-content:start;align-items:start;padding-block:${PAD / 2}px` : ''}`}
        onPointerDown={() => focusCell([p.r, c], false)}
      >
        {props.cell(p.r, p.entry.col)}
      </div>
    )
  }
  return Cell
}

export function makeHead(watch: GridWatch, hw: number) {
  function Head(p: { entry: { c: number; col: GridColumn } }) {
    let node: HTMLElement | undefined
    const c = untrack(() => p.entry.c)
    watch(() => node!, 'x', c)
    return (
      <div
        ref={(n) => (node = n)}
        data-part="col-head"
        role="columnheader"
        aria-colindex={c + 2}
        style={`inline-size:${p.entry.col.width ?? CW}px;transform:translateX(${hw + c * CW}px)`}
      >
        {p.entry.col.header}
      </div>
    )
  }
  return Head
}

export function makeRow(
  props: ScrollGridProps,
  watch: GridWatch,
  shownCols: { readonly value: { c: number; col: GridColumn }[] },
  hw: number,
  rh: number,
  Cell: ReturnType<typeof makeCell>,
) {
  function Row(p: { r: number }) {
    let node: HTMLElement | undefined
    const r = untrack(() => p.r)
    watch(() => node!, 'y', r)
    return (
      <div
        ref={(n) => (node = n)}
        data-part="row"
        role="row"
        aria-rowindex={r + 2}
        style={`inline-size:${hw}px;min-inline-size:100%;transform:translateY(${rh + r * rh}px)`}
      >
        <div
          data-part="row-head"
          role="rowheader"
          aria-colindex="1"
          style={`position:sticky;inset-inline-start:0;inline-size:${hw}px;block-size:100%`}
        >
          {props.rowHeader(r)}
        </div>
        {shownCols.value.map((e) => (
          <Cell key={e.c} r={r} entry={e} />
        ))}
      </div>
    )
  }
  return Row
}
