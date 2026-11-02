// font.build@1 (research 11 §8.2, research 26 §3): subset each face per unicode-range (HarfBuzz via subset-font),
// generate a metric-matched "<Family> Fallback" face (Capsize's method: size-adjust from the average glyph width,
// then the vertical overrides divided by it), and list the preloads. Cached by content hash under `cacheDir`.
//
// Trimming (on in a build, off in dev, `trim: false` turns it off): font bytes are what set LCP on a text hero. Two
// cuts keep the design and every character. Custom axes (SOFT, WONK, GRAD…) the source never varies are pinned, and
// `latin` splits in two: a preloaded core (ASCII, common punctuation, what the source uses) and the rest, which a
// browser fetches through `unicode-range` only when a page holds one of those characters, so text from a database
// still gets the face.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import { fromBuffer } from '@capsizecss/unpack'
import fontverter from 'fontverter'
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
const VERSION = 2 // bump when the output for the same input changes

/** Every code point a `unicode-range` covers, as a string subset-font keeps. */
export function rangeText(range) {
  let out = ''
  for (const part of range.split(',')) {
    const [a, b = a] = part.trim().replace(/^U\+/i, '').split('-').map(h => parseInt(h, 16))
    for (let c = a; c <= b; c++) if ((c < 0xd800 || c > 0xdfff) && c !== 0) out += String.fromCodePoint(c)
  }
  return out
}

/** `latin`'s preloaded part before the source adds to it: ASCII, and the punctuation any prose uses. */
const CORE = 'U+0020-007E,U+00A0,U+00AD,U+2013-2014,U+2018-2019,U+201C-201D,U+2026'
/** CSS drives these through font-weight, font-stretch, font-style and font-optical-sizing: never pinned. */
const REGISTERED = new Set(['wght', 'wdth', 'opsz', 'slnt', 'ital'])

/** A `unicode-range` for a string of code points. */
export function toRange(text) {
  const hex = n => n.toString(16).toUpperCase().padStart(4, '0')
  const runs = []
  for (const c of [...new Set(Array.from(text, ch => ch.codePointAt(0)))].sort((a, b) => a - b)) {
    const last = runs.at(-1)
    if (last?.[1] === c - 1) last[1] = c
    else runs.push([c, c])
  }
  return runs.map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)).join(',')
}

/**
 * Every `font-variation-settings` in the source: the literal values per axis, and whether any value can't be read
 * from the text (a `var()`, a template, an expression), which keeps every axis.
 */
