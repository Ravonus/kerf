// Moved here from han-kerning.ts by scripts/specialize.mjs (pack "rare"). Upstream code, unchanged.
import { KIND_BITS, TEXT, UNBROKEN, type TextAnalysis } from './analysis.js'
import { hasProperty, PUNCTUATION } from './line-breaks.js'
import { getContext, getSegmentMetrics, zeros, type FontMeasurement } from './measurement.js'

import type { HanKerningFontData, HanKerningTrims } from './han-kerning.js'
export const OTHER = 0
export const OPEN = 1
export const CLOSE = 2
export const MIDDLE = 3
export const OPEN_NARROW = 4
export const CLOSE_NARROW = 5
export const DOT = 6
export const COLON = 7
export const SEMICOLON = 8
export const OPEN_QUOTE = 9
export const CLOSE_QUOTE = 10
export const openPunctuationRe = /\p{Ps}/uy
export const closePunctuationRe = /\p{Pe}/uy
export const maybeHanKerningRe = /[\u2018-\u301F\uFF08-\uFF60]/
export function maybeHanKerns(c: number): boolean {
  return (c >= 0x2018 && c <= 0x301F) || (c >= 0xFF08 && c <= 0xFF60)
}
export function textMayHanKern(text: string): boolean {
  return maybeHanKerningRe.test(text)
}
export function getStaticCharType(text: string, index: number): number {
  const c = text.charCodeAt(index)
  switch (c) {
    case 0x2018: case 0x201C: return OPEN_QUOTE
    case 0x2019: case 0x201D: return CLOSE_QUOTE
    case 0x3001: case 0x3002: case 0xFF0C: case 0xFF0E: return DOT
    case 0xFF1A: return COLON
    case 0xFF1B: return SEMICOLON
    case 0x00B7: case 0x2027: case 0x3000: case 0x30FB: return MIDDLE
    default: {
      if (c < 0x28 || !hasProperty(c, PUNCTUATION)) return OTHER
      const wide = (c >= 0x3000 && c <= 0x303F) || (c >= 0xFF01 && c <= 0xFF60) || (c >= 0xFFE0 && c <= 0xFFE6)
      openPunctuationRe.lastIndex = closePunctuationRe.lastIndex = index
      if (openPunctuationRe.test(text)) return wide ? OPEN : OPEN_NARROW
      if (closePunctuationRe.test(text)) return wide ? CLOSE : CLOSE_NARROW
      return OTHER
    }
  }
}
export function getTypeFromBounds(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, c: number, hanWidth: number): { advance: number; type: number } {
  const s = String.fromCharCode(c)
  let advance: number
  let left: number
  let right: number
  if (isCanvasCjkSymbol(c)) {
    const after = ctx.measureText('\u4E2D' + s)
    advance = after.width - hanWidth
    right = after.actualBoundingBoxRight - hanWidth
    left = -ctx.measureText(s + '\u4E2D').actualBoundingBoxLeft
  } else {
    const metrics = ctx.measureText(s)
    advance = metrics.width
    left = -metrics.actualBoundingBoxLeft
    right = metrics.actualBoundingBoxRight
  }
  const halfEm = advance / 2
  const type = right <= halfEm ? CLOSE : left >= halfEm ? OPEN : right - left <= halfEm && left >= halfEm / 2 ? MIDDLE : OTHER
  return { advance, type }
}
export function getTrim(data: HanKerningFontData, c: number, measurement: FontMeasurement): number {
  let trim = data.trims.get(c)
  if (trim === undefined) {
    const one = String.fromCharCode(c)
    trim = 2 * getSegmentMetrics(one, measurement).width - getSegmentMetrics(one + one, measurement).width
    data.trims.set(c, trim)
  }
  return trim
}
export function getFontData(measurement: FontMeasurement): HanKerningFontData | null {
  if (measurement.hanKerning !== undefined) return measurement.hanKerning
  const data: HanKerningFontData = { typeForDot: OTHER, typeForColon: OTHER, typeForSemicolon: OTHER, quoteFullwidth: false, trims: new Map() }
  if (getTrim(data, 0x300C, measurement) <= 1e-3) {
    measurement.hanKerning = null
    return null
  }
  const hanWidth = getSegmentMetrics('\u4E2D', measurement).width
  const ctx = getContext(measurement)
  const glyphs = [0x3001, 0x3002, 0xFF0C, 0xFF0E, 0xFF1A, 0xFF1B, 0x201C, 0x2018, 0x201D, 0x2019].map(c => getTypeFromBounds(ctx, c, hanWidth))
  // A group has one type only when its glyphs share the advance and the type (han_kerning.cc:88-135).
  const group = (from: number, to: number): number => {
    for (let i = from + 1; i < to; i++) {
      if (glyphs[i]!.advance !== glyphs[from]!.advance || glyphs[i]!.type !== glyphs[from]!.type) return OTHER
    }
    return glyphs[from]!.type
  }
  data.typeForDot = group(0, 4)
  data.typeForColon = glyphs[4]!.type
  data.typeForSemicolon = glyphs[5]!.type
  data.quoteFullwidth = group(6, 8) === OPEN && group(8, 10) === CLOSE
  measurement.hanKerning = data
  return data
}
export function getCharType(data: HanKerningFontData, text: string, index: number): number {
  const type = getStaticCharType(text, index)
  switch (type) {
    case DOT: return data.typeForDot
    case COLON: return data.typeForColon
    case SEMICOLON: return data.typeForSemicolon
    case OPEN_QUOTE: return data.quoteFullwidth ? OPEN : OPEN_NARROW
    case CLOSE_QUOTE: return data.quoteFullwidth ? CLOSE : CLOSE_NARROW
    default: return type
  }
}
export function haltedSide(earlier: number, later: number): number {
  if (later === OPEN && (earlier === OPEN || earlier === MIDDLE || earlier === CLOSE || earlier === OPEN_NARROW)) return 1
  if (earlier === CLOSE && (later === CLOSE || later === MIDDLE || later === CLOSE_NARROW)) return -1
  return 0
}
export function isCanvasCjkSymbol(c: number): boolean {
  return (c >= 0x3000 && c <= 0x30FF) || (c >= 0xFE30 && c <= 0xFE6F) || (c >= 0xFF00 && c <= 0xFFEF && c !== 0xFF1B)
}
export function getHanKerningTrims(measurement: FontMeasurement, analysis: TextAnalysis, from: number, to: number): HanKerningTrims {
  const out: HanKerningTrims = { widthTrims: null, lineStartExtras: null, lineEndTrims: null, overflowLineEndTrims: null }
  const data = getFontData(measurement)
  if (data === null) return out
  const { flags, starts, normalized } = analysis
  const count = flags.length
  const addWidthTrim = (i: number, trim: number): void => {
    out.widthTrims ??= zeros(to - from)
    out.widthTrims[i - from] = out.widthTrims[i - from]! + trim
  }
  for (let i = from; i < to; i++) {
    if ((flags[i]! & KIND_BITS) !== TEXT) continue
    const start = starts[i]!
    const end = i + 1 < count ? starts[i + 1]! : normalized.length
    const first = normalized.charCodeAt(start)
    if (i > 0 && maybeHanKerns(first) && haltedSide(getCharType(data, normalized, start - 1), getCharType(data, normalized, start)) === 1) {
      const trim = getTrim(data, first, measurement)
      out.lineStartExtras ??= zeros(to - from)
      out.lineStartExtras[i - from] = trim
      addWidthTrim(i, trim)
    }
    for (let k = start + 1; k < end; k++) {
      const earlier = normalized.charCodeAt(k - 1)
      const later = normalized.charCodeAt(k)
      if (!(maybeHanKerns(earlier) || maybeHanKerns(later)) || isCanvasCjkSymbol(earlier) === isCanvasCjkSymbol(later)) continue
      const side = haltedSide(getCharType(data, normalized, k - 1), getCharType(data, normalized, k))
      if (side !== 0) addWidthTrim(i, getTrim(data, side === 1 ? later : earlier, measurement))
    }
    const last = normalized.charCodeAt(end - 1)
    if (!maybeHanKerns(last)) continue
    // The text after it halts a closing mark wherever the line ends.
    const atEnd = i + 1 === count
    if (!atEnd && haltedSide(getCharType(data, normalized, end - 1), getCharType(data, normalized, end)) === -1) {
      addWidthTrim(i, getTrim(data, last, measurement))
      continue
    }
    // Character::MaybeHanKerningClose (character.h:131-133, character.cc:130-135). Blink then
    // halts the character whatever the font types it (han_kerning.cc:284-285, 312-313); the
    // port asks for a closing type, since only then does 2 W(c) - W(cc) measure the halt.
    const lastType = getStaticCharType(normalized, end - 1)
    if ((lastType !== CLOSE && lastType !== CLOSE_QUOTE) || getCharType(data, normalized, end - 1) !== CLOSE) continue
    // A break directly after the segment: text after a break, or the end of the text.
    if (atEnd || ((flags[i + 1]! & KIND_BITS) === TEXT && (flags[i + 1]! & UNBROKEN) === 0)) {
      out.lineEndTrims ??= zeros(to - from)
      out.lineEndTrims[i - from] = getTrim(data, last, measurement)
    } else {
      out.overflowLineEndTrims ??= zeros(to - from)
      out.overflowLineEndTrims[i - from] = getTrim(data, last, measurement)
    }
  }
  return out
}
