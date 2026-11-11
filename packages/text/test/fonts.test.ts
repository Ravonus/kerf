// font.build@1 on a real face (Inter 4, @fontsource/inter 5.3.0): options, subsets, the matched fallback face
// (research 11 §8.2's values), preloads, budgets and the cache.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { text } from '../plugin/index.mjs'
import {
  BUDGET,
  RANGES,
  createFontBuild,
  fallbackFace,
  limited,
  pinned,
  rangeText,
  readAxes,
  scanAxes,
  toRange,
} from '../plugin/build.mjs'
import { scopedText } from '../plugin/glyphs.mjs'

type FontOptions = Parameters<typeof createFontBuild>[0] & { trim?: boolean }
const fontBuild: (options: FontOptions) => ReturnType<typeof createFontBuild> = createFontBuild

// Figtree, variable on wght 300–900 (OFL), as the landing template ships it.
const figtree = fileURLToPath(
  new URL('../../create/templates/landing/files/assets/fonts/figtree.woff2', import.meta.url),
)

const inter = (w: number) =>
  fileURLToPath(
    new URL(
      `../node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2`,
      import.meta.url,
    ),
  )

describe('text() options', () => {
  it('provides font.build with its build module and the resolved faces', () => {
    const p = text({
      fonts: {
        body: { family: 'Inter', src: './fonts/Inter.woff2', fallback: 'Arial' },
        mono: { family: 'Plex', src: './p.woff2', fallback: 'Courier New', display: 'optional' },
      },
    })
    expect(p.provides).toEqual(['font.build', 'text.measure'])
    const [ref] = p.contribute({ command: 'check', mode: 'development', root: '' }).provides!
    expect(ref!.sides.build!.module).toBe(
      fileURLToPath(new URL('../plugin/build.mjs', import.meta.url)),
    )
    expect(ref!.sides.build!.export).toBe('createFontBuild')
    const resolved = ref!.sides.build!.options as unknown as FontOptions
    expect(resolved.fonts).toEqual({
      body: {
        family: 'Inter',
        src: './fonts/Inter.woff2',
        fallback: 'Arial',
        display: 'swap',
        weight: 400,
        style: 'normal',
        axes: {},
        preload: true,
      },
      mono: {
        family: 'Plex',
        src: './p.woff2',
        fallback: 'Courier New',
        display: 'optional',
        weight: 400,
        style: 'normal',
        axes: {},
        preload: false,
      },
    })
    expect(resolved.subsets).toEqual(['latin'])
    expect(resolved.trim).toBe(true)
  })

  it('its agent notes say the fonts load on their own, and where the docs are', () => {
    const { text: notes } = text().contribute({
      command: 'check',
      mode: 'development',
      root: '',
    }).agents!
    expect(notes).toContain('no import')
    expect(notes).toContain('weft docs fonts')
    expect(notes).not.toContain("import 'weft:fonts'")
  })

  registerInvalidFontOptions()
})

function registerInvalidFontOptions() {
  it('rejects block display (X021), unknown subsets and measure, as P115 with the path', () => {
    const bad: [unknown, string, RegExp][] = [
      [
        { fonts: { body: { family: 'Inter', src: 'a', fallback: 'Arial', display: 'block' } } },
        'fonts.body.display',
        /X021/,
      ],
      [
        { fonts: { body: { family: 'Inter', src: 'a' } } },
        'fonts.body.fallback',
        /non-empty string/,
      ],
      [{ subsets: ['klingon'] }, 'subsets.0', /unknown subset/],
      [{ measure: 'on' }, 'measure', /'auto' or 'off'/],
      [{ engine: 'fast' }, 'engine', /'slim' \| 'pretext'/],
      [{ trim: 'no' }, 'trim', /true or false/],
      [
        { fonts: { body: { family: 'Inter', src: 'a', fallback: 'Arial', glyphs: '' } } },
        'fonts.body.glyphs',
        /characters the face draws/,
      ],
      [
        {
          fonts: {
            body: { family: 'Inter', src: 'a', fallback: 'Arial', glyphs: { selector: 'p > b' } },
          },
        },
        'fonts.body.glyphs.selector',
        /\.class, \[attr="value"\] or a tag/,
      ],
    ]
    for (const [input, path, message] of bad) {
      let error
      try {
        text(input as Parameters<typeof text>[0])
      } catch (e) {
        error = e
      }
      expect(error, path).toMatchObject({ code: 'P115', path })
      expect((error as Error).message).toMatch(message)
    }
  })
}

