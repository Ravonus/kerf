// @vitest-environment node
// warp({ colors, system, parts, themes }): validation, the CSS it writes, its contrast gate, the Tailwind names, and
// the one table (theme-parts.mjs) the types are written from.
import { readFileSync } from 'node:fs'
import * as plugin from '../plugin.mjs'
import { allParts, PARTS, PROPS, STATES } from '../src/plugin/theme-parts.mjs'

const { warp } = plugin
type Out = { tokens: { css?: string; cssEntries?: { tailwind: string } } }
// the tests feed deliberately wrong options, so the options aren't typed
type Loose = Record<string, unknown>
const run = (opts?: Loose) =>
  warp(opts).contribute({
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
    expect(css).not.toContain('warp.layout{')
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

  test('a seed can name a colour', () => {
    const named = run({ colors: { brand: '#0b7285' }, seed: { accent: 'brand' } }).tokens.css ?? ''
    const hex = run({ seed: { accent: '#0b7285' } }).tokens.css ?? ''
    expect(named).toContain(/--warp-seed-accent-h:[^;]+/.exec(hex)![0])
    const themed = run({
      themes: { ocean: { colors: { deep: '#0b7285' }, seed: { accent: 'deep' } } },
    })
    expect(themed.tokens.css).toContain('[data-palette="ocean"]{--warp-seed-accent-h')
  })

  test('the Tailwind entry names every colour, theme colours too', () => {
    const tw = run({
      colors: { brand: '#e8590c' },
      themes: { night: { colors: { glow: '#7048e8' } } },
    }).tokens.cssEntries?.tailwind
    expect(tw).toContain('--color-brand: var(--warp-color-brand)')
    expect(tw).toContain('--color-glow: var(--warp-color-glow)')
  })
})

describe('text roles', () => {
  test("an app's own role gets tokens and a rule; warp's roles get tokens only", () => {
    const css =
      run({
        system: {
          text: {
            narrative: { size: 28, leading: 0.96, font: 'Georgia, serif' },
            display: { size: 72, weight: 700 },
          },
        },
        themes: { print: { system: { text: { initial: { size: 70 } } } } },
      }).tokens.css ?? ''
    expect(css).toContain('--warp-text-narrative-size:28px;--warp-text-narrative-leading:0.96')
    expect(css).toContain('--warp-text-narrative-font:Georgia, serif')
    expect(css).toContain(
      '@layer warp.layout{:where([data-scope="text"][data-role="narrative"]){font-size:var(--warp-text-narrative-size);line-height:var(--warp-text-narrative-leading);font-family:var(--warp-text-narrative-font)}',
    )
    // a role first named by a theme is applied everywhere; its value lands under the palette
    expect(css).toContain(':where([data-scope="text"][data-role="initial"]){font-size:')
    expect(css).toContain('--warp-text-display-size:72px')
    expect(css).not.toContain('[data-role="display"]')
  })

  test('refuses a role it cannot name and a property warp has no token for', () => {
    expect(fails({ system: { text: { Narrative: { size: 20 } } } }).path).toBe(
      'system.text.Narrative',
    )
    expect(fails({ system: { text: { narrative: { colour: 'red' } } } }).path).toBe(
      'system.text.narrative.colour',
    )
    expect(fails({ system: { text: { body: { tracking: '1px' } } } }).message).toMatch(
      /warp has no --warp-text-body-tracking/,
    )
  })
})

