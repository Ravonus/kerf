// @vitest-environment node
// The warp plugin: seed → tokens (gated by the spec's own contrast checker), classic fields, catalog and AGENTS text.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseAst } from 'vite'
import * as plugin from '../plugin.mjs'
import type { WarpOptions } from '../plugin.mjs'

type TokenFile = {
  color: Record<string, { $type: string; $value: { colorSpace: string; hex: string } }> & {
    $type: string
  }
  space: Record<string, { $value: { value: number; unit: string } }>
  radius: Record<string, { $value: { value: number } }>
  modifiers: { mode: { contexts: Record<string, unknown> } }
}
const { warp, dtcg } = plugin as typeof plugin & {
  dtcg: (css?: string) => Record<string, TokenFile>
}
type CardScheme = { text: string; background: string; subtle: string; accent: string }
type Contribution = {
  tokens: { css: string; values: { fields: string } }
  catalog: { name: string }[]
  agents: { text: string }
  card: { scheme: string; dark: CardScheme; light: CardScheme }
  notes: string[]
}
type LiteralNode = {
  type: string
  properties: { key: { name?: string; value?: string }; value: LiteralNode }[]
  value: unknown
  operator: string
  argument: LiteralNode
}

const run = (opts?: WarpOptions) =>
  warp(opts).contribute({
    command: 'build',
    mode: 'production',
    root: '',
  }) as unknown as Contribution
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return (e as { code: string }).code
  }
  return undefined
}

test('the default seed adds no CSS; the catalog names every export; the AGENTS section fits in 1 KB', () => {
  const out = run()
  expect(out.tokens.css).toBeUndefined()
  expect(out.tokens.values.fields).toBe('floating')
  const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  for (const c of out.catalog) expect(index, c.name).toMatch(new RegExp(`\\b${c.name}\\b`))
  expect(out.catalog.map((c) => c.name)).toEqual(
    expect.arrayContaining(['Button', 'Toggle', 'Input', 'Select', 'Tabs', 'Modal', 'Toaster']),
  )
  expect(Buffer.byteLength(out.agents.text)).toBeLessThanOrEqual(1024)
})

test('a seed that passes the spec checker at every stop becomes two token overrides', () => {
  const out = run({ seed: { hue: 180, chroma: 0.1 } })
  expect(out.tokens.css).toBe(
    '@layer warp.tokens{:root{--warp-seed-accent-h:180;--warp-seed-accent-c:0.1}}\n',
  )
  expect(run({ seed: { accent: '#0a7d4f' } }).tokens.css).toBe(
    '@layer warp.tokens{:root{--warp-seed-accent-h:158.6;--warp-seed-accent-c:0.118}}\n',
  )
}, 30_000)

// The checker covers both themes at every expression, so a hue passing here passes in light and dark.
test.each([0.03, 0.115, 0.2, 0.37])(
  'every hue passes at chroma %d',
  (chroma) => {
    for (let hue = 0; hue < 360; hue += 15)
      expect(
        code(() => run({ seed: { hue, chroma } })),
        `hue ${hue}`,
      ).toBeUndefined()
  },
  120_000,
)

test('every primary brand hex passes', () => {
  for (const accent of [
    '#ff0000',
    '#ffff00',
    '#00ff00',
    '#00ffff',
    '#0000ff',
    '#ff00ff',
    '#ff6a00',
    '#6a00ff',
  ])
    expect(
      code(() => run({ seed: { accent } })),
      accent,
    ).toBeUndefined()
}, 60_000)

