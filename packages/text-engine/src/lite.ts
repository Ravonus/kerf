// The lite tier: the base chunk's own engine for the common case, Latin and emoji under white-space: normal.
//
// It is not a port of Pretext's measurement. It reuses Pretext's exact break scan (getBlinkLineBreaks /
// getWebKitLineBreaks over the restricted tables) and then does only what Pretext itself does for text in
// its *envelope*, where Pretext's corrections are all zero:
//   - segments: the runs between break opportunities, each followed by its collapsed space, as
//     segmentAtLineBreaks() makes them for such text (TEXT, SPACE, TEXT, ...);
//   - widths: Canvas measureText per segment, cached per font. WebKit measures a word together with the
//     space after it, less the space (measureTextWithFollowingSpace);
//   - layout: countPreparedLines()'s simple loop, with the same additions in the same order, so the float
//     sums are bit-identical.
// The envelope (`fits()`): base alphabet; white-space normal; no letter spacing or keep-all; none of the
// characters whose handling differs (NBSP and other glue, soft hyphen, zero-width and bidi controls, the
// non-ASCII spaces, controls); and per font, the probes Pretext itself runs come out zero: no kerning
// across the space (Blink), no emoji correction (any engine, only when the text has emoji), no fullwidth
// curly quotes (Blink's Han kerning, probed as Pretext probes it), and no generic family name (WebKit). A layout narrower than the
// widest segment needs an emergency break inside a word, which the lite tier does not model: the provider
// hands that handle to the exact engine. Everything outside the envelope goes to the exact engine too.
// test/accuracy diffs this tier against unmodified Pretext on the corpus; that is the claim, not a proof.
import { getBlinkLineBreaks, getWebKitLineBreaks } from '@engine/line-breaks.js'
import { PackMissing } from '@engine/packs.js'

declare const __ENGINE__: 'blink' | 'webkit' | 'gecko'

// Pretext's lineFitEpsilon: WebKit's 1/64 px, 0.005 px elsewhere.
const EPS = __ENGINE__ === 'webkit' ? 1 / 64 : 0.005

// Characters whose handling in Pretext goes past "segment between breaks, measure, sum".
const OUTSIDE = /[\0-\x08\x0b\x0e-\x1f\x7f-\xa0\xad\u034f\u2000-\u200c\u200e\u200f\u2011\u2028-\u202f\u205f-\u206f\ufe00-\ufe0e\ufeff]/
const EMOJI = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\ufe0f\u20e3]/u
const QUOTE = /[\u2018\u2019\u201c\u201d]/
const GENERIC = /(?:^|[\s,])(?:serif|sans-serif|cursive|fantasy|monospace)\s*(?:,|$)/i

let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
let ctxLang: string | null | undefined
let ctxFont = ''
let locale: string | undefined

// Pretext's getPreparationLanguage(): setLocale()'s, else <html lang>, else null; Blink lays out a page
// without one under its default locale.
function language(): string | null {
  let l: string | null = locale ?? null
  if (locale === undefined && typeof document !== 'undefined') l = document.documentElement?.lang ?? null
  return l === '' && __ENGINE__ === 'blink' ? new Intl.DateTimeFormat().resolvedOptions().locale : l
}

type Font = { widths: Map<string, number>, space: number, kerns: boolean, kerning: Map<number, number>, emoji: number | null }
const fonts = new Map<string, Font>()

