// Moved here from measurement.ts by scripts/specialize.mjs (pack "scripts"). Upstream code, unchanged.
import { findGraphemeEnds, type GraphemeTable } from './graphemes.js'
import { DEFAULT_IGNORABLE, getBlinkDefaultLocale, hasProperty, MARK } from './line-breaks.js'
import { webkitGenericFamilies, webkitGenericFamilyNames, webkitScriptLanguages, webkitScriptSubtags } from './generated/webkit-generic-families.js'
import type { HanKerningFontData } from './han-kerning.js'
import { measureState, cachedEngineProfile, MAX_PREFIX_FIT_GRAPHEMES, LETTER_SPACED_SHAPING, MAX_CACHED_SEGMENTS, maybeEmojiRe, fontSizeRe, familyRe, getWebKitGenericFamilies, localeLanguage, setLocaleLanguage, getPreparationLanguage, MAX_APP_UNITS, readLetterSpacing, noExtraSpacings, getSegmentMetrics, addMetrics, kanaRe, kanaPairRe, noSpaceKerning, isCanvasWordLetter, takesNoSpaceKerning, getFontSpaceKerning, getCharacterSpaceKerning, getSpaceKerning, getSpaceWidth, getTextWidth, getEngineProfile, buildEngineProfile, parseFontSize, textMayContainEmoji, getEmojiCorrection, readEmojiWidth, readWidthIn, WORD_SUM_ROUNDING, getCorrectedSegmentWidth, getSegmentFit, addUpTo, measureFitAdvances, getFontMeasurement, contextTakesFont, getContext, createContext, createMeasureState, clearMeasurementCaches, hasFamily, getCanvasFont, getHyphenText, measureIn, zeros, getExtraSpacings, getFollowingSpaceMetrics, getLayoutEngine, getEmojiGlyphs, countEmojiGlyphs, countLigaturesOnFirstLetter, isLigature } from './measurement.js'
import type { SegmentMetrics, SpaceKerning, SegmentFit, EngineProfile, BreakableFitMode, MeasureState, FontMeasurement, LayoutEngine } from './measurement.js'
export const KANA_COUNT = 0x30ff - 0x3041 + 1
export const KANA_PROBE = '\u30D7\u30C0\u30B0\u30BF\u30CE\u30E0\u30D6\u30A4\u30E1\u3048\u305A\u307A'
export function getWholeRunContext(measurement: FontMeasurement): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const state = measurement.state
  if (state.wholeRunContext === null) {
    state.wholeRunContext = createContext(state.language)
    state.wholeRunContext.textRendering = 'optimizeLegibility'
  }
  if (state.wholeRunFont !== measurement.kanaFont) state.wholeRunContext.font = state.wholeRunFont = measurement.kanaFont
  return state.wholeRunContext
}
export function sameInk(a: TextMetrics, b: TextMetrics): boolean {
  const bound = a.width / 0x400000
  return Math.abs(a.width - b.width) <= bound && Math.abs(a.actualBoundingBoxLeft - b.actualBoundingBoxLeft) <= bound &&
    Math.abs(a.actualBoundingBoxRight - b.actualBoundingBoxRight) <= bound
}
export function getFontKanaKerning(measurement: FontMeasurement): Float64Array | null {
  if (measurement.kanaKerning === undefined) {
    measurement.kanaKerning = null
    const font = measurement.canvasFont
    const size = fontSizeRe.exec(font)
    const start = size === null ? 0 : size.index + size[0].length
    const families = size === null ? null : font.slice(start).match(familyRe)
    const lists = families === null ? 1 : families.length
    let own: TextMetrics | null = null
    for (let i = 0; i < lists; i++) {
      const list = i === 0 ? font : font.slice(0, start) + families!.slice(i).join(',')
      measurement.kanaFont = list
      const context = getWholeRunContext(measurement)
      const kerned = context.measureText(KANA_PROBE).width
      context.fontKerning = 'none'
      const unkerned = context.measureText(KANA_PROBE)
      context.fontKerning = 'auto'
      if (own === null) own = unkerned
      else if (!sameInk(own, unkerned)) break
      if (kerned === unkerned.width) continue
      if (i > 0) {
        // Each hiragana letter before a U+3002: Canvas shapes each pair as one word under any list.
        let pairs = ''
        for (let code = 0x3041; code <= 0x3096; code++) pairs += String.fromCharCode(code, 0x3002)
        const shorter = context.measureText(pairs).width
        measurement.kanaFont = font
        const ownContext = getWholeRunContext(measurement)
        const ownKerned = ownContext.measureText(pairs).width
        ownContext.fontKerning = 'none'
        const ownUnkerned = ownContext.measureText(pairs).width
        ownContext.fontKerning = 'auto'
        if (ownKerned === ownUnkerned || Math.abs(shorter - ownKerned) > ownKerned / 0x400000) break
        measurement.kanaFont = list
      }
      measurement.kanaKerning = new Float64Array(KANA_COUNT * KANA_COUNT).fill(NaN)
      break
    }
    if (measurement.kanaKerning === null) measurement.kanaFont = font
  }
  return measurement.kanaKerning
}
export function getKanaKerning(text: string, start: number, at: number, measurement: FontMeasurement, kernings: Float64Array): number {
  const second = text.charCodeAt(at)
  if (second < 0x3041 || second > 0x30ff) return 0
  const first = text.charCodeAt(at - 1)
  if (first < 0x3041 || first > 0x30ff) return 0
  if (at > start) {
    if (!isCanvasWordLetter(second)) return 0
    // What Canvas's word held before the marks that end it.
    let k = at - 1
    let code = first
    while (code >= 0x3041 && code <= 0x30ff && !isCanvasWordLetter(code)) {
      if (k === start) return 0
      code = text.charCodeAt(--k)
    }
    if (code >= 0x2e80 && !isCanvasWordLetter(code)) return 0
  }
  const index = (first - 0x3041) * KANA_COUNT + second - 0x3041
  const kerning = kernings[index]!
  return Number.isNaN(kerning) ? kernings[index] = measureKanaKerning(text.slice(at - 1, at + 1), measurement) : kerning
}
export function measureKanaKerning(pair: string, measurement: FontMeasurement): number {
  const pairWidth = getWholeRunContext(measurement).measureText(pair).width
  const kerning = pairWidth - getSegmentMetrics(pair[0]!, measurement).width - getSegmentMetrics(pair[1]!, measurement).width
  // As for a character and a space, up to the pair's width / 2^22 is rounding.
  return Math.abs(kerning) <= pairWidth / 0x400000 ? 0 : kerning
}