it('rangeText() expands a unicode-range', () => {
  expect(rangeText('U+0041-0043,U+0061')).toBe('ABCa')
})

it("the fallback face matches research 11's Inter/Arial numbers", async () => {
  const arial = (await import('@capsizecss/metrics/arial')).default
  const interMetrics = {
    unitsPerEm: 2048,
    ascent: 1984,
    descent: -494,
    lineGap: 0,
    xWidthAvg: 978,
    subsets: { latin: { xWidthAvg: 978 } },
  }
  expect(fallbackFace(interMetrics, arial)).toEqual({
    sizeAdjust: '107.12%',
    ascentOverride: '90.44%',
    descentOverride: '22.52%',
    lineGapOverride: '0%',
  })
})

describe('createFontBuild().build()', () => {
  let cacheDir: string
  beforeEach(() => (cacheDir = mkdtempSync(join(tmpdir(), 'weft-fonts-'))))
  afterEach(() => rmSync(cacheDir, { recursive: true, force: true }))

  const opts = Object.assign(
    {},
    text({
      fonts: {
        body: { family: 'Inter', src: inter(400), fallback: 'Arial' },
        heading: {
          family: 'Inter',
          src: inter(700),
          fallback: 'Arial',
          weight: 700,
          preload: false,
        },
        label: { family: 'Inter', src: inter(400), fallback: 'Arial' }, // the same face as body: emitted once
      },
      subsets: ['latin', 'latin-ext'],
    }).contribute({ command: 'build', mode: 'production', root: '' }).provides![0]!.sides.build!
      .options as FontOptions,
    { trim: false },
  )
  registerFontSubsetTests(opts, () => cacheDir)

  it('reports X022 when preloads go over budget', async () => {
    const many = Object.fromEntries(
      [400, 500, 600, 700, 800, 900].map((w) => [
        `r${w}`,
        { ...opts.fonts.body!, src: inter(w), weight: w, preload: true },
      ]),
    )
    const out = await fontBuild({ fonts: many, subsets: ['latin'], trim: false }).build({
      root: '/',
      cacheDir,
      url: (n) => n,
    })
    expect(out.report.preloadBytes).toBeGreaterThan(BUDGET.preloadBytes)
    expect(out.report.overBudget.map(([code]) => code)).toEqual(['X022'])
  })

  it('names the fix for an unknown fallback', async () => {
    await expect(
      fontBuild({
        fonts: { body: { ...opts.fonts.body!, fallback: 'Comic Neue Mono' } },
        subsets: ['latin'],
      }).build({ root: '/', cacheDir, url: (n) => n }),
    ).rejects.toThrow(/no metrics for fallback "Comic Neue Mono"/)
  })
  registerFontTrimmingTests(opts, () => cacheDir)
  registerGlyphTests(opts, () => cacheDir)
})