export function scanAxes(source) {
  const values = new Map()
  let dynamic = false
  for (const m of source.matchAll(/font-?variation-?settings['"`]?([^;}\]\n]*)/gi)) {
    const pairs = /["'`]([\w ]{4})["'`][\s_]+(-?\d*\.?\d+)/g
    for (const [, tag, value] of m[1].matchAll(pairs)) (values.get(tag) ?? values.set(tag, new Set()).get(tag)).add(Number(value))
    if (/[\w$(]/.test(m[1].replace(pairs, '').replace(/\b(?:normal|inherit|initial|unset|revert(?:-layer)?|important)\b/g, ''))) dynamic = true
  }
  return { values, dynamic }
}

/** The axes in a font's `fvar` table (a table-directory read: nothing else needs parsing). */
export async function readAxes(bytes) {
  const font = Buffer.from(await fontverter.convert(bytes, 'truetype'))
  for (let i = 0, n = font.readUInt16BE(4); i < n; i++) {
    const entry = 12 + i * 16
    if (font.toString('latin1', entry, entry + 4) !== 'fvar') continue
    const table = font.readUInt32BE(entry + 8)
    const first = table + font.readUInt16BE(table + 4)
    const fixed = at => font.readInt32BE(at) / 65536
    return Array.from({ length: font.readUInt16BE(table + 8) }, (_, a) => {
      const at = first + a * font.readUInt16BE(table + 10)
      return { tag: font.toString('latin1', at, at + 4), min: fixed(at + 4), default: fixed(at + 8), max: fixed(at + 12) }
    })
  }
  return []
}

/** The custom axes to pin: the value the source sets, or the default when it sets none. `declared` keeps an axis. */
export function pinned(axes, declared, { values, dynamic }) {
  const pins = {}
  if (dynamic) return pins
  for (const a of axes) {
    if (REGISTERED.has(a.tag) || declared[a.tag]) continue
    const used = values.get(a.tag)
    if (!used) pins[a.tag] = a.default
    else if (used.size === 1) pins[a.tag] = Math.min(a.max, Math.max(a.min, [...used][0]))
  }
  return pins
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
export function createFontBuild({ fonts, subsets, trim = true }) {
  return {
    /** @param {{ root: string, cacheDir: string, url: (name: string) => string, dev?: boolean, source?: string }} input */
    async build({ root, cacheDir, url, dev = false, source = '' }) {
      mkdirSync(cacheDir, { recursive: true })
      const trimming = trim && !dev
      const scan = scanAxes(source)
      const latin = rangeText(RANGES.latin)
      const core = trimming ? rangeText(CORE) + [...new Set(source)].filter(c => c > '~' && latin.includes(c)).join('') : ''
      const coreSet = new Set(core)
      const parts = subset => trimming && subset === 'latin'
        ? [{ subset, text: core }, { subset: 'latin-rest', text: Array.from(latin).filter(c => !coreSet.has(c)).join('') }].map(p => ({ ...p, range: toRange(p.text) }))
        : [{ subset, text: rangeText(RANGES[subset]), range: RANGES[subset] }]
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
        const pins = trimming ? pinned(await readAxes(bytes), f.axes, scan) : {}
        entry.pins = pins
        for (const { subset, text, range } of subsets.flatMap(parts)) {
          const inputs = createHash('sha256').update(text).update(JSON.stringify(pins)).digest('hex').slice(0, 8)
          const cached = join(cacheDir, `${hash}-${subset}-${inputs}-v${VERSION}.woff2`)
          let out
          if (existsSync(cached)) out = readFileSync(cached)
          else {
            out = await subsetFont(bytes, text, { targetFormat: 'woff2', ...(Object.keys(pins).length && { variationAxes: pins }) })
            writeFileSync(cached, out)
          }
          const name = `${slug(f.family)}-${f.weight}${f.style === 'italic' ? 'i' : ''}-${subset}-${createHash('sha256').update(out).digest('hex').slice(0, 8)}.woff2`
          files.push({ name, bytes: new Uint8Array(out) })
          entry.files.push({ subset, name, range, bytes: out.length })
        }
        faces.push(entry)
      }

      for (const f of faces) {
        const weight = f.axes.wght ? `${f.axes.wght[0]} ${f.axes.wght[1]}` : f.weight
        for (const file of f.files) {
          rules.push(`@font-face{font-family:"${f.family}";src:url(${url(file.name)}) format("woff2");font-weight:${weight};font-style:${f.style};font-display:${f.display};unicode-range:${file.range}}`)
        }
        const first = f.files.find(x => x.subset === 'latin') ?? f.files[0]
        if (f.preload && first) preloads.push({ href: url(first.name), type: 'font/woff2', bytes: first.bytes })
      }
      for (const [family, fb] of fallbacks) {
        rules.push(`@font-face{font-family:"${family} Fallback";src:local("${fb.fallback}");size-adjust:${fb.sizeAdjust};ascent-override:${fb.ascentOverride};descent-override:${fb.descentOverride};line-gap-override:${fb.lineGapOverride}}`)
      }
      const css = rules.join('\n') + (rules.length ? '\n' : '')

      const preloadBytes = preloads.reduce((n, p) => n + p.bytes, 0)
      const cssBrotli = brotliCompressSync(css).length
      const overBudget = []
      // Dev keeps whole faces, so its sizes say nothing about what ships.
      if (!dev && preloadBytes > BUDGET.preloadBytes) overBudget.push(['X022', `The preloaded fonts are ${Math.round(preloadBytes / 1024)} KB, over the 100 KB budget for text above the fold: preload fewer faces (\`preload: false\`) or use fewer weights.`])
      if (cssBrotli > BUDGET.cssBrotli) overBudget.push(['X022', `The generated font CSS is ${cssBrotli} B brotli, over the 1.5 KB budget: fewer faces or subsets.`])

      return {
        css,
        preloads: preloads.map(({ href, type }) => ({ href, type })),
        files,
        metrics,
        report: { faces: faces.map(f => ({ family: f.family, role: f.role, pinned: f.pins, files: f.files.map(({ subset, bytes }) => ({ subset, bytes })) })), preloadBytes, cssBrotli, overBudget },
      }
    },
  }
}
