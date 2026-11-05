import { color, num } from './math'
import type { Base, Fmt, LegendItem } from './types'

/** One row of chart data, read by the field names in the config. */
export type Row = object
export type Cells = Record<string, unknown>
/** A series: a field name, or a field with its own name and colour. */
export type SeriesDef = string | { key: string; name?: string; color?: string }
/** A note pinned to an x value or band. */
export type Annotation = { x: string; label: string; band?: [string, string] }
/** A horizontal reference line. */
export type Reference = { y: number; label: string }
/** Shared data and series for Cartesian charts. */
export type Cartesian = Base<Row[]> & {
  x: string
  series: SeriesDef[]
  format?: Fmt | undefined
  axisFormat?: Fmt
  xName?: string
}
/** Config for a line or area chart. */
export type LineConfig = Cartesian & {
  area?: boolean
  zero?: boolean
  direct?: boolean
  headroom?: number
  annotations?: Annotation[]
  references?: Reference[]
}
/** How bars with several series sit together. */
export type BarLayout = 'grouped' | 'stacked' | 'percent'
/** Config for a bar chart. */
export type BarConfig = Cartesian & { layout?: BarLayout }
/** Config for bars with a line over them: its own series, or a rolling average of the bars. */
export type ComboConfig = Base<Row[]> & {
  x: string
  bar: SeriesDef
  line?: SeriesDef
  window?: number
  format?: Fmt | undefined
  axisFormat?: Fmt
  xName?: string
}

export const labels = (c: { data: Row[]; x: string }) =>
  c.data.map((r) => String((r as Cells)[c.x]))
export const def = (d: SeriesDef, i: number) =>
  typeof d === 'string'
    ? { key: d, name: d, i, color: color(i) }
    : { key: d.key, name: d.name ?? d.key, i, color: d.color ?? color(i) }
export const seriesOf = (c: Cartesian) =>
  c.series.map((d, i) => {
    const e = def(d, i)
    return { ...e, values: c.data.map((r) => Number((r as Cells)[e.key])) }
  })
export const legendOf = (c: Cartesian): LegendItem[] =>
  c.series.map(def).map((d) => ({ name: d.name, color: d.color }))
export const say = (c: Cartesian) => {
  const f = c.format ?? num,
    list = seriesOf(c),
    t = list[0]!
  return `${list.length} series over ${c.data.length} points. ${t.name} goes from ${f(t.values[0]!)} to ${f(t.values[t.values.length - 1]!)}.`
}
export const crossAt = (el: Element | null, svg: Element) => {
  if (!el) return
  const x = el.getAttribute('cx')!,
    cross = svg.querySelector('.cross')!,
    xi = el.getAttribute('data-xi')
  cross.setAttribute('x1', x)
  cross.setAttribute('x2', x)
  for (const m of svg.querySelectorAll('[data-mark]'))
    m.toggleAttribute('data-active', m.getAttribute('data-xi') === xi)
}
