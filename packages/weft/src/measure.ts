// The text.measure slot from app code (research 11 §2, research 33 §6): the lazy load every user shares, and the three
// reactive calls over it. Until the engine is here a box is null, and with no provider bound it stays null, so a caller
// keeps working on whatever it did before it had an exact height.

import { derived, effect, onCleanup, rt, state, untrack, type Derived, type State } from '@weft-js/core'

/** `text.measure@1` (research 33 §6), what `weft:slot/text.measure` loads. */
export interface MeasureProvider {
  prepare(text: string, font: string, opts?: { segments?: boolean; whiteSpace?: 'normal' | 'pre-wrap'; letterSpacing?: number }): MeasureHandle
  layout(handle: MeasureHandle, width: number, lineHeight: number): { height: number; lineCount: number }
  lines(handle: MeasureHandle, width: number): MeasureLine[]
  lineText(handle: MeasureHandle, line: MeasureLine): string
  clear(): void
}
export interface MeasureHandle { readonly exact: boolean; readonly ready: Promise<void> | null }
export interface MeasureLine { width: number }

let loading: Promise<MeasureProvider> | undefined

/** The engine, loaded once. Rejects when nothing provides the slot. */
export function loadMeasure(): Promise<MeasureProvider> {
  const test = rt.slots?.['text.measure'] as MeasureProvider | undefined
  if (test) return Promise.resolve(test)
  // @ts-ignore a generated module (`weft plugins sync`), declared in .weft/slots.d.ts once bound
  return (loading ??= import('weft:slot/text.measure').then((m: any) => m.load()))
}

/** The engine, or null without one: for what has another way to get a height. */
export const measureEngine = (): Promise<MeasureProvider | null> => loadMeasure().catch(() => null)

export interface TextBox { height: number; lineCount: number }
export interface MeasureSpec {
  /** A font shorthand, `400 16px Inter`. Name a family, not `system-ui` (X002). */
  font: string
  /** CSS px. */
  lineHeight: number
  /** The wrap width in CSS px. */
  width: number
  whiteSpace?: 'normal' | 'pre-wrap'
}
type Read<T> = T | (() => T)
const read = <T,>(v: Read<T>): T => (typeof v === 'function' ? (v as () => T)() : v)

/** The engine as a cell, starting the load once, the first time anything reads it. */
function engine(): State<MeasureProvider | null> {
  const cell = state<MeasureProvider | null>(null)
  measureEngine().then(p => (cell.value = p))
  return cell
}

function prepared(text: Read<string>, spec: Read<MeasureSpec>, segments: boolean) {
  const p = engine(), bump = state(0)
  const handle = derived(() => {
    const e = p.value
    if (!e) return null
    const s = read(spec)
    return e.prepare(read(text), s.font, { segments, whiteSpace: s.whiteSpace })
  })
  effect(() => handle.value, h => {
    if (!h?.ready) return
    let live = true
    h.ready.then(() => { if (live) bump.value++ }) // an exact tier or pack arrived: lay out again
    onCleanup(() => (live = false))
  })
  return { p, handle, bump }
}

/** The box `text` takes at a width, before it's rendered. Null until the engine is here. Call it in a component. */
export function measure(text: Read<string>, spec: Read<MeasureSpec>): Derived<TextBox | null> {
  const { p, handle, bump } = prepared(text, spec, false)
  return derived(() => {
    bump.value
    const h = handle.value, s = read(spec)
    return h && p.value ? p.value.layout(h, s.width, s.lineHeight) : null
  })
}

/** The text of each line at a width, and how wide it is. */
export function lines(text: Read<string>, spec: Read<MeasureSpec>): Derived<{ text: string; width: number }[] | null> {
  const { p, handle, bump } = prepared(text, spec, true)
  return derived(() => {
    bump.value
    const h = handle.value, e = p.value
    return h && e ? e.lines(h, read(spec).width).map(l => ({ text: e.lineText(h, l), width: l.width })) : null
  })
}

export interface FitSpec {
  /** Everything but the size: `600 {size}px Inter`. */
  font: (size: number) => string
  /** Line height as a multiple of the size. Default 1.2. */
  leading?: number
  width: number
  /** Default 1. */
  maxLines?: number
  /** Default 10. */
  min?: number
  /** Default 200. */
  max?: number
}

/** The largest whole font size in px that keeps `text` to `maxLines` at `width`, by binary search. */
export function fit(text: Read<string>, spec: Read<FitSpec>): Derived<number | null> {
  const p = engine()
  return derived(() => {
    const e = p.value
    if (!e) return null
    const s = read(spec), value = read(text), leading = s.leading ?? 1.2, most = s.maxLines ?? 1
    let low = s.min ?? 10, high = s.max ?? 200
    while (low < high) {
      const size = Math.ceil((low + high) / 2)
      const handle = untrack(() => e.prepare(value, s.font(size)))
      const box = e.layout(handle, s.width, size * leading)
      if (box.lineCount <= most && e.lines(handle, s.width).every(l => l.width <= s.width)) low = size
      else high = size - 1
    }
    return low
  })
}
