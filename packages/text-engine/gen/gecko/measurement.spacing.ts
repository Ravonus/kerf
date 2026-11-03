// Moved here from measurement.ts by scripts/specialize.mjs (pack "spacing"). Upstream code, unchanged.
import { findGraphemeEnds, type GraphemeTable } from './graphemes.js'
import { DEFAULT_IGNORABLE, getBlinkDefaultLocale, hasProperty, MARK } from './line-breaks.js'
import { webkitGenericFamilies, webkitGenericFamilyNames, webkitScriptLanguages, webkitScriptSubtags } from './generated/webkit-generic-families.js'
import type { HanKerningFontData } from './han-kerning.js'
import { measureState, cachedEngineProfile, MAX_PREFIX_FIT_GRAPHEMES, LETTER_SPACED_SHAPING, MAX_CACHED_SEGMENTS, maybeEmojiRe, fontSizeRe, familyRe, getWebKitGenericFamilies, localeLanguage, setLocaleLanguage, getPreparationLanguage, MAX_APP_UNITS, readLetterSpacing, noExtraSpacings, getSegmentMetrics, addMetrics, kanaRe, kanaPairRe, noSpaceKerning, getSpaceWidth, getTextWidth, getEngineProfile, buildEngineProfile, parseFontSize, textMayContainEmoji, getEmojiCorrection, readEmojiWidth, readWidthIn, getCorrectedSegmentWidth, getSegmentFit, countLigaturesOnFirstLetter, isLigature, measureFitAdvances, getFontMeasurement, contextTakesFont, getContext, createContext, createMeasureState, clearMeasurementCaches, hasFamily, getCanvasFont, getHyphenText, measureIn, zeros, getFollowingSpaceMetrics, isCanvasWordLetter, takesNoSpaceKerning, getFontSpaceKerning, getCharacterSpaceKerning, getSpaceKerning, getFontKanaKerning, getKanaKerning, getLayoutEngine, getEmojiGlyphs, countEmojiGlyphs, addUpTo } from './measurement.js'
import type { SegmentMetrics, SpaceKerning, SegmentFit, EngineProfile, BreakableFitMode, MeasureState, FontMeasurement, LayoutEngine } from './measurement.js'
export const GLYPH_COUNT_SPACING = 2 ** 20
export function getExtraSpacings(seg: string, measurement: FontMeasurement): number[] {
  if (!measurement.state.takesLetterSpacing) return noExtraSpacings
  const ends = new Int32Array(seg.length)
  const count = findGraphemeEnds("gecko/char", seg, 0, seg.length, ends)
  const prefixes = count <= MAX_PREFIX_FIT_GRAPHEMES
  const counts = measurement.glyphCounts
  // The font's context once Canvas is asked, under the counting spacing from then on, so
  // it changes its spacing once, and not at all for a segment whose prefixes are counted.
  let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
  let extras = noExtraSpacings
  try {
    let before = 0
    for (let i = 0, start = 0; i < count; start = ends[i++]!) {
      const text = seg.slice(prefixes ? 0 : start, ends[i])
      let glyphs = counts.get(text)
      if (glyphs === undefined) {
        if (context === null) {
          context = getContext(measurement)
          context.letterSpacing = `${GLYPH_COUNT_SPACING}px`
        }
        glyphs = Math.round(context.measureText(text).width / GLYPH_COUNT_SPACING)
        counts.set(text, glyphs)
      }
      const extra = glyphs - (prefixes ? before : 0) - 1
      before = glyphs
      if (extra === 0 && extras.length === 0) continue
      if (extras.length === 0) extras = zeros(count)
      extras[i] = extra
    }
  } finally {
    if (context !== null) context.letterSpacing = measurement.letterSpacing
  }
  return extras
}
