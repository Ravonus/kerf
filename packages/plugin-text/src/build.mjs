// font.build@1 (research 11 §8.2, research 26 §3): subset each face per unicode-range (HarfBuzz via subset-font),
// generate a metric-matched "<Family> Fallback" face (Capsize's method: size-adjust from the average glyph width,
// then the vertical overrides divided by it), and list the preloads. Cached by content hash under `cacheDir`.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import { fromBuffer } from '@capsizecss/unpack'
import subsetFont from 'subset-font'

/** Google Fonts' subset ranges (the same tables @fontsource ships). */
export const RANGES = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
  'cyrillic-ext': 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
  greek: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
  'greek-ext': 'U+1F00-1FFF',
  vietnamese: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
}

/** Budgets (research 11 §8.4): preloaded bytes above the fold, and the generated CSS inlined in the head. */
export const BUDGET = { preloadBytes: 100 * 1024, cssBrotli: 1536 }
const VERSION = 1 // bump when the output for the same input changes

/** Every code point a `unicode-range` covers, as a string subset-font keeps. */
export function rangeText(range) {
  let out = ''
  for (const part of range.split(',')) {
    const [a, b = a] = part.trim().replace(/^U\+/i, '').split('-').map(h => parseInt(h, 16))
    for (let c = a; c <= b; c++) if ((c < 0xd800 || c > 0xdfff) && c !== 0) out += String.fromCodePoint(c)
  }
  return out
}

const camel = name => name.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
const pct = n => `${Math.round(n * 10000) / 100}%`
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Metrics of a system fallback (Capsize's collection), by family name: Arial, Times New Roman, Courier New… */
async function systemMetrics(family) {
  try {
    return (await import(`@capsizecss/metrics/${camel(family)}`)).default
  } catch {
    throw Object.assign(new Error(`text(): no metrics for fallback "${family}". Use a common system face: Arial, Helvetica, Times New Roman, Georgia, Courier New, Verdana.`), { code: 'P115' })
  }
}

const avgWidth = m => (m.subsets?.latin?.xWidthAvg ?? m.xWidthAvg) / m.unitsPerEm

/** The fallback face's descriptors that make `fallback` take the same space as `font` (Capsize / next/font). */
export function fallbackFace(font, fallback) {
  const sizeAdjust = avgWidth(font) / avgWidth(fallback)
  const k = font.unitsPerEm * sizeAdjust
  return {
    sizeAdjust: pct(sizeAdjust),
    ascentOverride: pct(font.ascent / k),
    descentOverride: pct(Math.abs(font.descent) / k),
    lineGapOverride: pct(font.lineGap / k),
  }
}

/**
 * @param {{ fonts: Record<string, { family: string, src: string, fallback: string, display: string, weight: number, style: string, axes: Record<string, [number, number]>, preload: boolean }>, subsets: string[] }} options
 */
export function createFontBuild({ fonts, subsets }) {
  return {
    /** @param {{ root: string, cacheDir: string, url: (name: string) => string }} input */
    async build({ root, cacheDir, url }) {
      mkdirSync(cacheDir, { recursive: true })
      const files = []
      const preloads = []
      const metrics = {}
      const faces = []
      const fallbacks = new Map()
      const rules = []
      const seen = new Map() // family+src → its preload flag, so two roles on one face emit it once

      for (const [role, f] of Object.entries(fonts)) {
        const key = `${f.family}\0${f.src}\0${f.weight}\0${f.style}`
        if (seen.has(key)) {
          if (f.preload && !seen.get(key).preload) seen.get(key).preload = true
          continue
        }
        const entry = { ...f, role, files: [] }
        seen.set(key, entry)
        const bytes = readFileSync(isAbsolute(f.src) ? f.src : join(root, f.src))
        const m = await fromBuffer(bytes)
        metrics[f.family] ??= {
          unitsPerEm: m.unitsPerEm,
          ascent: m.ascent / m.unitsPerEm,
          descent: m.descent / m.unitsPerEm,
          lineGap: m.lineGap / m.unitsPerEm,
          capHeight: m.capHeight / m.unitsPerEm,
          xHeight: m.xHeight / m.unitsPerEm,
          xWidthAvg: avgWidth(m),
        }
        if (!fallbacks.has(f.family)) fallbacks.set(f.family, { fallback: f.fallback, ...fallbackFace(m, await systemMetrics(f.fallback)) })

        const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
        for (const subset of subsets) {
          const cached = join(cacheDir, `${hash}-${subset}-v${VERSION}.woff2`)
          let out
          if (existsSync(cached)) out = readFileSync(cached)
          else {
            out = await subsetFont(bytes, rangeText(RANGES[subset]), { targetFormat: 'woff2' })
            writeFileSync(cached, out)
          }
          const name = `${slug(f.family)}-${f.weight}${f.style === 'italic' ? 'i' : ''}-${subset}-${createHash('sha256').update(out).digest('hex').slice(0, 8)}.woff2`
          files.push({ name, bytes: new Uint8Array(out) })
          entry.files.push({ subset, name, bytes: out.length })
        }
        faces.push(entry)
      }

      for (const f of faces) {
        const weight = f.axes.wght ? `${f.axes.wght[0]} ${f.axes.wght[1]}` : f.weight
        for (const file of f.files) {
          rules.push(`@font-face{font-family:"${f.family}";src:url(${url(file.name)}) format("woff2");font-weight:${weight};font-style:${f.style};font-display:${f.display};unicode-range:${RANGES[file.subset]}}`)
        }
        const latin = f.files.find(x => x.subset === 'latin') ?? f.files[0]
        if (f.preload && latin) preloads.push({ href: url(latin.name), type: 'font/woff2', bytes: latin.bytes })
      }
      for (const [family, fb] of fallbacks) {
        rules.push(`@font-face{font-family:"${family} Fallback";src:local("${fb.fallback}");size-adjust:${fb.sizeAdjust};ascent-override:${fb.ascentOverride};descent-override:${fb.descentOverride};line-gap-override:${fb.lineGapOverride}}`)
      }
      const css = rules.join('\n') + (rules.length ? '\n' : '')

      const preloadBytes = preloads.reduce((n, p) => n + p.bytes, 0)
      const cssBrotli = brotliCompressSync(css).length
      const overBudget = []
      if (preloadBytes > BUDGET.preloadBytes) overBudget.push(['X022', `The preloaded fonts are ${Math.round(preloadBytes / 1024)} KB, over the 100 KB budget for text above the fold: preload fewer faces (\`preload: false\`) or use fewer weights.`])
      if (cssBrotli > BUDGET.cssBrotli) overBudget.push(['X022', `The generated font CSS is ${cssBrotli} B brotli, over the 1.5 KB budget: fewer faces or subsets.`])

      return {
        css,
        preloads: preloads.map(({ href, type }) => ({ href, type })),
        files,
        metrics,
        report: { faces: faces.map(f => ({ family: f.family, role: f.role, files: f.files.map(({ subset, bytes }) => ({ subset, bytes })) })), preloadBytes, cssBrotli, overBudget },
      }
    },
  }
}