function context(lang: string | null) {
  if (ctx === null || ctxLang !== lang) {
    ctx = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1).getContext('2d') : document.createElement('canvas').getContext('2d')
    if (ctx === null) throw new Error('text-engine: no Canvas 2D context')
    if (lang !== null && 'lang' in ctx) (ctx as { lang: string }).lang = lang
    ctxLang = lang; ctxFont = ''; fonts.clear()
  }
  return ctx
}
function measure(f: Font, font: string, s: string): number {
  let w = f.widths.get(s)
  if (w === undefined) {
    if (ctxFont !== font) ctx!.font = ctxFont = font
    f.widths.set(s, w = ctx!.measureText(s).width)
  }
  return w
}
function fontOf(font: string, lang: string | null): Font {
  const c = context(lang)
  let f = fonts.get(font)
  if (f === undefined) {
    f = { widths: new Map(), space: 0, kerns: false, kerning: new Map(), emoji: null }
    fonts.set(font, f)
    f.space = measure(f, font, ' ')
    // Blink: getFontSpaceKerning(), U+2028 standing for the space.
    if (__ENGINE__ === 'blink') {
      let probe = ' '
      for (let k = 0x21; k <= 0x7e; k++) probe += String.fromCharCode(k) + ' '
      c.font = ctxFont = font
      const kerned = c.measureText(probe).width
      c.fontKerning = 'none'
      const unkerned = c.measureText(probe).width
      c.fontKerning = 'auto'
      f.kerns = kerned !== unkerned && c.measureText(' ').width === f.space
    }
  }
  return f
}
// The base alphabet's combining marks: U+0300-036F, U+20D0-20FF (keycaps, enclosing marks), the variation selectors.
const isMark = (c: number) => (c >= 0x300 && c <= 0x36f) || (c >= 0x20d0 && c <= 0x20ff) || (c >= 0xfe00 && c <= 0xfe0f)
// getCharacterSpaceKerning(): a character's kerning with the space after it (or before it), zero within
// float32 rounding. In the envelope the characters that take none are marks and surrogate halves; Canvas word letters (kana, Han) are outside the base alphabet.
function charKerning(f: Font, font: string, code: number, spaceFirst: boolean): number {
  const key = code << 1 | (spaceFirst ? 1 : 0)
  let k = f.kerning.get(key)
  if (k === undefined) {
    k = 0
    if (!(isMark(code) || (code & 0xf800) === 0xd800)) {
      const ch = String.fromCharCode(code)
      const pair = measure(f, font, spaceFirst ? ' ' + ch : ch + ' ')
      k = pair - measure(f, font, ch) - f.space
      if (Math.abs(k) <= pair / 0x400000) k = 0
    }
    f.kerning.set(key, k)
  }
  return k
}
// getSpaceKerning() is zero for this segment: its first and last characters, past U+FE0F (the one default
// ignorable the envelope lets in), kern nothing with a space. A first character with a mark after it takes none.
function edgesKernNothing(f: Font, font: string, seg: string): boolean {
  let first = 0, last = seg.length - 1
  while (first < last && seg.charCodeAt(first) === 0xfe0f) first++
  while (last > first && seg.charCodeAt(last) === 0xfe0f) last--
  const next = seg.charCodeAt(first + 1)
  const markNext = first < last && isMark(next)
  return (markNext || charKerning(f, font, seg.charCodeAt(first), true) === 0) && charKerning(f, font, seg.charCodeAt(last), false) === 0
}
// Blink's Han kerning (han-kerning.ts) trims in-alphabet text only where the font's curly quotes type as
// fullwidth marks: getFontData()'s quoteFullwidth. Every other mark it could halt is a CJK character. This
// is that probe, ported as it is: no data where U+300C doesn't halt, else the quotes' ink against half
// their advance (getTypeFromBounds), all four alike per side.
function quotesFullwidth(f: Font, font: string): boolean {
  const one = '\u300C'
  if (2 * measure(f, font, one) - measure(f, font, one + one) <= 1e-3) return false
  const type = (c: string) => {
    const m = ctx!.measureText(c), half = m.width / 2, left = -m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight
    return m.width + ':' + (right <= half ? 'C' : left >= half ? 'O' : right - left <= half && left >= half / 2 ? 'M' : '-')
  }
  ctx!.font = ctxFont = font
  const open = type('\u201C'), close = type('\u201D')
  return open === type('\u2018') && open.endsWith('O') && close === type('\u2019') && close.endsWith('C')
}
// getEmojiCorrection()'s probe: zero unless Canvas draws an emoji wider than the font size and the page
// draws it narrower than Canvas. Lite only when it is zero.
function emojiCorrectionIsZero(f: Font, font: string): boolean {
  if (f.emoji === null) {
    const size = +(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16)
    const canvasW = measure(f, font, '\u{1F600}')
    f.emoji = 0
    if (canvasW > size + 0.5 && typeof document !== 'undefined' && document.body) {
      const span = document.createElement('span')
      span.style.cssText = 'all:initial!important;-webkit-locale:inherit!important;display:inline-block!important;visibility:hidden!important;position:absolute!important'
      span.style.setProperty('font', font, 'important')
      span.textContent = '\u{1F600}'
      document.body.appendChild(span)
      const domW = span.getBoundingClientRect().width
      span.remove()
      f.emoji = Number.isNaN(domW) || canvasW - domW > 0.5 ? 1 : 0
    }
  }
  return f.emoji === 0
}

export type LiteHandle = {
  readonly widths: Float64Array // per segment, TEXT and SPACE alternating as Pretext's simple handles
  readonly text: Uint8Array // 1 where the segment is TEXT
  readonly maxText: number // widest TEXT segment: narrower layouts need an emergency break
}

