// Moved here from measurement.ts by scripts/specialize.mjs (pack "rare"). Upstream code, unchanged.
import { findGraphemeEnds, type GraphemeTable } from './graphemes.js'
import { DEFAULT_IGNORABLE, getBlinkDefaultLocale, hasProperty, MARK } from './line-breaks.js'
import { webkitGenericFamilies, webkitGenericFamilyNames, webkitScriptLanguages, webkitScriptSubtags } from './generated/webkit-generic-families.js'
import type { HanKerningFontData } from './han-kerning.js'
import { measureState, cachedEngineProfile, MAX_PREFIX_FIT_GRAPHEMES, LETTER_SPACED_SHAPING, MAX_CACHED_SEGMENTS, maybeEmojiRe, fontSizeRe, familyRe, getWebKitGenericFamilies, localeLanguage, setLocaleLanguage, getPreparationLanguage, MAX_APP_UNITS, readLetterSpacing, noExtraSpacings, getSegmentMetrics, addMetrics, kanaRe, kanaPairRe, noSpaceKerning, getSpaceWidth, getTextWidth, getEngineProfile, buildEngineProfile, parseFontSize, textMayContainEmoji, getEmojiCorrection, readEmojiWidth, readWidthIn, getCorrectedSegmentWidth, getSegmentFit, countLigaturesOnFirstLetter, isLigature, measureFitAdvances, getFontMeasurement, contextTakesFont, getContext, createContext, createMeasureState, clearMeasurementCaches, getExtraSpacings, getFontKanaKerning, getKanaKerning } from './measurement.js'
import type { SegmentMetrics, SpaceKerning, SegmentFit, EngineProfile, BreakableFitMode, MeasureState, FontMeasurement, LayoutEngine } from './measurement.js'
export const emojiGraphemeRe = /\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}\uFE0F/u
export const genericKeywords = ['serif', 'sans-serif', 'cursive', 'fantasy', 'monospace']
export const familyListItemRe = /("[^"]*"|'[^']*')|(^|,)(\s*)(serif|sans-serif|cursive|fantasy|monospace)(?=\s*(?:,|$))/gi
export const familyProbeText = 'Hamburg 한中 नम សួ ನಮ ສະ നമ မင ନମ ආය བཀ'
export function hasFamily(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, family: string): boolean {
  for (const fallback of ['monospace', 'serif']) {
    ctx.font = `16px ${fallback}`
    const width = ctx.measureText(familyProbeText).width
    ctx.font = `16px "${family}", ${fallback}`
    if (ctx.measureText(familyProbeText).width !== width) return true
  }
  return false
}
export function getCanvasFont(font: string, families: readonly string[]): string {
  const size = fontSizeRe.exec(font)
  if (size === null) return font
  const start = size.index + size[0].length
  return font.slice(0, start) + font.slice(start).replace(familyListItemRe, (item: string, quoted: string | undefined, separator: string, space: string, keyword: string) => {
    const named = quoted === undefined ? families[genericKeywords.indexOf(keyword.toLowerCase())]! : ''
    return named === '' ? item : separator + space + named
  })
}
export function getHyphenText(measurement: FontMeasurement): string {
  if (measurement.hyphenText !== null) return measurement.hyphenText
  const font = measurement.canvasFont
  const size = fontSizeRe.exec(font)
  let hyphenText = '-'
  if (size !== null && getSegmentMetrics('\u2010', measurement).width !== getSegmentMetrics('-', measurement).width) {
    const context = getContext(measurement)
    const start = size.index + size[0].length
    const prefix = font.slice(0, start)
    const families = font.slice(start).match(familyRe) ?? []
    const monospace = prefix + 'monospace'
    const serif = prefix + 'serif'
    if (measureIn(context, monospace, ' ') !== measureIn(context, serif, ' ') && measureIn(context, monospace, '\u2010') !== measureIn(context, serif, '\u2010')) {
      for (let i = 0; i < families.length; i++) {
        const beforeMonospace = `${prefix}${families[i]}, monospace`
        const beforeSerif = `${prefix}${families[i]}, serif`
        if (measureIn(context, beforeMonospace, ' ') !== measureIn(context, beforeSerif, ' ')) continue
        if (measureIn(context, beforeMonospace, '\u2010') === measureIn(context, beforeSerif, '\u2010')) hyphenText = '\u2010'
        break
      }
    }
    context.font = font
  }
  measurement.hyphenText = hyphenText
  return hyphenText
}
export function measureIn(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, font: string, text: string): number {
  context.font = font
  return context.measureText(text).width
}
export function zeros(count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(0)
  return out
}
export function getFollowingSpaceMetrics(seg: string, measurement: FontMeasurement): SegmentMetrics {
  return measurement.followingSpaceMetrics.get(seg) ?? addMetrics(measurement.followingSpaceMetrics, seg, seg + ' ', measurement)
}
export function isCanvasWordLetter(code: number): boolean {
  return (code >= 0x3041 && code <= 0x3096) || (code >= 0x30a1 && code <= 0x30fa) ||
    (code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)
}
export function takesNoSpaceKerning(code: number): boolean {
  // A combining mark or half of a surrogate pair is part of a longer cluster. Canvas shows no
  // kerning beside a letter it shapes as a word of its own.
  return hasProperty(code, MARK) || (code & 0xf800) === 0xd800 || isCanvasWordLetter(code) ||
    // Premise: no font kerns a Hangul syllable with the space (RESEARCH.md, Kerning At Line Edges).
    (code >= 0xac00 && code <= 0xd7a3)
}
export function getFontSpaceKerning(measurement: FontMeasurement): Map<number, number> | null {
  if (measurement.spaceKerning === undefined) {
    const context = getContext(measurement)
    let probe = '\u2028'
    for (let code = 0x21; code <= 0x7e; code++) probe += String.fromCharCode(code) + '\u2028'
    const kerned = context.measureText(probe).width
    context.fontKerning = 'none'
    const unkerned = context.measureText(probe).width
    context.fontKerning = 'auto'
    // Where U+2028 alone doesn't measure as the space, it doesn't stand for it.
    measurement.spaceKerning = kerned !== unkerned && context.measureText('\u2028').width === getSegmentMetrics(' ', measurement).width ? new Map() : null
  }
  return measurement.spaceKerning
}
export function getCharacterSpaceKerning(code: number, spaceFirst: boolean, measurement: FontMeasurement, kernings: Map<number, number>): number {
  const key = code << 1 | (spaceFirst ? 1 : 0)
  let kerning = kernings.get(key)
  if (kerning === undefined) {
    kerning = 0
    if (!takesNoSpaceKerning(code)) {
      const character = String.fromCharCode(code)
      const pairWidth = getContext(measurement).measureText(spaceFirst ? '\u2028' + character : character + '\u2028').width
      kerning = pairWidth - getSegmentMetrics(character, measurement).width - getSegmentMetrics(' ', measurement).width
      // Blink keeps a run's width as a float32 (shape_result.cc:1539-1576), so up to the pair's
      // width / 2^22 is rounding, not kerning (RESEARCH.md, Kerning At Line Edges).
      if (Math.abs(kerning) <= pairWidth / 0x400000) kerning = 0
    }
    kernings.set(key, kerning)
  }
  return kerning
}
export function getSpaceKerning(seg: string, metrics: SegmentMetrics, measurement: FontMeasurement, kernings: Map<number, number>): SpaceKerning {
  let first = 0
  let last = seg.length - 1
  while (first < last && hasProperty(seg.charCodeAt(first), DEFAULT_IGNORABLE)) first++
  while (last > first && hasProperty(seg.charCodeAt(last), DEFAULT_IGNORABLE)) last--
  const before = first < last && hasProperty(seg.charCodeAt(first + 1), MARK) ? 0 : getCharacterSpaceKerning(seg.charCodeAt(first), true, measurement, kernings)
  const after = getCharacterSpaceKerning(seg.charCodeAt(last), false, measurement, kernings)
  return metrics.spaceKerning = after === 0 && before === 0 ? noSpaceKerning : { after, before }
}
export function getLayoutEngine(userAgent: string): LayoutEngine | null {
  if (userAgent.includes('Firefox/')) return 'gecko'
  if (userAgent.includes('AppleWebKit/537.36')) {
    return userAgent.includes('Chrome/') || userAgent.includes('Chromium/') ? 'blink' : null
  }
  return userAgent.includes('AppleWebKit/') ? 'webkit' : null
}
export const CANVAS_WIDTH_ROUNDING = 2 ** -20
export const WORD_SUM_ROUNDING = 2 ** -17
export function getEmojiGlyphs(text: string, measurement: FontMeasurement): number {
  const width = getSegmentMetrics(text, measurement).width
  const glyphs = Math.round(width / measurement.emojiWidth)
  return Math.abs(width - glyphs * measurement.emojiWidth) <= width * CANVAS_WIDTH_ROUNDING ? glyphs : 0
}
export const emojiStretchRe = /[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0E]+/gu
export function countEmojiGlyphs(text: string, measurement: FontMeasurement): number {
  const ends = new Int32Array(text.length)
  const graphemeCount = findGraphemeEnds("gecko/char", text, 0, text.length, ends)
  let count = 0
  for (let i = 0, start = 0; i < graphemeCount; start = ends[i++]!) {
    const grapheme = text.slice(start, ends[i])
    if (!emojiGraphemeRe.test(grapheme)) continue
    const stretches = grapheme.match(emojiStretchRe)!
    for (let s = 0; s < stretches.length; s++) count += getEmojiGlyphs(stretches[s]!, measurement)
  }
  return count
}
export function addUpTo(advances: readonly number[], width: number): boolean {
  let sum = 0
  for (let i = 0; i < advances.length; i++) sum += advances[i]!
  return Math.abs(sum - width) <= width * WORD_SUM_ROUNDING
}