describe('scopedText()', () => {
  const page = `
    .narrative::first-letter { font-family: var(--font-script) }
    <p class="narrative">Remember every shopper,<br class="wide" /> {'accept'} cards.</p>
    <p class="lead narrative">“Quiet{' '}<em>shops</em></p>
    <Text role="initial">Ü</Text>
    <p data-role="initial">{"Ç"}</p>`

  it("reads the text of each element a selector matches, or each one's first letter", () => {
    expect(scopedText(page, { selector: '.narrative', first: true })).toEqual({ text: 'R“Q' })
    expect(scopedText(page, { selector: '[data-role="initial"]' })).toEqual({ text: 'ÜÇ' })
    const all = scopedText(page, { selector: '.narrative' }).text!
    for (const c of 'Rmb,acpt.“Qshp ') expect(all, c).toContain(c)
    expect(all).not.toContain('{')
  })

  it('names the element whose text it cannot read, and a selector that matches nothing', () => {
    const dynamic = '<p class="narrative">{copy.narrative}</p>'
    expect(scopedText(dynamic, { selector: '.narrative' }).unread).toMatch(/expression/)
    expect(scopedText(dynamic, { selector: '.narrative', first: true }).unread).toMatch(
      /expression/,
    )
    // the first letter is literal, so what follows it doesn't matter
    expect(
      scopedText('<p class="narrative">R{rest}</p>', { selector: '.narrative', first: true }),
    ).toEqual({ text: 'R' })
    expect(scopedText(page, { selector: '.missing' }).unread).toMatch(/no element matches/)
  })
})

function registerGlyphTests(opts: FontOptions, getCacheDir: () => string) {
  describe('glyphs', () => {
    it('reads a scope from the source in a build, and keeps the face whole when it cannot', async () => {
      const scoped = {
        fonts: { initial: { ...opts.fonts.body!, glyphs: { selector: '.dropcap' } } },
        subsets: ['latin'],
      }
      const build = (source: string, dev = false) =>
        fontBuild(scoped).build({ root: '/', cacheDir: getCacheDir(), url: (n) => n, source, dev })
      const read = await build('<span class="dropcap">W</span>')
      expect(read.css).toContain('unicode-range:U+0057}')
      const unread = await build('<span class="dropcap">{letter}</span>')
      expect(unread.files.map((f) => f.name)).toHaveLength(2)
      expect(unread.report.faces[0]).toMatchObject({
        glyphs: expect.stringMatching(/^kept whole: /),
      })
      expect((await build('', true)).css).toContain('unicode-range:U+0000-00FF')
    })

    it('cuts a face to the characters it lists, in a build and in dev', async () => {
      const all = await fontBuild({ fonts: { body: opts.fonts.body! }, subsets: ['latin'] }).build({
        root: '/',
        cacheDir: getCacheDir(),
        url: (n) => n,
        source: '<p>Remember</p>',
      })
      for (const dev of [false, true]) {
        const out = await fontBuild({
          fonts: { initial: { ...opts.fonts.body!, glyphs: 'RRA', preload: true } },
          subsets: ['latin', 'latin-ext'],
        }).build({ root: '/', cacheDir: getCacheDir(), url: (n) => n, dev })
        expect(out.files.map((f) => f.name.replace(/-[0-9a-f]{8}\.woff2$/, ''))).toEqual([
          'inter-400-glyphs',
        ])
        expect(out.css).toContain('unicode-range:U+0041,U+0052}')
        expect(out.preloads).toEqual([{ href: out.files[0]!.name, type: 'font/woff2' }])
        expect(out.files[0]!.bytes.length).toBeLessThan(all.files[0]!.bytes.length / 4)
      }
    })
  })
}

