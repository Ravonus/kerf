// @vitest-environment node
// warp({ colors, system, parts, themes }): validation, the CSS it writes, its contrast gate, the Tailwind names, and
// the one table (theme-parts.mjs) the types are written from.
import { readFileSync } from 'node:fs'
import * as plugin from '../plugin.mjs'
import { allParts, PARTS, PROPS, STATES } from '../src/plugin/theme-parts.mjs'

const { warp } = plugin
type Out = { tokens: { css?: string; cssEntries?: { tailwind: string } } }
// the tests feed deliberately wrong options, so the options aren't typed
type Loose = Parameters<typeof warp>[0] | Record<string, unknown>
const run = (opts?: Loose) =>
  warp(opts as Parameters<typeof warp>[0]).contribute({
    command: 'build',
    mode: 'production',
    root: '',
  }) as unknown as Out
const fails = (opts: Loose) => {
  try {
    run(opts)
  } catch (error) {
    return error as Error & { path?: string; code?: string }
  }
  throw new Error('expected the options to be refused')
}

describe('theming', () => {
  test('no theming options writes no theming CSS', () => {
    const css = run().tokens.css ?? ''
    expect(css).not.toContain('warp.theme')
    expect(css).not.toContain('--warp-color-brand')
    expect(run().tokens.cssEntries).toBeUndefined()
  })

  test('named colours land as tokens and as tones', () => {
    const css = run({ colors: { brand: '#e8590c' } }).tokens.css ?? ''
    expect(css).toContain('--warp-color-brand:#e8590c')
    expect(css).toContain('[data-tone="brand"]')
    expect(css).toMatch(/@layer warp\.tokens,.*warp\.theme;/)
  })

  test('a part moves its tone channels, rest before hover', () => {
    const css =
      run({
        colors: { brand: '#e8590c', ink: '#1b1b1f' },
        parts: {
          button: { bg: 'brand', text: 'ink', radius: 'pill', hover: { bg: 'ink', text: 'white' } },
        },
      }).tokens.css ?? ''
    expect(css).toContain('--_solid:var(--warp-color-brand)')
    expect(css).toContain('--_solid-hover:var(--warp-color-ink)')
    expect(css).toContain('--_ink-on:var(--warp-color-ink)')
    expect(css.indexOf('--_solid:var(--warp-color-brand)')).toBeLessThan(css.indexOf(':hover'))
  })

  test('spacing and sizing take numbers as px and system names as tokens', () => {
    const css = run({ parts: { card: { padding: 32, gap: 'related' } } }).tokens.css ?? ''
    expect(css).toContain('padding:32px')
    expect(css).toContain('gap:var(--warp-space-related)')
  })

  test('a named theme writes under data-palette, the default also under :root', () => {
    const css =
      run({
        themes: { ocean: { seed: { accent: '#0b7285' }, colors: { brand: '#0b7285' } } },
        dials: { palette: 'ocean' },
      }).tokens.css ?? ''
    expect(css).toContain('[data-palette="ocean"]')
    expect(css).toContain(':root:not([data-palette])')
    expect(css).toContain('--warp-seed-accent-h')
    // a palette set below the root re-declares the stop's colour refs, or its primary keeps the page's hue
    expect(css).toContain(':where([data-palette="ocean"]:not(:root)){--warp-ref-primary-solid')
    expect(css).toContain(':where([data-expression="quiet"] [data-palette="ocean"]:not(:root))')
  })

  test('the Tailwind entry names every colour, theme colours too', () => {
    const tw = run({
      colors: { brand: '#e8590c' },
      themes: { night: { colors: { glow: '#7048e8' } } },
    }).tokens.cssEntries?.tailwind
    expect(tw).toContain('--color-brand: var(--warp-color-brand)')
    expect(tw).toContain('--color-glow: var(--warp-color-glow)')
  })

  test('refuses what it cannot read', () => {
    expect(fails({ colors: { Brand: '#e8590c' } }).path).toMatch(/colors/)
    expect(fails({ colors: { brand: 'orange' } }).path).toMatch(/colors\.brand/)
    expect(fails({ parts: { buton: { bg: 'red' } } }).path).toMatch(/parts\.buton/)
    expect(fails({ parts: { button: { glow: 1 } } }).path).toMatch(/parts\.button\.glow/)
    expect(fails({ parts: { nav: { hover: { gap: 2 } } } }).path).toMatch(/parts\.nav/)
    expect(fails({ parts: { button: { bg: 'nosuch' } } }).path).toMatch(/parts\.button\.bg/)
  })

  test('D010: text that is unreadable on its fill is refused', () => {
    const error = fails({
      colors: { brand: '#e8590c' },
      parts: { button: { bg: 'brand', text: 'white' } },
    })
    expect(error.code).toBe('D010')
  })
})

describe('the parts table', () => {
  test('every part has a selector with a state slot, and only known states', () => {
    for (const [path, spec] of allParts()) {
      expect(spec.sel, path).toContain('&')
      for (const s of spec.states ?? []) expect(Object.keys(STATES), `${path}: ${s}`).toContain(s)
    }
  })

  test('every component a part names is one warp exports', () => {
    const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
    for (const [name, spec] of Object.entries(PARTS))
      for (const c of (spec as { for?: string[] }).for ?? [])
        expect(index, `${name}: ${c}`).toMatch(new RegExp(`\\b${c}\\b`))
  })

  test('the types name every part and sub-part', () => {
    const dts = readFileSync(new URL('../plugin.d.mts', import.meta.url), 'utf8')
    for (const [name, spec] of Object.entries(PARTS)) {
      expect(dts, name).toMatch(new RegExp(`\\b${name}\\??:`))
      // emphasis sub-parts come through a mapped type: `'soft' | 'outline' …`
      for (const sub of Object.keys((spec as { sub?: object }).sub ?? {}))
        expect(dts, `${name}.${sub}`).toMatch(new RegExp(`\\b${sub}\\??:|'${sub}'`))
    }
    for (const prop of Object.keys(PROPS)) expect(dts, prop).toMatch(new RegExp(`\\b${prop}\\??:`))
  })
})
