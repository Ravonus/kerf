// Moved here from prepare.ts by scripts/specialize.mjs (pack "scripts"). Upstream code, unchanged.
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
import { addInternalLetterSpacing, leadingCombiningMarkRe, numericRunRe, controlCharacterRe, mixedDirectionRe, OTHER_SCRIPT, CYRILLIC_SCRIPT, GREEK_SCRIPT, LATIN_SCRIPT, CURSIVE_SCRIPT, ANY_SCRIPT, MARK_SCRIPTS_SHIFT, TAKES_MARK_SCRIPTS, CURSIVE_LETTER, OPENING_BRACKET, CLOSING_BRACKET, OPENING_BRACKET_SHIFT, scriptClasses, getScriptFacts, getTextSegmentWidth, measureAnalysis, __resetEngineData, countRenderedSpacingGraphemes, needsComplexTextPath, isSpaceKind, getScriptFactsAt, mayHoldCursive, readScriptRuns, spaceSharesScriptRun, getUnspacedGraphemes, getFollowingSpaceTail, getTailKerning, getJoinedNarrowing } from './prepare.js'
import type { ScriptRuns, ParagraphLists } from './prepare.js'
export function addKanaKerning(extras: number[] | null, widths: number[], base: number, analysis: TextAnalysis, from: number, to: number, measurement: FontMeasurement, kernings: Float64Array): number[] | null {
  const { normalized, starts, flags } = analysis
  for (let i = from; i < to; i++) {
    if ((flags[i]! & KIND_BITS) !== TEXT) continue
    const start = starts[i]!
    const end = i + 1 < flags.length ? starts[i + 1]! : normalized.length
    const at = base + i - from
    for (let k = i > from ? start : start + 1; k < end; k++) {
      const kerning = getKanaKerning(normalized, start, k, measurement, kernings)
      if (kerning === 0) continue
      if (k > start) {
        widths[at] = widths[at]! + kerning
      } else if (kerning > 0) {
        widths[at - 1] = widths[at - 1]! + kerning
      } else {
        widths[at] = widths[at]! + kerning
        extras ??= zeros(to - from)
        extras[i - from] = extras[i - from]! - kerning
      }
    }
  }
  return extras
}
export function addIdeographicSpaceHangs(
  trims: number[] | null,
  analysis: TextAnalysis,
  measurement: FontMeasurement,
  letterSpacing: number,
  hyphenWidth: number,
  from: number,
  to: number,
): number[] | null {
  const { normalized, starts, flags } = analysis
  for (let i = from; i < to; i++) {
    const end = i + 1 < flags.length ? starts[i + 1]! : normalized.length
    if ((flags[i]! & KIND_BITS) !== TEXT || normalized.charCodeAt(end - 1) !== 0x3000) continue
    if (i + 1 < to) {
      const next = flags[i + 1]! & KIND_BITS
      if (next !== HARD_BREAK && next !== SPACE && !(next === TEXT && (flags[i + 1]! & UNBROKEN) === 0)) continue
    }
    let start = end - 1
    while (start > starts[i]! && normalized.charCodeAt(start - 1) === 0x3000) start--
    const run = normalized.slice(start, end)
    const afterSoftHyphen = i > 0 && start === starts[i] && normalized.charCodeAt(start - 1) === 0xAD
    const hang = getSegmentMetrics(run, measurement).width + run.length * letterSpacing - (afterSoftHyphen ? hyphenWidth : 0)
    if (hang <= 0) continue
    trims ??= zeros(to - from)
    trims[i - from] = trims[i - from]! + hang
  }
  return trims
}