describe('axes', () => {
  const SOFT = { tag: 'SOFT', min: 0, default: 0, max: 100 }
  const WONK = { tag: 'WONK', min: 0, default: 1, max: 1 }
  const WGHT = { tag: 'wght', min: 100, default: 400, max: 900 }
  const OPSZ = { tag: 'opsz', min: 9, default: 14, max: 144 }
  registerAxisScanTests()

  it('pins unmentioned custom axes to their default and single values to that value, never registered ones', () => {
    expect(pinned([SOFT, WONK, WGHT, OPSZ], {}, scanAxes(''))).toEqual({ SOFT: 0, WONK: 1 })
    expect(
      pinned([SOFT, WONK, WGHT], {}, scanAxes('a{font-variation-settings:"SOFT" 60,"WONK" 0}')),
    ).toEqual({ SOFT: 60, WONK: 0 })
    expect(pinned([SOFT], {}, scanAxes('a{font-variation-settings:"SOFT" 500}'))).toEqual({
      SOFT: 100,
    })
  })

  it('keeps an axis the source varies, one the config declares, and all of them on a dynamic value', () => {
    expect(
      pinned(
        [SOFT, WONK],
        {},
        scanAxes('a{font-variation-settings:"SOFT" 10}b{font-variation-settings:"SOFT" 90}'),
      ),
    ).toEqual({ WONK: 1 })
    expect(pinned([SOFT, WONK], { SOFT: [0, 100] }, scanAxes(''))).toEqual({ WONK: 1 })
    expect(pinned([SOFT, WONK], {}, scanAxes('a{font-variation-settings:var(--x)}'))).toEqual({})
  })

  it('cuts a declared axis to its range, clamped to the font, and to one value for a point', () => {
    expect(limited([WGHT, OPSZ, SOFT], { wght: [500, 700], SOFT: [0, 100] })).toEqual({
      wght: { min: 500, max: 700 },
    })
    expect(limited([WGHT], { wght: [700, 500] })).toEqual({ wght: { min: 500, max: 700 } })
    expect(limited([WGHT], { wght: [50, 1000] })).toEqual({})
    expect(limited([WGHT], { wght: [600, 600] })).toEqual({ wght: 600 })
    expect(limited([WGHT], { wght: [950, 1000] })).toEqual({ wght: 900 })
    expect(limited([WGHT], {})).toEqual({})
  })

  it('a built face keeps only the declared range, and dev keeps the whole axis', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'weft-axes-'))
    const build = (axes: Record<string, [number, number]>, dev = false) =>
      fontBuild({
        fonts: {
          body: {
            family: 'Figtree',
            src: figtree,
            fallback: 'Arial',
            display: 'swap',
            weight: 400,
            style: 'normal',
            axes,
            preload: true,
            glyphs: 'Hello',
          },
        },
        subsets: ['latin'],
      }).build({ root: '/', cacheDir, url: (n) => n, dev })
    try {
      const whole = await build({})
      const range = await build({ wght: [500, 700] })
      const point = await build({ wght: [600, 600] })
      const dev = await build({ wght: [500, 700] }, true)
      const axesOf = async (out: typeof whole) => readAxes(Buffer.from(out.files[0]!.bytes))
      expect(await axesOf(whole)).toEqual([{ tag: 'wght', min: 300, default: 300, max: 900 }])
      expect(await axesOf(range)).toEqual([{ tag: 'wght', min: 500, default: 500, max: 700 }])
      expect(await axesOf(point)).toEqual([])
      expect(await axesOf(dev)).toEqual([{ tag: 'wght', min: 300, default: 300, max: 900 }])
      expect(range.report.faces[0]).toMatchObject({ limited: { wght: { min: 500, max: 700 } } })
      expect(whole.report.faces[0]).not.toHaveProperty('limited')
      expect(range.files[0]!.bytes.length).toBeLessThan(whole.files[0]!.bytes.length)
      expect(point.files[0]!.bytes.length).toBeLessThan(range.files[0]!.bytes.length)
      expect(range.css).toContain('font-weight:500 700')
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  it('reads fvar, and finds none in a static face', async () => {
    const axis = (tag: string, min: number, def: number, max: number) => {
      const b = Buffer.alloc(20)
      b.write(tag, 'latin1')
      b.writeInt32BE(min * 65536, 4)
      b.writeInt32BE(def * 65536, 8)
      b.writeInt32BE(max * 65536, 12)
      return b
    }
    const fvar = Buffer.alloc(16)
    fvar.writeUInt16BE(16, 4)
    fvar.writeUInt16BE(2, 8)
    fvar.writeUInt16BE(20, 10)
    const dir = Buffer.alloc(28)
    dir.writeUInt32BE(0x00010000, 0)
    dir.writeUInt16BE(1, 4)
    dir.write('fvar', 12, 'latin1')
    dir.writeUInt32BE(28, 20)
    dir.writeUInt32BE(56, 24)
    expect(
      await readAxes(
        Buffer.concat([dir, fvar, axis('wght', 100, 400, 900), axis('SOFT', 0, 0, 100)]),
      ),
    ).toEqual([
      { tag: 'wght', min: 100, default: 400, max: 900 },
      { tag: 'SOFT', min: 0, default: 0, max: 100 },
    ])
    expect(await readAxes(readFileSync(inter(400)))).toEqual([])
  })
})

