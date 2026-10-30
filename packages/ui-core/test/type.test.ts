// @vitest-environment node
// The fluid type layer mirrors the spec CSS exactly (research 26 §5), and skeletonShape() sizes spec skeleton parts.
import { readFileSync } from 'node:fs'
import { TYPE_SCALE, MAX_FLUID_RATIO, fluid, fluidCss, fluidRatio, skeletonShape, isPart, type SkeletonBox, type Stop } from '../src/index'

const css = readFileSync(new URL('../styles/warp.css', import.meta.url), 'utf8')

/** The `--warp-ref-*` declarations of the first rule whose selector names the stop. */
function refs(stop: Stop): Record<string, number> {
  const selector = stop === 'balanced' ? ':root, [data-expression="balanced"] {' : `[data-expression="${stop}"] {`
  const start = css.indexOf(selector)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const body = css.slice(start, css.indexOf('\n}', start))
  return Object.fromEntries([...body.matchAll(/--warp-ref-((?:display|title)-(?:min|b|m|max)):\s*([\d.]+)/g)].map(m => [m[1], Number(m[2])]))
}

test('TYPE_SCALE is the spec CSS, at every dial stop', () => {
  for (const stop of ['quiet', 'balanced', 'vivid'] as const) {
    const r = refs(stop)
    for (const role of ['display', 'title'] as const) {
      expect(TYPE_SCALE[stop][role], `${stop} ${role}`).toEqual({ min: r[`${role}-min`], b: r[`${role}-b`], m: r[`${role}-m`], max: r[`${role}-max`] })
    }
  }
})

test('the spec clamps display and title on the fluid unit, with rem floors and ceilings', () => {
  expect(css).toMatch(/--warp-text-display-size: clamp\(calc\(var\(--warp-ref-display-min\) \* var\(--warp-rem\)\),\s+calc\(var\(--warp-ref-display-b\) \* var\(--warp-rem\) \+ var\(--warp-ref-display-m\) \* var\(--_fu\)\)/)
  expect(css).toContain('@supports (width: 1cqi) { :root { --warp-ref-fluid-unit: 1cqi; } }')
})

test('every fluid size stays zoomable: max/min ≤ 2.5 (X006)', () => {
  for (const stop of Object.values(TYPE_SCALE)) for (const f of Object.values(stop)) expect(fluidRatio(f)).toBeLessThanOrEqual(MAX_FLUID_RATIO)
})

test('fluid() reproduces the spec from its px ends (375 → 1280)', () => {
  for (const stop of ['quiet', 'balanced', 'vivid'] as const) {
    for (const role of ['display', 'title'] as const) {
      const s = TYPE_SCALE[stop][role]
      const f = fluid(s.min * 16, s.max * 16)
      expect(f.b).toBeCloseTo(s.b, 2)
      expect(f.m).toBeCloseTo(s.m, 2)
    }
  }
  expect(fluid(34, 52)).toEqual({ min: 2.125, b: 1.6588, m: 1.989, max: 3.25 })
  expect(() => fluid(16, 20, { from: 800, to: 400 })).toThrow(RangeError)
})

test('fluidCss() writes the clamp with a rem term', () => {
  expect(fluidCss(fluid(34, 52))).toBe('clamp(2.125rem, calc(1.6588rem + 1.989cqi), 3.25rem)')
  expect(fluidCss(TYPE_SCALE.balanced.title, { rem: 'var(--warp-rem)', unit: 'var(--warp-ref-fluid-unit)' })).toBe(
    'clamp(calc(1.5 * var(--warp-rem)), calc(1.345 * var(--warp-rem) + 0.663 * var(--warp-ref-fluid-unit)), calc(1.875 * var(--warp-rem)))',
  )
})

const parts = (box: SkeletonBox): string[] => box.children.flatMap(c => (isPart(c) ? [c.shape] : parts(c)))

test('skeletonShape(): counts follow the spec, text bars fill a body line box', () => {
  const text = skeletonShape({ kind: 'text', lines: 4 })
  expect(parts(text)).toEqual(['text', 'text', 'text', 'text'])
  expect(text.style).toContain('flex-direction:column') // bars' margins never collapse
  const last = text.children[3] as { style: string }
  expect(last.style).toContain('inline-size:60%')
  expect(last.style).toContain('margin-block:calc((var(--warp-text-body-leading, 1.55) * 1em - 0.7em) / 2)')

  expect(parts(skeletonShape({ kind: 'list', rows: 5 }))).toEqual(Array(5).fill(['circle', 'text', 'text']).flat())
  expect(parts(skeletonShape({ kind: 'list', rows: 2, avatar: false }))).toEqual(['text', 'text', 'text', 'text'])
  expect(parts(skeletonShape({ kind: 'table', rows: 2, cols: 4 }))).toHaveLength(8)

  const card = skeletonShape({ kind: 'card', media: '16:9', lines: 2 })
  expect(parts(card)).toEqual(['block', 'text', 'text', 'text'])
  expect((card.children[0] as { style: string }).style).toContain('aspect-ratio:16 / 9')
  expect(parts(skeletonShape({ kind: 'card' }))).toEqual(['text', 'text', 'text'])
  expect(() => skeletonShape({ kind: 'grid' as never })).toThrow(/unknown kind/)
})
