// Moved here from prepare.ts by scripts/specialize.mjs (pack "rare"). Upstream code, unchanged.
import { getHanKerningTrims, textMayHanKern, type HanKerningTrims } from './han-kerning.js'
import { findGraphemeEnds, type GraphemeTable } from './graphemes.js'
import { scriptClassFacts } from './generated/engine-break-data.js'
import { DEFAULT_IGNORABLE, getClass, hasProperty, lazyRegExp, unpackClasses, type ClassTable } from './line-breaks.js'
import {
  CONTROL,
  HARD_BREAK,
  KIND_BITS,
  ONE_CLUSTER,
  PRESERVED_SPACE,
  SOFT_HYPHEN,
  SPACE,
  SPACED,
  TAB,
  TEXT,
  UNBROKEN,
  ZERO_WIDTH_BREAK,
  ZERO_WIDTH_GLUE,
  type SegmentKindCode,
  type TextAnalysis,
} from './analysis.js'
import {
  type BreakableFitMode,
  type EngineProfile,
  type FontMeasurement,
  getCorrectedSegmentWidth,
  getEmojiCorrection,
  getExtraSpacings,
  getFollowingSpaceMetrics,
  getFontKanaKerning,
  getFontMeasurement,
  getFontSpaceKerning,
  getHyphenText,
  getKanaKerning,
  getSegmentFit,
  getSegmentMetrics,
  getSpaceKerning,
  getSpaceWidth,
  getTextWidth,
  kanaPairRe,
  noExtraSpacings,
  noSpaceKerning,
  textMayContainEmoji,
  type SegmentMetrics,
  zeros,
} from './measurement.js'
import type { PreparedText } from './layout.js'
import type { PreparedLineBreakData } from './line-break.js'
import type { PreparedSegments } from './line-text.js'
import { addInternalLetterSpacing, leadingCombiningMarkRe, numericRunRe, controlCharacterRe, mixedDirectionRe, isSpaceKind, OTHER_SCRIPT, CYRILLIC_SCRIPT, GREEK_SCRIPT, LATIN_SCRIPT, CURSIVE_SCRIPT, ANY_SCRIPT, MARK_SCRIPTS_SHIFT, TAKES_MARK_SCRIPTS, CURSIVE_LETTER, OPENING_BRACKET, CLOSING_BRACKET, OPENING_BRACKET_SHIFT, scriptClasses, getScriptFacts, getScriptFactsAt, readScriptRuns, spaceSharesScriptRun, getTextSegmentWidth, measureAnalysis, __resetEngineData, getUnspacedGraphemes, addKanaKerning, addIdeographicSpaceHangs } from './prepare.js'
import type { ScriptRuns, ParagraphLists } from './prepare.js'
export function countRenderedSpacingGraphemes(text: string, kind: SegmentKindCode, graphemeTable: GraphemeTable): number {
  return kind === ZERO_WIDTH_BREAK ? 0 : findGraphemeEnds(graphemeTable, text, 0, text.length, null)
}
export const complexTextPathRanges = [
  0x02E5, 0x02E9, 0x0300, 0x036F, 0x0591, 0x05BD, 0x05BF, 0x05CF, 0x0600, 0x109F,
  0x1100, 0x11FF, 0x135D, 0x135F, 0x1700, 0x18AF, 0x1900, 0x194F, 0x1980, 0x19DF,
  0x1A00, 0x1CFF, 0x1DC0, 0x1DFF, 0x20D0, 0x20FF, 0x26F9, 0x26F9, 0x2CEF, 0x2CF1,
  0x302A, 0x302F, 0x3099, 0x309C, 0xA67C, 0xA67D, 0xA6F0, 0xA6F1, 0xA800, 0xABFF,
  0xD7B0, 0xD7FF, 0xFE00, 0xFE0F, 0xFE20, 0xFE2F, 0x10A00, 0x10A5F, 0x11000, 0x110CF,
  0x11100, 0x111DF, 0x11200, 0x1124F, 0x112B0, 0x1137F, 0x11400, 0x114DF, 0x11580, 0x1165F,
  0x11680, 0x116CF, 0x11700, 0x11CBF, 0x16B00, 0x16B8F, 0x1E900, 0x1E95F, 0x1F1E6, 0x1F1FF,
  0x1F3FB, 0x1F3FF, 0xE0000, 0xE007F, 0xE0100, 0xE01EF,
] as const
export const extendedPictographicRe = /\p{Extended_Pictographic}/u
export function needsComplexTextPath(text: string): boolean {
  let previousIsEmoji = false
  for (let i = 0; i < text.length;) {
    const codePoint = text.codePointAt(i)!
    i += codePoint > 0xFFFF ? 2 : 1
    if (codePoint === 0x200D && previousIsEmoji) return true
    previousIsEmoji = codePoint > 0xFFFF && extendedPictographicRe.test(String.fromCodePoint(codePoint))
    for (let range = 0; range < complexTextPathRanges.length && codePoint >= complexTextPathRanges[range]!; range += 2) {
      if (codePoint <= complexTextPathRanges[range + 1]!) return true
    }
  }
  return false
}
export function mayHoldCursive(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 0x80) continue
    const facts = getScriptFacts(text.codePointAt(i)!)
    if ((facts & ANY_SCRIPT) === CURSIVE_SCRIPT || (facts >> MARK_SCRIPTS_SHIFT & ANY_SCRIPT) === CURSIVE_SCRIPT) return true
  }
  return false
}
export function getFollowingSpaceTail(analysis: TextAnalysis, analysisIndex: number, to: number): string | null {
  const { normalized, spaceSources, starts, flags } = analysis
  let next = analysisIndex + 1
  while (next < to && (flags[next]! & KIND_BITS) === ZERO_WIDTH_BREAK) next++
  if (next >= to) return null
  const nextKind = flags[next]! & KIND_BITS
  // A collapsed space's first source character: WebKit looks at the source after a text item.
  const spaceStart = starts[next]!
  if ((nextKind !== SPACE && nextKind !== PRESERVED_SPACE) || (spaceSources === null ? normalized.charCodeAt(spaceStart) : spaceSources[spaceStart]!) !== 0x20) return null
  return normalized.slice(starts[analysisIndex + 1], spaceStart)
}
export function getTailKerning(item: string, measurement: FontMeasurement, spaceWidth: number): number {
  return getFollowingSpaceMetrics(item, measurement).width - getSegmentMetrics(item, measurement).width - spaceWidth
}
export function getJoinedNarrowing(analysis: TextAnalysis, analysisIndex: number, to: number, before: string | null, beforeMetrics: SegmentMetrics | null, measurement: FontMeasurement, emojiCorrection: number, lineFitEpsilon: number): number {
  if (before === null) return 0
  const { texts, flags } = analysis
  let next = analysisIndex + 1
  while (next < to && (flags[next]! & KIND_BITS) === SOFT_HYPHEN) next++
  if (next >= to || (flags[next]! & KIND_BITS) !== TEXT) return 0
  const after = texts[next]!
  const apart = getCorrectedSegmentWidth(before, beforeMetrics!, measurement, emojiCorrection) + getTextWidth(after, measurement, emojiCorrection)
  const together = getTextWidth(before + after, measurement, emojiCorrection)
  return apart - together > lineFitEpsilon ? apart - together : 0
}