// The envelope check that needs no font: run before the font probes.
export function textFits(text: string, opts?: { whiteSpace?: string, wordBreak?: string, letterSpacing?: number }): boolean {
  return !(opts?.whiteSpace === 'pre-wrap' || opts?.wordBreak === 'keep-all' || opts?.letterSpacing) && !OUTSIDE.test(text)
}

// Prepare, or null when this text and font fall outside the envelope.
export function prepareLite(input: string, font: string): LiteHandle | null {
  if (__ENGINE__ === 'gecko') return null
  if (__ENGINE__ === 'webkit' && GENERIC.test(font)) return null
  const lang = language()
  const f = fontOf(font, lang)
  // collapseWhitespaceNormal()
  let t = input
  if (/[\t\n\r\f]| {2,}|^ | $/.test(t)) {
    t = t.replace(/[ \t\n\r\f]{2,}|[\t\n\r\f]/g, ' ')
    if (t.charCodeAt(0) === 0x20) t = t.slice(1)
    if (t.length && t.charCodeAt(t.length - 1) === 0x20) t = t.slice(0, -1)
  }
  if (EMOJI.test(t) && !emojiCorrectionIsZero(f, font)) return null
  if (__ENGINE__ === 'blink' && QUOTE.test(t) && quotesFullwidth(f, font)) return null
  // A scan path the coverage run never saw sits in the exact tier's rare pack: such text isn't lite.
  let br: Uint8Array
  try { br = __ENGINE__ === 'webkit' ? getWebKitLineBreaks(t, false, false, lang) : getBlinkLineBreaks(t, false, lang) } catch (e) {
    if (e instanceof PackMissing) return null
    throw e
  }
  // prepare.ts asks for the font's space kerning only where the text has a space
  const kernable = t.includes(' ')
  const widths: number[] = [], kinds: number[] = []
  let maxText = 0
  for (let s = 0, i = 1; i <= t.length; i++) {
    if (i < t.length && !br[i]) continue
    let e = i
    if (t.charCodeAt(e - 1) === 0x20) e--
    if (e > s) {
      const word = t.slice(s, e)
      if (__ENGINE__ === 'blink' && f.kerns && kernable && !edgesKernNothing(f, font, word)) return null
      // WebKit: getFollowingSpaceTail() is '' where a U+0020 follows, whether or not the scan put a break before it
      const w = __ENGINE__ === 'webkit' && t.charCodeAt(e) === 0x20 ? measure(f, font, word + ' ') - f.space : measure(f, font, word)
      widths.push(w); kinds.push(1)
      if (w > maxText) maxText = w
    }
    if (e < i) { widths.push(f.space); kinds.push(0) }
    s = i
  }
  return { widths: Float64Array.from(widths), text: Uint8Array.from(kinds), maxText }
}

// countPreparedLines() for a simple handle without trims, which is what an in-envelope text prepares to.
// Callers check maxWidth >= maxText first (no emergency breaks).
export function countLite(h: LiteHandle, maxWidth: number): number {
  const fitLimit = Math.max(0, maxWidth) + EPS
  const { widths, text } = h
  let count = 0, lineW = 0, hasContent = false
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i]!
    if (hasContent) {
      if (lineW + w <= fitLimit) { lineW += w; continue }
      count++; lineW = 0; hasContent = false
      if (!text[i]) continue
    } else if (!text[i]) continue
    lineW += w
    hasContent = true
  }
  return count + (hasContent ? 1 : 0)
}

// walkPreparedLinesRaw()'s ranges for the same handles: [start, end) segment indices, the hanging space
// inside, and the line's width without it, as Pretext's simple stepper reports them.
export function walkLite(h: LiteHandle, maxWidth: number, onLine: (width: number, start: number, end: number) => void): number {
  const fitLimit = Math.max(0, maxWidth) + EPS
  const { widths, text } = h
  let count = 0
  for (let i = 0; i < widths.length;) {
    while (i < widths.length && !text[i]) i++
    if (i >= widths.length) break
    const start = i
    let lineW = widths[i++]!, contentW = lineW
    while (i < widths.length && lineW + widths[i]! <= fitLimit) { lineW += widths[i]!; if (text[i]) contentW = lineW; i++ }
    // a space hangs: the line ends after it even where it overflows
    if (i < widths.length && !text[i]) i++
    count++
    onLine(contentW, start, i)
  }
  return count
}

export function setLiteLocale(l?: string): void { locale = l; ctx = null }
export function clearLite(): void { fonts.clear() }
