// Moved here from measurement.ts by scripts/specialize.mjs (pack "rare"). Upstream code, unchanged.
import { findGraphemeEnds, type GraphemeTable } from './graphemes.js'
import { DEFAULT_IGNORABLE, getBlinkDefaultLocale, hasProperty, MARK } from './line-breaks.js'
import { webkitGenericFamilies, webkitGenericFamilyNames, webkitScriptLanguages, webkitScriptSubtags } from './generated/webkit-generic-families.js'
import type { HanKerningFontData } from './han-kerning.js'
import { measureState, cachedEngineProfile, MAX_PREFIX_FIT_GRAPHEMES, LETTER_SPACED_SHAPING, MAX_CACHED_SEGMENTS, maybeEmojiRe, fontSizeRe, familyRe, getWebKitGenericFamilies, localeLanguage, setLocaleLanguage, getPreparationLanguage, MAX_APP_UNITS, readLetterSpacing, noExtraSpacings, getSegmentMetrics, addMetrics, kanaRe, kanaPairRe, noSpaceKerning, isCanvasWordLetter, takesNoSpaceKerning, getFontSpaceKerning, getCharacterSpaceKerning, getSpaceKerning, getSpaceWidth, getTextWidth, getEngineProfile, buildEngineProfile, parseFontSize, textMayContainEmoji, getEmojiCorrection, readEmojiWidth, readWidthIn, WORD_SUM_ROUNDING, getCorrectedSegmentWidth, getSegmentFit, addUpTo, measureFitAdvances, getFontMeasurement, contextTakesFont, getContext, createContext, createMeasureState, clearMeasurementCaches, getExtraSpacings, getFontKanaKerning, getKanaKerning } from './measurement.js'
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
export function getLayoutEngine(userAgent: string): LayoutEngine | null {
  if (userAgent.includes('Firefox/')) return 'gecko'
  if (userAgent.includes('AppleWebKit/537.36')) {
    return userAgent.includes('Chrome/') || userAgent.includes('Chromium/') ? 'blink' : null
  }
  return userAgent.includes('AppleWebKit/') ? 'webkit' : null
}
export const CANVAS_WIDTH_ROUNDING = 2 ** -20
export function getEmojiGlyphs(text: string, measurement: FontMeasurement): number {
  const width = getSegmentMetrics(text, measurement).width
  const glyphs = Math.round(width / measurement.emojiWidth)
  return Math.abs(width - glyphs * measurement.emojiWidth) <= width * CANVAS_WIDTH_ROUNDING ? glyphs : 0
}
export const emojiStretchRe = /[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0E]+/gu
export function countEmojiGlyphs(text: string, measurement: FontMeasurement): number {
  const ends = new Int32Array(text.length)
  const graphemeCount = findGraphemeEnds("chromium/char", text, 0, text.length, ends)
  let count = 0
  for (let i = 0, start = 0; i < graphemeCount; start = ends[i++]!) {
    const grapheme = text.slice(start, ends[i])
    if (!emojiGraphemeRe.test(grapheme)) continue
    const stretches = grapheme.match(emojiStretchRe)!
    for (let s = 0; s < stretches.length; s++) count += getEmojiGlyphs(stretches[s]!, measurement)
  }
  return count
}
export function countLigaturesOnFirstLetter(seg: string, ends: Int32Array, advances: number[], measurement: FontMeasurement, emojiCorrection: number): void {
  // Text measured under letter spacing has no optional ligature, and a context that can't
  // turn them off can't be asked.
  if (!measurement.state.shapesLetterSpaced || measurement.letterSpacing !== '0px') return
  // The grapheme the ligature that holds the grapheme before this one starts with, or that grapheme.
  let first = 0
  for (let i = 1; i < advances.length; i++) {
    const start = ends[i - 1]!
    const alone = getTextWidth(seg.slice(start, ends[i]), measurement, emojiCorrection)
    if (Math.round((advances[i]! - alone) * 60) !== 0 && isLigature(seg.slice(i === 1 ? 0 : ends[i - 2]!, ends[i]), measurement)) {
      advances[first] = advances[first]! + advances[i]!
      advances[i] = 0
    } else {
      first = i
    }
  }
}
export function isLigature(pair: string, measurement: FontMeasurement): boolean {
  let ligature = measurement.ligaturePairs.get(pair)
  if (ligature === undefined) {
    const context = getContext(measurement)
    const width = getSegmentMetrics(pair, measurement).width
    context.letterSpacing = LETTER_SPACED_SHAPING
    ligature = context.measureText(pair).width !== width
    context.letterSpacing = '0px'
    measurement.ligaturePairs.set(pair, ligature)
  }
  return ligature
}