it('toRange() runs code points together, sorted and without repeats', () => {
  expect(toRange('cabaz')).toBe('U+0061-0063,U+007A')
})

function registerFontSubsetTests(opts: FontOptions, getCacheDir: () => string) {
  it('subsets per range, adds one fallback face, preloads the body face only, within budget', async () => {
    const out = await fontBuild(opts).build({
      root: '/',
      cacheDir: getCacheDir(),
      url: (n) => `/assets/${n}`,
    })
    expect(out.files.map((f) => f.name.replace(/-[0-9a-f]{8}\.woff2$/, ''))).toEqual([
      'inter-400-latin',
      'inter-400-latin-ext',
      'inter-700-latin',
      'inter-700-latin-ext',
    ])
    for (const f of out.files) expect(new TextDecoder().decode(f.bytes.subarray(0, 4))).toBe('wOF2')
    const [latin, ext] = out.files
    expect(ext!.bytes.length).toBeLessThan(latin!.bytes.length / 2) // the source is latin-only: latin-ext keeps little

    const rules = out.css.trim().split('\n')
    expect(rules).toHaveLength(5)
    expect(rules[0]).toBe(
      `@font-face{font-family:"Inter";src:url(/assets/${latin!.name}) format("woff2");font-weight:400;font-style:normal;font-display:swap;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`,
    )
    expect(rules[2]).toContain('font-weight:700')
    expect(rules[4]).toBe(
      '@font-face{font-family:"Inter Fallback";src:local("Arial");size-adjust:107.12%;ascent-override:90.44%;descent-override:22.52%;line-gap-override:0%}',
    )

    expect(out.preloads).toEqual([{ href: `/assets/${latin!.name}`, type: 'font/woff2' }])
    expect((out.metrics as Record<string, unknown>).Inter).toMatchObject({
      unitsPerEm: 2048,
      capHeight: 1490 / 2048,
      xHeight: 1118 / 2048,
    })
    expect(out.report.preloadBytes).toBe(latin!.bytes.length)
    expect(out.report.cssBrotli).toBeLessThanOrEqual(BUDGET.cssBrotli)
    expect(out.report.overBudget).toEqual([])

    const again = await fontBuild(opts).build({
      root: '/',
      cacheDir: getCacheDir(),
      url: (n) => n,
    })
    expect(again.files.map((f) => f.bytes.length)).toEqual(out.files.map((f) => f.bytes.length))
    expect(readdirSync(getCacheDir())).toHaveLength(4) // the second build read the cache
  })
}

