// Moved here from prepare.ts by scripts/specialize.mjs (pack "spacing"). Upstream code, unchanged.
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
import { addInternalLetterSpacing, leadingCombiningMarkRe, numericRunRe, controlCharacterRe, mixedDirectionRe, isSpaceKind, OTHER_SCRIPT, CYRILLIC_SCRIPT, GREEK_SCRIPT, LATIN_SCRIPT, CURSIVE_SCRIPT, ANY_SCRIPT, MARK_SCRIPTS_SHIFT, TAKES_MARK_SCRIPTS, CURSIVE_LETTER, OPENING_BRACKET, CLOSING_BRACKET, OPENING_BRACKET_SHIFT, scriptClasses, getScriptFacts, getScriptFactsAt, readScriptRuns, spaceSharesScriptRun, getTextSegmentWidth, measureAnalysis, __resetEngineData, countRenderedSpacingGraphemes, needsComplexTextPath, mayHoldCursive, getFollowingSpaceTail, getTailKerning, getJoinedNarrowing, addKanaKerning, addIdeographicSpaceHangs } from './prepare.js'
import type { ScriptRuns, ParagraphLists } from './prepare.js'
export function getUnspacedGraphemes(text: string, start: number, end: number, graphemeTable: GraphemeTable, runs: ScriptRuns | null): number[] | null {
  const ends = new Int32Array(end - start)
  const count = findGraphemeEnds(graphemeTable, text, start, end, ends)
  let unspaced: number[] | null = null
  for (let g = 0, at = start; g < count; at = ends[g++]!) {
    const joins = runs === null ? (getScriptFacts(text.codePointAt(at)!) & CURSIVE_LETTER) !== 0
      : readScriptRuns(runs, text, at + 1) === CURSIVE_SCRIPT && text.charCodeAt(at) !== 0xA0
    if (joins) (unspaced ??= []).push(g)
  }
  return unspaced
}