test("a hue outside the default's window keeps its hue and chroma: only the lightness of two tokens moves", () => {
  const css = run({ seed: { hue: 270, chroma: 0.115 } }).tokens.css
  expect(css).toContain('--warp-seed-accent-h:270;--warp-seed-accent-c:0.115')
  expect(css).toMatch(
    /--warp-color-sweep:light-dark\( ?oklch\(0\.5[2-5]\d? min\(max\(calc\(var\(--_ac\) \* 1\.25\), 0\.12\), 0\.13\) var\(--_ah\)\), oklch\(0\.6 /,
  )
  expect(css).toMatch(
    /--warp-color-accent-text:light-dark\(oklch\(0\.46 min\(var\(--_ac\), 0\.12\) var\(--_ah\)\), oklch\(0\.8\d* var\(--_ac\) var\(--_ah\)\)\)/,
  )
}, 30_000)

test("a token that breaks contrast with a seed is D010, listing the pairs; an invalid seed is weft's option error (P115)", () => {
  let err!: { code: string; failures: unknown[] }
  try {
    run({ seed: { hue: 20, chroma: 0.2 }, tokens: { '--warp-color-accent-solid': '#ffffff' } })
  } catch (e) {
    err = e as typeof err
  }
  expect(err?.code).toBe('D010')
  expect(err.failures.length).toBeGreaterThan(0)
  expect(code(() => run({ seed: { hue: 400, chroma: 0.1 } }))).toBe('P115')
  expect(code(() => run({ seed: { accent: 'green' } }))).toBe('P115')
}, 30_000)

test('fields: "classic" re-scopes the spec\'s classic rules to the root, inside their layers', () => {
  const css = run({ fields: 'classic' }).tokens.css
  expect(css).toMatch(/^@layer warp\./)
  expect(css).toContain(':root:not([data-fields="floating"])')
  expect(css).not.toContain('[data-fields="classic"]')
})

test('dials become the default at the root, and markup on <html> still wins', () => {
  const css = run({ dials: { density: 'compact', expression: 'quiet' } }).tokens.css
  expect(css).toContain(':root:not([data-density]){--warp-density-k: 0.75')
  expect(css).toContain(':root:not([data-expression])')
  expect(css).not.toContain('[data-density="compact"]')
})

test('radius, fonts and tokens land on every scope, in a layer after the dial stops', () => {
  const css = run({
    radius: 'round',
    fonts: { body: 'Inter', mono: 'Menlo, monospace' },
    tokens: { '--warp-space-page': '20px' },
  }).tokens.css
  expect(css).toMatch(/^@layer warp\.base\{:root,\[data-expression\]/)
  expect(css).toContain('--warp-radius-control:14px')
  expect(css).toContain('--warp-font-sans:"Inter", ui-sans-serif')
  expect(css).toContain('--warp-font-mono:Menlo, monospace')
  expect(css).toContain('--warp-space-page:20px')
})

test('a token that breaks contrast fails D010 like a bad seed', () => {
  expect(code(() => run({ tokens: { '--warp-color-page': '#fafafa' } }))).toBe('D010') // dark text-on-page goes
  expect(
    code(() => run({ tokens: { '--warp-color-text': '#ffffff', '--warp-color-page': '#ffffff' } })),
  ).toBe('D010')
  expect(code(() => run({ tokens: { '--warp-color-accent-solid': '#ffffff' } }))).toBe('D010')
})

test('a token in the config beats the fitted one', () => {
  const sweep = 'light-dark(oklch(0.53 0.13 270), oklch(0.6 0.155 270))'
  const css = run({ seed: { hue: 270, chroma: 0.115 }, tokens: { '--warp-color-sweep': sweep } })
    .tokens.css
  expect(css).toContain(`--warp-color-sweep:${sweep}`)
  expect(css.match(/--warp-color-sweep:/g)).toHaveLength(1)
}, 30_000)

test.each([
  [{ dials: { nope: 'x' } }, 'dials.nope'],
  [{ dials: { density: 'huge' } }, 'dials.density'],
  [{ radius: 'pill' }, 'radius'],
  [{ fonts: { body: 'x;}' } }, 'fonts.body'],
  [{ tokens: { color: 'red' } }, 'tokens.color'],
  [{ tokens: { '--warp-color-page': 'red' } }, 'tokens.--warp-color-page'],
])('rejects %j', (input, path) => {
  let error!: { help: string }
  try {
    warp(input as WarpOptions)
  } catch (e) {
    error = e as typeof error
  }
  expect(error).toMatchObject({ code: 'P115', path })
})

test('dtcg: every theme × expression, DTCG colours and dimensions, and a resolver over them', () => {
  const files = dtcg()
  expect(Object.keys(files)).toHaveLength(7)
  const light = files['warp.light.quiet.tokens.json']!
  expect(light.color.$type).toBe('color')
  expect(light.color.text!.$value.colorSpace).toBe('srgb')
  expect(light.color.text!.$value.hex).toMatch(/^#[0-9a-f]{6}$/)
  expect(light.space.group!.$value).toEqual({ value: 16, unit: 'px' })
  expect(light.radius.control!.$value.value).toBe(8)
  expect(files['warp.dark.vivid.tokens.json']!.radius.control!.$value.value).toBe(2)
  expect(Object.keys(files['warp.resolver.json']!.modifiers.mode.contexts)).toHaveLength(6)
  expect(files['warp.dark.quiet.tokens.json']!.color.text!.$value.hex).not.toBe(
    light.color.text!.$value.hex,
  )
})
test('dtcg: the seed reaches the tokens', () => {
  const css = run({ seed: { hue: 20, chroma: 0.12 } }).tokens.css
  expect(dtcg(css)['warp.light.quiet.tokens.json']!.color['accent-solid']!.$value.hex).not.toBe(
    dtcg()['warp.light.quiet.tokens.json']!.color['accent-solid']!.$value.hex,
  )
})

test('D010 checks only the stops the dials leave, and still fails on those', () => {
  const page = { '--warp-color-page': '#f6f0e4' }
  expect(code(() => run({ tokens: page }))).toBe('D010')
  expect(code(() => run({ dials: { theme: 'light' }, tokens: page }))).toBeUndefined()
  expect(code(() => run({ dials: { theme: 'dark' }, tokens: page }))).toBe('D010')
}, 30_000)

test('a D010 says what to do, and the neutral seed lands on every scope', () => {
  let error!: { help: string }
  try {
    run({ tokens: { '--warp-color-page': '#fafafa' } })
  } catch (e) {
    error = e as typeof error
  }
  expect(error.help).toContain('weft docs theme')
  const css = run({ seed: { neutral: { hue: 60, chroma: 0.03 } } }).tokens.css
  expect(css).toMatch(/\[data-warp\]\{--warp-ref-neutral-h:60;--warp-ref-neutral-c:0\.03/)
  expect(run({ seed: { accent: '#0a7d4f', neutral: '#f5efe0' } }).tokens.css).toContain(
    '--warp-ref-neutral-h',
  )
  expect(code(() => warp({ seed: { neutral: 'beige' } }))).toBeDefined()
}, 30_000)

test('a brand colour says where it landed', () => {
  expect(run({ seed: { accent: '#c8102e' } }).notes[0]).toMatch(
    /accent #c8102e landed as #[0-9a-f]{6} light, #[0-9a-f]{6} dark/,
  )
  expect(run({ seed: { hue: 180, chroma: 0.1 } }).notes).toBeUndefined()
}, 30_000)

// a config in the docs is an object of plain literals: read it as one, without running it
const literal = (n: LiteralNode): unknown =>
  n.type === 'ObjectExpression'
    ? Object.fromEntries(n.properties.map((p) => [p.key.name ?? p.key.value!, literal(p.value)]))
    : n.type === 'Literal'
      ? n.value
      : n.type === 'UnaryExpression' && n.operator === '-'
        ? -(literal(n.argument) as number)
        : expect.fail(`not a literal: ${n.type}`)

test('every config in `weft docs theme` passes D010', () => {
  const doc = readFileSync(new URL('../../cli/docs/theme.md', import.meta.url), 'utf8')
  const looks = [...doc.matchAll(/```ts\nwarp\((\{[\s\S]*?\})\)\n```/g)].map((m) =>
    literal((parseAst(`(${m[1]})`).body[0] as unknown as { expression: LiteralNode }).expression),
  )
  expect(looks).toHaveLength(3)
  for (const look of looks)
    expect(
      code(() => run(look as WarpOptions)),
      JSON.stringify(look),
    ).toBeUndefined()
}, 60_000)

test('share cards get warp`s colours, in both schemes, readable, and the theme dial picks one', () => {
  const { card } = run()
  expect(card.scheme).toBe('dark')
  expect(run({ dials: { theme: 'light' } }).card.scheme).toBe('light')
  expect(run({ seed: { hue: 20, chroma: 0.1 } }).card.dark.accent).not.toBe(card.dark.accent)
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  }
  const contrast = (a: string, b: string) =>
    (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  for (const c of [card.dark, card.light]) {
    expect(contrast(c.text, c.background)).toBeGreaterThan(7)
    expect(contrast(c.subtle, c.background)).toBeGreaterThan(4.5)
    expect(contrast(c.accent, c.background)).toBeGreaterThan(3)
  }
})

test('selective choice mirrors do not duplicate configured classic rules', () => {
  const css = run({ fields: 'classic' }).tokens.css
  // The one canonical rule has hover and classic selectors.
  expect(css.match(/\[data-part="value"\]:empty/g)).toHaveLength(2)
})

test('named hex colours produce an app-local Tailwind entry; empty dictionaries keep default bytes', () => {
  const plain = run()
  const empty = run({ colors: {}, system: {}, parts: {}, themes: {} })
  expect(empty.tokens).toEqual(plain.tokens)
  const result = warp({ colors: { brand: 'ink', ink: '#123456' } }).contribute({
    command: 'build',
    mode: 'production',
    root: '/tmp/theme-app',
  }) as unknown as {
    tokens: { css: string; cssEntries: { tailwind: string }; alias: Record<string, string> }
  }
  expect(result.tokens.css).toContain('--warp-named-brand:#123456;--warp-named-ink:#123456')
  expect(result.tokens.cssEntries.tailwind).toContain('--color-brand: var(--warp-named-brand)')
  expect(result.tokens.alias['@weft-js/warp/tailwind.css']).toBe(
    '/tmp/theme-app/.weft/tokens/warp.tailwind.css',
  )
})

test('unsupported theme features and unsafe colours are rejected', () => {
  for (const input of [
    { colors: null },
    { colors: { brand: 'oklch(0.5 0.1 20)' } },
    { colors: { brand: { hue: 120, chroma: 0.1 } } },
    { themes: { ocean: { seed: { hue: 120, chroma: 0.1 } } } },
    { system: { motion: { scale: 2 } } },
  ])
    expect(code(() => run(input as WarpOptions))).toBe('P115')
})

test('Button candidate rejects unsupported properties and low-contrast text', () => {
  expect(() => run({ parts: { button: { mystery: '#000000' } } } as WarpOptions)).toThrow(
    /unknown property or unsupported state/,
  )
  // @ts-expect-error -- JavaScript callers still receive a diagnostic for unsupported states.
  expect(() => run({ parts: { button: { hover: { bg: '#000000' } } } })).toThrow(
    /unknown property or unsupported state/,
  )
  expect(
    code(() =>
      run({
        colors: { ink: '#111111' },
        parts: { button: { bg: '#000000', text: 'ink' } },
      }),
    ),
  ).toBe('D010')
})

test('accepts checked Button colours and emits themed CSS aliases', () => {
  const result = warp({
    colors: { ink: '#ffffff', shade: '#757575' },
    parts: { button: { bg: 'shade', text: 'ink' } },
  }).contribute({ command: 'build', mode: 'production', root: '/tmp/theme-app' }) as unknown as {
    tokens: { css: string; alias: Record<string, string> }
  }
  expect(result.tokens.css).toContain('--warp-config-part-button-bg:#757575')
  expect(result.tokens.css).toContain('--warp-config-part-button-text:#ffffff')
  expect(result.tokens.alias['@weft-js/warp/tailwind.css']).toBe(
    '/tmp/theme-app/.weft/tokens/warp.tailwind.css',
  )
  for (const [name, part] of [
    ['@weft-js/warp-core/styles/warp.css', 'warp.css'],
    ['@weft-js/warp-core/styles/components/button.css', 'components/button.css'],
  ] as const) {
    const target = result.tokens.alias[name]
    expect(target).toBeDefined()
    if (target === undefined) throw new Error(`missing alias: ${name}`)
    expect(target).toContain(`/styles/themed/${part}`)
    expect(readFileSync(target, 'utf8')).toContain('--warp-config-part-')
  }
  expect(code(() => run({ parts: { button: { bg: '#757575', text: '#757575' } } }))).toBe('D010')
  expect(
    code(() =>
      run({
        parts: { button: { bg: '#757575', text: '#ffffff' } },
        tokens: { '--warp-button-bg-hover': '#ffffff' },
      }),
    ),
  ).toBe('P115')
})

test('explicit sweep values take precedence and are checked against their actual neighbors', () => {
  try {
    run({
      parts: { button: { bg: '#757575', text: '#ffffff' } },
      tokens: { '--warp-sweep-stroke': '#757575', '--warp-config-part-sweep-stroke': '#ffffff' },
    })
    throw new Error('expected rejection')
  } catch (error) {
    const failure = error as {
      code: string
      failures: { path: string; fg: string; site: string }[]
    }
    expect(failure.code).toBe('D010')
    expect(failure.failures).toContainEqual(
      expect.objectContaining({
        path: 'tokens.--warp-sweep-stroke',
        fg: '--warp-sweep-stroke',
        site: 'stroke-base',
      }),
    )
    expect(failure.failures.some((row) => row.fg === '--warp-config-part-sweep-stroke')).toBe(false)
  }
})

test('Button sweep checks include modes reachable under a local theme override', () => {
  try {
    run({ dials: { theme: 'light' }, parts: { button: { bg: '#ffffff', text: '#000000' } } })
    throw new Error('expected rejection')
  } catch (error) {
    const failure = error as { code: string; failures: { combo: string; site: string }[] }
    expect(failure.code).toBe('D010')
    expect(failure.failures).toContainEqual(
      expect.objectContaining({
        combo: 'light/quiet',
        site: 'base-surface',
      }),
    )
    expect(failure.failures).toContainEqual(
      expect.objectContaining({
        combo: 'dark/balanced',
        site: 'stroke-base',
      }),
    )
  }
})

test.each(['label', 'text', 'base'])('checks configured sweep %s overrides', (name) => {
  const token = `--warp-config-part-sweep-${name}`
  const value = name === 'base' ? '#ffffff' : '#757575'
  try {
    run({
      parts: { button: { bg: '#757575', text: '#ffffff' } },
      tokens: { [token]: value },
    })
    throw new Error('expected rejection')
  } catch (error) {
    const failure = error as { code: string; failures: { path: string; fg: string }[] }
    expect(failure.code).toBe('D010')
    expect(failure.failures).toContainEqual(
      expect.objectContaining({ path: `tokens.${token}`, fg: token }),
    )
  }
})

test('named colour palettes resolve aliases, select a default and reset nested boundaries', () => {
  const out = run({
    colors: { brand: 'ink', ink: '#112233' },
    themes: { ocean: { colors: { ink: '#445566' } }, sunset: { colors: { ink: '#778899' } } },
    dials: { palette: 'ocean' },
  })
  const css = out.tokens.css
  const entries = out.tokens as unknown as {
    alias: Record<string, string>
    cssEntries: { tailwind: string }
  }
  expect(entries.alias['@weft-js/warp/tailwind.css']).toContain('.weft/tokens/warp.tailwind.css')
  expect(entries.cssEntries.tailwind).toContain('--color-brand: var(--warp-named-brand)')
  expect(css).toContain('--warp-palette-names:default ocean sunset;--warp-palette-default:ocean')
  expect(css).toContain(
    ':root:not([data-palette]){--warp-palette-current:ocean;--warp-named-brand:#445566;--warp-named-ink:#445566}',
  )
  expect(css).toContain(
    '[data-palette]{--warp-palette-current:default;--warp-named-brand:#112233;--warp-named-ink:#112233}',
  )
  expect(css).toContain(
    '[data-palette="sunset"]{--warp-palette-current:sunset;--warp-named-brand:#778899;--warp-named-ink:#778899}',
  )
  expect(run({ themes: {} }).tokens).toEqual(run().tokens)
  expect(run({ themes: { ocean: {} }, dials: { palette: 'auto' } }).tokens.css).toContain(
    '--warp-palette-default:default',
  )
})

test('named palettes reject unknown names and unsupported settings before emission', () => {
  for (const input of [
    { themes: null },
    { themes: { ocean: { colors: { missing: '#ffffff' } } } },
    { themes: { ocean: {} }, dials: { palette: 'missing' } },
    { themes: { ocean: {} }, dials: { palette: null } },
    { colors: { ocean: '#ffffff' }, themes: { ocean: {} } },
    { themes: { ocean: { parts: { button: { bg: '#000000', text: '#ffffff' } } } } },
    { themes: { ocean: {} }, tokens: { '--warp-color-page': '#ffffff' } },
    { themes: { ocean: { seed: { hue: 100, chroma: 0.1 } } } },
    { themes: { ocean: {} }, seed: { hue: 400, chroma: 0.1 } },
    { themes: { ocean: {} }, parts: { button: { bg: '#000000', text: '#ffffff' } } },
  ])
    expect(code(() => run(input as WarpOptions))).toBe('P115')
})

test('named tones retain full seed channels without colliding with named utility colours', () => {
  const result = run({ colors: { brand: '#112233', 'brand-tone-h': '#112233' } })
  const css = result.tokens.css
  expect(css).toContain('--warp-named-brand-tone-h:#112233')
  expect(css).toContain('--_warp-named-tone-brand-h:249.7')
  for (const part of ['button', 'badge', 'status-dot', 'pill', 'link', 'nav'])
    expect(css).toContain(`[data-scope="${part}"][data-tone="brand"]`)
  for (const channel of ['solid', 'solid-hover', 'ink-on', 'soft', 'text', 'border'])
    expect(css).toContain(`--_${channel}:light-dark(`)
  expect(css).not.toContain('[data-tone="unknown"]')
})

test('reuses exact contrast checks only within a plugin instance', () => {
  const script = `
    import child from 'node:child_process'
    import { syncBuiltinESMExports } from 'node:module'
    const original = child.execFileSync
    let calls = 0
    child.execFileSync = function (...args) { calls++; return original.apply(this, args) }
    syncBuiltinESMExports()
    const { warp } = await import(${JSON.stringify(new URL('../plugin.mjs', import.meta.url).href)})
    const env = { command: 'build', mode: 'production', root: '/tmp/theme-app' }
    const tokens = {}
    const first = warp({ colors: { brand: '#112233' }, tokens })
    const initial = calls
    const firstCss = first.contribute(env).tokens.css
    const afterFirst = calls
    tokens['--warp-color-accent-on-solid'] = '#111111'
    let invalid
    try { first.contribute(env) } catch (error) { invalid = error.code }
    const afterInvalid = calls
    const second = warp({ colors: { brand: '#445566' } })
    const afterSecond = calls
    const secondCss = second.contribute(env).tokens.css
    console.log(JSON.stringify({ initial, afterFirst, afterInvalid, invalid, afterSecond, final: calls, different: firstCss !== secondCss }))
  `
  const result = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    }),
  ) as {
    initial: number
    afterFirst: number
    afterInvalid: number
    invalid: string
    afterSecond: number
    final: number
    different: boolean
  }
  expect(result.initial).toBeGreaterThan(0)
  expect(result.afterFirst).toBe(result.initial)
  expect(result.invalid).toBe('D010')
  expect(result.afterInvalid).toBeGreaterThan(result.afterFirst)
  expect(result.afterSecond).toBeGreaterThan(result.afterInvalid)
  expect(result.final).toBe(result.afterSecond)
  expect(result.different).toBe(true)
})

test('a root seed applies to every named palette', () => {
  const seed = { hue: 100, chroma: 0.1, neutral: { hue: 85, chroma: 0.012 } }
  const base = run({ seed })
  const themed = run({ seed, themes: { ocean: {} }, dials: { palette: 'ocean' } })
  expect(base.tokens.css).toContain('--warp-seed-accent-h:100;--warp-seed-accent-c:0.1')
  expect(themed.tokens.css).toContain(base.tokens.css)
  expect(themed.tokens.css).toContain('--warp-palette-current:ocean')
  expect(themed.tokens.css).toContain('[data-palette]{--warp-palette-current:default}')
})

test('root system scales emit inherited inputs and reject invalid references', () => {
  const css = run({
    system: {
      space: { group: 12, inset: 'group' },
      radius: { card: 8 },
      font: { body: 'Inter, sans-serif' },
    },
  }).tokens.css
  expect(css).toContain('--warp-config-system-space-group:12px')
  expect(css).toContain(
    '--warp-config-system-space-inset:var(--warp-config-system-space-group,var(--warp-space-group))',
  )
  expect(css).toContain('--warp-config-system-radius-surface:8px')
  expect(css).toContain('--warp-config-system-font-sans:Inter, sans-serif')
  expect(run({ system: {} }).tokens).toEqual(run().tokens)
  for (const system of [
    { space: { group: -1 } },
    { space: { group: 'missing' } },
    { space: { a: 'b', b: 'a' } },
    { radius: { card: 2, surface: 3 } },
    { font: { body: 'x; color:red' } },
    { motion: { scale: 1 } },
  ])
    expect(code(() => run({ system } as WarpOptions))).toBe('P115')
})

test('bound system roles and resting Button layout emit configured inputs', () => {
  const result = run({
    system: {
      space: { group: 12 },
      radius: { card: 8 },
      text: {
        body: { family: 'Inter', size: 17, lineHeight: 1.4 },
        button: { transform: 'uppercase' },
      },
      shadow: { sm: '0 1px 2px #000' },
      motion: { duration: { sweep: 450, frame: '0.7s' } },
    },
    parts: {
      button: {
        gap: 'group',
        radius: 'card',
        paddingInline: 8,
        borderWidth: 2,
        font: { family: 'Inter', size: 14, weight: 600, letterSpacing: 1 },
      },
    },
  })
  for (const declaration of [
    '--warp-config-system-text-body-font:Inter',
    '--warp-config-system-text-body-size:17px',
    '--warp-config-system-text-body-leading:1.4',
    '--warp-config-system-text-button-case:uppercase',
    '--warp-config-system-elevation-1:0 1px 2px #000',
    '--warp-config-system-sweep-duration:450ms',
    '--warp-config-system-frame-duration:0.7s',
    '--warp-config-part-button-gap:var(--warp-config-system-space-group,var(--warp-space-group))',
    '--warp-config-part-button-radius:var(--warp-config-system-radius-surface,var(--warp-radius-surface))',
    '--warp-config-part-button-padding-inline:8px',
    '--warp-config-part-button-border-width:2px',
    '--warp-config-part-button-font-family:Inter',
    '--warp-config-part-button-font-size:14px',
    '--warp-config-part-button-font-weight:600',
    '--warp-config-part-button-font-letter-spacing:1px',
  ])
    expect(result.tokens.css).toContain(declaration)
  const aliases = (result.tokens as unknown as { alias: Record<string, string> }).alias
  expect(aliases['@weft-js/warp-core/styles/warp.css']).toContain('/styles/themed/warp.css')
  expect(aliases['@weft-js/warp-core/styles/components/button.css']).toContain(
    '/styles/themed/components/button.css',
  )
  expect(run({ system: {}, parts: { button: {} } }).tokens).toEqual(run().tokens)
})

test('rejects invalid bound non-colour values and unbound parts', () => {
  for (const config of [
    { system: { text: { caption: { weight: 400 } } } },
    { system: { text: { body: { size: -2 } } } },
    { system: { shadow: { sm: 'none; color:red' } } },
    { system: { motion: { duration: { sweep: -2 } } } },
    { parts: { button: { gap: 'missing' } } },
    { parts: { button: { font: { weight: -1 } } } },
    { parts: { nav: { gap: 4 } } },
  ])
    expect(code(() => run(config as WarpOptions))).toBe('P115')
})

test('Button colours can be combined with bound layout and errors retain paths', () => {
  const css = run({
    parts: { button: { bg: '#757575', text: '#ffffff', gap: 8 } },
  }).tokens.css
  expect(css).toContain('--warp-config-part-button-bg:#757575')
  expect(css).toContain('--warp-config-part-button-gap:8px')
  for (const [config, path] of [
    [{ system: { motion: { duration: { sweep: -1 } } } }, 'system.motion.duration.sweep'],
    [{ parts: { button: { font: { size: 'missing' } } } }, 'parts.button.font.size'],
    [{ parts: { field: { height: 32 } } }, 'parts.field'],
  ] as const) {
    try {
      warp(config as WarpOptions)
      throw new Error('expected rejection')
    } catch (error) {
      expect(error).toMatchObject({ code: 'P115', path })
    }
  }
})