function registerFontTrimmingTests(opts: FontOptions, getCacheDir: () => string) {
  describe('trimming', () => {
    const body = { fonts: { body: opts.fonts.body! }, subsets: ['latin'] }
    registerTrimCoverageTests(body, getCacheDir)

    it('moves the characters the source uses into the core', async () => {
      const out = await fontBuild({ ...body, trim: true }).build({
        root: '/',
        cacheDir: getCacheDir(),
        url: (n) => n,
        source: '<p>Café ñ 日本</p>',
      })
      const [core, rest] = [...out.css.matchAll(/unicode-range:([^}]+)/g)].map((m) =>
        rangeText(m[1]!),
      )
      expect(core).toContain('\u00e9')
      expect(core).toContain('\u00f1')
      expect(core).not.toContain('日')
      expect(rest).not.toContain('\u00e9')
    })

    it('stays off in dev and with trim: false: one file per subset, its full range', async () => {
      for (const run of [
        { trim: true, dev: true },
        { trim: false, dev: false },
      ]) {
        const out = await fontBuild({ ...body, trim: run.trim }).build({
          root: '/',
          cacheDir: getCacheDir(),
          url: (n) => n,
          dev: run.dev,
        })
        expect(out.files).toHaveLength(1)
        expect(out.css).toContain('unicode-range:U+0000-00FF,U+0131')
      }
    })

    it('leaves X022 to builds: dev ships no trimmed face to measure', async () => {
      const many = Object.fromEntries(
        [400, 500, 600, 700, 800, 900].map((w) => [
          `r${w}`,
          { ...opts.fonts.body!, src: inter(w), weight: w, preload: true },
        ]),
      )
      const out = await fontBuild({ fonts: many, subsets: ['latin'] }).build({
        root: '/',
        cacheDir: getCacheDir(),
        url: (n) => n,
        dev: true,
      })
      expect(out.report.overBudget).toEqual([])
    })
  })
}

function registerTrimCoverageTests(body: FontOptions, getCacheDir: () => string) {
  it('splits latin into a preloaded core and an on-demand rest that together cover the whole subset', async () => {
    const out = await fontBuild({ ...body, trim: true }).build({
      root: '/',
      cacheDir: getCacheDir(),
      url: (n) => n,
    })
    const [core] = out.files
    expect(out.files.map((f) => f.name.replace(/-[0-9a-f]{8}\.woff2$/, ''))).toEqual([
      'inter-400-latin',
      'inter-400-latin-rest',
    ])
    expect(out.preloads).toEqual([{ href: core!.name, type: 'font/woff2' }])
    const ranges = [...out.css.matchAll(/unicode-range:([^}]+)/g)].map((m) => rangeText(m[1]!))
    expect(ranges).toHaveLength(2)
    expect(ranges[0]).toContain('a')
    expect(ranges[0]).toContain('\u2019')
    expect(ranges[0]).not.toContain('\u00e9')
    expect(ranges[1]).toContain('\u00e9')
    expect(Array.from(ranges[0]!).filter((c) => ranges[1]!.includes(c))).toEqual([])
    expect(Array.from(ranges.join('')).sort().join('')).toBe(
      Array.from(rangeText(RANGES.latin)).sort().join(''),
    )
    const all = await fontBuild({ ...body, trim: false }).build({
      root: '/',
      cacheDir: getCacheDir(),
      url: (n) => n,
    })
    expect(core!.bytes.length).toBeLessThan(all.files[0]!.bytes.length * 0.8)
  })
}

function registerAxisScanTests() {
  it('reads literal settings from CSS, JSX styles and Tailwind classes', () => {
    const css = scanAxes('.a { font-variation-settings: "SOFT" 60, "WONK" 0; color: red }')
    expect(css.dynamic).toBe(false)
    expect(css.values.get('SOFT')).toEqual(new Set([60]))
    expect(css.values.get('WONK')).toEqual(new Set([0]))
    const jsx = scanAxes(`<p style={{ fontVariationSettings: '"GRAD" 150' }} />`)
    expect(jsx).toMatchObject({ dynamic: false })
    expect(jsx.values.get('GRAD')).toEqual(new Set([150]))
    const tw = scanAxes(`<p class="[font-variation-settings:'SOFT'_30] text-lg" />`)
    expect(tw).toMatchObject({ dynamic: false })
    expect(tw.values.get('SOFT')).toEqual(new Set([30]))
    expect(scanAxes('a { font-variation-settings: normal }').dynamic).toBe(false)
  })

  it('treats a value it cannot read as dynamic', () => {
    for (const s of [
      'a { font-variation-settings: var(--axes) }',
      `el.style.fontVariationSettings = \`"SOFT" \${n}\``,
      'style={{ fontVariationSettings: axes }}',
      "el.style.setProperty('font-variation-settings', v)",
    ]) {
      expect(scanAxes(s).dynamic, s).toBe(true)
    }
  })
}
