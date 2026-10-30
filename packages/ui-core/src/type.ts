// The fluid type tokens as data (research 11 §8.3, research 26 §5). The spec CSS (styles/warp.css) is the source:
// display and title are clamp(min·rem, b·rem + m·cqi, max·rem), in --warp-rem, with --warp-ref-fluid-unit falling
// back to 1vw where container units are missing. This is a checked mirror of those numbers (test/type.test.mjs
// parses warp.css), so a binding, a Surface or the CLI can compute with them without re-deriving the spec.

export type FluidRole = 'display' | 'title'
export type Stop = 'quiet' | 'balanced' | 'vivid'

/** One fluid size in the spec's form: min/b/max in rem, m in fluid units (1cqi = 1% of the container). */
export interface Fluid {
  min: number
  b: number
  m: number
  max: number
}

/** The spec's `--warp-ref-{display,title}-{min,b,m,max}` per dial stop. */
export const TYPE_SCALE: Readonly<Record<Stop, Readonly<Record<FluidRole, Fluid>>>> = {
  quiet: {
    display: { min: 2.125, b: 1.861, m: 1.127, max: 2.7625 },
    title: { min: 1.5, b: 1.345, m: 0.663, max: 1.875 },
  },
  balanced: {
    display: { min: 2.125, b: 1.659, m: 1.989, max: 3.25 },
    title: { min: 1.5, b: 1.345, m: 0.663, max: 1.875 },
  },
  vivid: {
    display: { min: 2.507, b: 1.958, m: 2.347, max: 3.835 },
    title: { min: 1.716, b: 1.539, m: 0.7585, max: 2.145 },
  },
}

/** The reference widths the spec's fluid sizes run between: phone (375) to desktop (1280). */
export const FLUID_RANGE = { from: 375, to: 1280 } as const

/** WCAG 1.4.4: with max/min ≤ 2.5, 200% zoom still at least doubles a fluid size (X006 above it). */
export const MAX_FLUID_RATIO = 2.5

const round = (n: number, places = 4) => Math.round(n * 10 ** places) / 10 ** places

/**
 * A fluid size from `minPx` at `from` to `maxPx` at `to` (CSS px; 1rem = 16px), in the spec's form.
 * `fluid(34, 52)` is balanced display: { min: 2.125, b: 1.659, m: 1.989, max: 3.25 }.
 */
export function fluid(minPx: number, maxPx: number, range: { from?: number; to?: number } = {}): Fluid {
  const { from = FLUID_RANGE.from, to = FLUID_RANGE.to } = range
  if (!(to > from)) throw new RangeError('fluid(): `to` must be wider than `from`')
  const slope = (maxPx - minPx) / (to - from) // px per px of width
  return { min: round(minPx / 16), b: round((minPx - slope * from) / 16), m: round(slope * 100), max: round(maxPx / 16) }
}

/** max/min of a fluid size (X006 above MAX_FLUID_RATIO). */
export const fluidRatio = (f: Fluid) => f.max / f.min

/**
 * The CSS for a fluid size, as the spec writes it: `rem` is the length the rem terms multiply (the spec uses
 * `var(--warp-rem)`; plain `1rem` outside warp), `unit` the fluid unit (`var(--warp-ref-fluid-unit)`, or `1cqi`).
 */
export function fluidCss(f: Fluid, { rem = '1rem', unit = '1cqi' }: { rem?: string; unit?: string } = {}): string {
  const r = (n: number) => (rem === '1rem' ? `${n}rem` : `calc(${n} * ${rem})`)
  const u = unit === '1cqi' ? `${f.m}cqi` : `${f.m} * ${unit}`
  return `clamp(${r(f.min)}, calc(${rem === '1rem' ? `${f.b}rem` : `${f.b} * ${rem}`} + ${u}), ${r(f.max)})`
}
