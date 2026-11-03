// Moved here from measurement.ts by scripts/specialize.mjs (pack "families"). Upstream code, unchanged.
import { findGraphemeEnds, type GraphemeTable } from './graphemes.js'
import { DEFAULT_IGNORABLE, getBlinkDefaultLocale, hasProperty, MARK } from './line-breaks.js'
import { webkitGenericFamilies, webkitGenericFamilyNames, webkitScriptLanguages, webkitScriptSubtags } from './generated/webkit-generic-families.js'
import type { HanKerningFontData } from './han-kerning.js'
import { measureState, cachedEngineProfile, MAX_PREFIX_FIT_GRAPHEMES, LETTER_SPACED_SHAPING, MAX_CACHED_SEGMENTS, maybeEmojiRe, genericKeywords, familyListItemRe, fontSizeRe, familyRe, getCanvasFont, localeLanguage, setLocaleLanguage, getPreparationLanguage, MAX_APP_UNITS, readLetterSpacing, noExtraSpacings, getSegmentMetrics, getFollowingSpaceMetrics, addMetrics, kanaRe, kanaPairRe, noSpaceKerning, getSpaceWidth, getTextWidth, getEngineProfile, buildEngineProfile, parseFontSize, textMayContainEmoji, getEmojiCorrection, readEmojiWidth, readWidthIn, getCorrectedSegmentWidth, getSegmentFit, measureFitAdvances, getFontMeasurement, contextTakesFont, getContext, createContext, createMeasureState, clearMeasurementCaches, genericKeywordRe, getHyphenText, measureIn, zeros, getExtraSpacings, isCanvasWordLetter, takesNoSpaceKerning, getFontSpaceKerning, getCharacterSpaceKerning, getSpaceKerning, getFontKanaKerning, getKanaKerning, getLayoutEngine, getEmojiGlyphs, countEmojiGlyphs, countLigaturesOnFirstLetter, isLigature, addUpTo } from './measurement.js'
import type { SegmentMetrics, SpaceKerning, SegmentFit, EngineProfile, BreakableFitMode, MeasureState, FontMeasurement, LayoutEngine } from './measurement.js'
export function getWebKitGenericFamilies(language: string, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): string[] | null {
  let tag = language.toLowerCase().replaceAll('_', '-')
  let han: boolean | null = null
  for (let at = tag; han === null;) {
    if (webkitScriptLanguages.includes(` ${at} `)) han = at === 'zh'
    else {
      const cut = at.lastIndexOf('-')
      if (cut < 0 || at.endsWith('-zyyy')) return null
      if (webkitScriptSubtags.includes(` ${at.slice(cut + 1)} `)) han = at.endsWith('-hani')
      at = at.slice(0, cut)
    }
  }
  if (han) tag = 'zh-hans'
  let row = webkitGenericFamilies[tag]
  while (row === undefined) {
    tag = tag.slice(0, Math.max(0, tag.lastIndexOf('-')))
    row = webkitGenericFamilies[tag]
  }
  const families: string[] = []
  for (let i = 0; i < row.length; i++) {
    // Keywords with the same entry share its family, and the context is asked once.
    const first = row.indexOf(row[i]!)
    if (first < i) {
      families.push(families[first]!)
      continue
    }
    const name = webkitGenericFamilyNames[row[i]!]!
    const pair = name.indexOf('|')
    const family = pair < 0 ? name : hasFamily(ctx, name.slice(0, pair)) ? name.slice(0, pair) : name.slice(pair + 1)
    families.push(family === '' ? '' : `"${family}"`)
  }
  return families
}
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
