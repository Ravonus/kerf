// font.build@1 on a real face (Inter 4, @fontsource/inter 5.3.0): options, subsets, the matched fallback face
// (research 11 §8.2's values), preloads, budgets and the cache.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { text } from '../src/index.mjs'
import { BUDGET, createFontBuild, fallbackFace, rangeText } from '../src/build.mjs'

const inter = w => fileURLToPath(new URL(`../node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2`, import.meta.url))

describe('text() options', () => {
  it('provides font.build with its build module and the resolved faces', () => {
    const p = text({ fonts: { body: { family: 'Inter', src: './fonts/Inter.woff2', fallback: 'Arial' }, mono: { family: 'Plex', src: './p.woff2', fallback: 'Courier New', display: 'optional' } } })
    expect(p.provides).toEqual(['font.build', 'text.measure'])
    const [ref] = p.contribute({ command: 'check', mode: 'development', root: '' }).provides
    expect(ref.sides.build.module).toBe(fileURLToPath(new URL('../src/build.mjs', import.meta.url)))
    expect(ref.sides.build.export).toBe('createFontBuild')
    expect(ref.sides.build.options.fonts).toEqual({
      body: { family: 'Inter', src: './fonts/Inter.woff2', fallback: 'Arial', display: 'swap', weight: 400, style: 'normal', axes: {}, preload: true },
      mono: { family: 'Plex', src: './p.woff2', fallback: 'Courier New', display: 'optional', weight: 400, style: 'normal', axes: {}, preload: false },
    })
    expect(ref.sides.build.options.subsets).toEqual(['latin'])
  })

  it('rejects block display (X021), unknown subsets and measure, as P115 with the path', () => {
    const bad = [
      [{ fonts: { body: { family: 'Inter', src: 'a', fallback: 'Arial', display: 'block' } } }, 'fonts.body.display', /X021/],
      [{ fonts: { body: { family: 'Inter', src: 'a' } } }, 'fonts.body.fallback', /non-empty string/],
      [{ subsets: ['klingon'] }, 'subsets.0', /unknown subset/],
      [{ measure: 'on' }, 'measure', /'auto' or 'off'/],
      [{ engine: 'fast' }, 'engine', /'slim' \| 'pretext'/],
    ]
    for (const [input, path, message] of bad) {
      let error
      try {
        text(input)
      } catch (e) {
        error = e
      }
      expect(error, path).toMatchObject({ code: 'P115', path })
      expect(error.message).toMatch(message)
    }
  })
})

it('rangeText() expands a unicode-range', () => {
  expect(rangeText('U+0041-0043,U+0061')).toBe('ABCa')
})

it("the fallback face matches research 11's Inter/Arial numbers", async () => {
  const arial = (await import('@capsizecss/metrics/arial')).default
  const interMetrics = { unitsPerEm: 2048, ascent: 1984, descent: -494, lineGap: 0, xWidthAvg: 978, subsets: { latin: { xWidthAvg: 978 } } }
  expect(fallbackFace(interMetrics, arial)).toEqual({ sizeAdjust: '107.12%', ascentOverride: '90.44%', descentOverride: '22.52%', lineGapOverride: '0%' })
})

describe('createFontBuild().build()', () => {
  let cacheDir
  beforeEach(() => (cacheDir = mkdtempSync(join(tmpdir(), 'weft-fonts-'))))
  afterEach(() => rmSync(cacheDir, { recursive: true, force: true }))

  const opts = text({
    fonts: {
      body: { family: 'Inter', src: inter(400), fallback: 'Arial' },
      heading: { family: 'Inter', src: inter(700), fallback: 'Arial', weight: 700, preload: false },
      label: { family: 'Inter', src: inter(400), fallback: 'Arial' }, // the same face as body: emitted once
    },
    subsets: ['latin', 'latin-ext'],
  }).contribute({ command: 'build', mode: 'production', root: '' }).provides[0].sides.build.options

  it('subsets per range, adds one fallback face, preloads the body face only, within budget', async () => {
    const out = await createFontBuild(opts).build({ root: '/', cacheDir, url: n => `/assets/${n}` })
    expect(out.files.map(f => f.name.replace(/-[0-9a-f]{8}\.woff2$/, ''))).toEqual(['inter-400-latin', 'inter-400-latin-ext', 'inter-700-latin', 'inter-700-latin-ext'])
    for (const f of out.files) expect(new TextDecoder().decode(f.bytes.subarray(0, 4))).toBe('wOF2')
    const [latin, ext] = out.files
    expect(ext.bytes.length).toBeLessThan(latin.bytes.length / 2) // the source is latin-only: latin-ext keeps little

    const rules = out.css.trim().split('\n')
    expect(rules).toHaveLength(5)
    expect(rules[0]).toBe(`@font-face{font-family:"Inter";src:url(/assets/${latin.name}) format("woff2");font-weight:400;font-style:normal;font-display:swap;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`)
    expect(rules[2]).toContain('font-weight:700')
    expect(rules[4]).toBe('@font-face{font-family:"Inter Fallback";src:local("Arial");size-adjust:107.12%;ascent-override:90.44%;descent-override:22.52%;line-gap-override:0%}')

    expect(out.preloads).toEqual([{ href: `/assets/${latin.name}`, type: 'font/woff2' }])
    expect(out.metrics.Inter).toMatchObject({ unitsPerEm: 2048, capHeight: 1490 / 2048, xHeight: 1118 / 2048 })
    expect(out.report.preloadBytes).toBe(latin.bytes.length)
    expect(out.report.cssBrotli).toBeLessThanOrEqual(BUDGET.cssBrotli)
    expect(out.report.overBudget).toEqual([])

    const again = await createFontBuild(opts).build({ root: '/', cacheDir, url: n => n })
    expect(again.files.map(f => f.bytes.length)).toEqual(out.files.map(f => f.bytes.length))
    expect(readdirSync(cacheDir)).toHaveLength(4) // the second build read the cache
  })

  it('reports X022 when preloads go over budget', async () => {
    const many = Object.fromEntries([400, 500, 600, 700, 800, 900].map(w => [`r${w}`, { ...opts.fonts.body, src: inter(w), weight: w, preload: true }]))
    const out = await createFontBuild({ fonts: many, subsets: ['latin'] }).build({ root: '/', cacheDir, url: n => n })
    expect(out.report.preloadBytes).toBeGreaterThan(BUDGET.preloadBytes)
    expect(out.report.overBudget.map(([code]) => code)).toEqual(['X022'])
  })

  it('names the fix for an unknown fallback', async () => {
    await expect(createFontBuild({ fonts: { body: { ...opts.fonts.body, fallback: 'Comic Neue Mono' } }, subsets: ['latin'] }).build({ root: '/', cacheDir, url: n => n })).rejects.toThrow(/no metrics for fallback "Comic Neue Mono"/)
  })
})