describe('text roles by width', () => {
  test('a value by width: a base, then a step or a fluid line from each min-width', () => {
    const css =
      run({
        system: {
          text: {
            display: { size: { base: 72, 768: { min: 120, max: 220, to: 1680 } } },
            body: { size: { base: 16, 768: 14 } },
            narrative: { size: { min: 28, max: 48, from: 390, to: 1680 } },
          },
        },
        themes: { print: { system: { text: { body: { size: { 1200: 15 } } } } } },
      }).tokens.css ?? ''
    // 120 at 768 to 220 at 1680: 35.79px + 10.965vw, in the user's rem (warp's root is the body size)
    const rem = (n: number) => `${n} * var(--warp-rem)`
    const fluid = `clamp(calc(${rem(7.5)}), calc(${rem(2.2368)} + 10.9649vw), calc(${rem(13.75)}))`
    expect(css).toContain('--warp-text-display-size:72px')
    expect(css).toContain('--warp-text-body-size:16px')
    expect(css).toMatch(
      new RegExp(
        `@media \\(min-width:768px\\)\\{@layer warp\\.base\\{:root,[^{]+\\{--warp-text-display-size:${fluid.replace(/[()+.*-]/g, '\\$&')};--warp-text-body-size:14px\\}\\}\\}`,
      ),
    )
    expect(css).toContain(
      `--warp-text-narrative-size:clamp(calc(${rem(1.75)}), calc(${rem(1.3721)} + 1.5504vw), calc(${rem(3)}))`,
    )
    expect(css).toMatch(
      /@media \(min-width:1200px\)\{@layer warp\.theme\{\[data-palette="print"\],[^{]+\{--warp-text-body-size:15px\}/,
    )
    // the base block comes first, so a breakpoint wins over it in the same layer
    expect(css.indexOf('--warp-text-body-size:16px')).toBeLessThan(
      css.indexOf('--warp-text-body-size:14px'),
    )
  })

  test('refuses a breakpoint it cannot read and a fluid line it cannot draw', () => {
    expect(fails({ system: { text: { body: { size: { wide: 14 } } } } }).path).toBe(
      'system.text.body.size.wide',
    )
    expect(
      fails({ system: { text: { body: { size: { min: 14, max: 18, to: 900 } } } } }).path,
    ).toBe('system.text.body.size')
    expect(
      fails({ system: { text: { body: { leading: { 768: { min: 1, max: 2, to: 900 } } } } } })
        .message,
    ).toMatch(/only size and tracking/)
  })
})

describe('motion tokens', () => {
  test('the app names durations and curves; parts and themes read them by name', () => {
    const css =
      run({
        system: {
          duration: { state: 150, glide: 300, fast: 150 },
          ease: { ui: [0.4, 0, 0.2, 1], scrub: 'cubic-bezier(0.65, 0, 0.35, 1)' },
        },
        parts: { button: { duration: 'glide', easing: 'ui' }, card: { easing: [0.2, 0, 0, 1] } },
        themes: {
          calm: { system: { duration: { linger: 900 } }, parts: { card: { duration: 'linger' } } },
        },
      }).tokens.css ?? ''
    expect(css).toContain('--warp-duration-state:150ms;--warp-duration-glide:300ms')
    expect(css).toContain('--warp-duration-fast:150ms')
    expect(css).toContain('--warp-ease-ui:cubic-bezier(0.4, 0, 0.2, 1)')
    expect(css).toContain('--warp-ease-scrub:cubic-bezier(0.65, 0, 0.35, 1)')
    expect(css).toContain(
      'transition-duration:var(--warp-duration-glide);transition-timing-function:var(--warp-ease-ui)',
    )
    expect(css).toContain('transition-timing-function:cubic-bezier(0.2, 0, 0, 1)')
    expect(css).toContain('--warp-duration-linger:900ms')
    expect(css).toContain('transition-duration:var(--warp-duration-linger)')
  })

  test("refuses a name warp already uses, a name it can't read and handles out of range", () => {
    expect(fails({ system: { duration: { 'exit-k': 2 } } }).path).toBe('system.duration.exit-k')
    expect(fails({ system: { duration: { Glide: 300 } } }).path).toBe('system.duration.Glide')
    expect(fails({ system: { ease: { ui: [2, 0, 0, 1] } } }).path).toBe('system.ease.ui')
    expect(fails({ system: { ease: { ui: [0.4, 0] } } }).path).toBe('system.ease.ui')
    expect(fails({ parts: { card: { duration: [1, 2, 3, 4] } } }).path).toBe('parts.card.duration')
  })
})

describe('theming checks', () => {
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

describe('the compiler without the plugin', () => {
  test('runs from the stylesheet facts alone, with no Node import', async () => {
    for (const f of [
      'theme.mjs',
      'theme-css.mjs',
      'theme-parts.mjs',
      'theme-values.mjs',
      'seed.mjs',
    ])
      expect(readFileSync(new URL(`../src/plugin/${f}`, import.meta.url), 'utf8')).not.toMatch(
        /from 'node:/,
      )
    const theme = await import('../src/plugin/theme.mjs')
    const { themeContext } = await import('../src/plugin/theme-context.mjs')
    const ctx = themeContext(new URL('../../warp-core/', import.meta.url))
    const o = theme.themeOptions(
      {
        themes: { studio: { seed: { accent: '#e8590c' }, parts: { button: { radius: 'pill' } } } },
      },
      ctx.tokenNames,
      {
        seed: (s: unknown) => theme.normalizeSeed(s),
        tokens: (t: Record<string, string> | undefined, p: string) => theme.checkTokens(t, p) ?? {},
      },
    )
    const css = theme.themeCss(o, ctx)
    expect(css).toContain('[data-palette="studio"]{--warp-seed-accent-h:')
    expect(css).toContain(':where([data-palette="studio"]) :where([data-scope="button"]),')
    expect(css).toContain('{border-radius:9999px;')
  })
})
