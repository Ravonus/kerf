// Moved here from analysis.ts by scripts/specialize.mjs (pack "rare"). Upstream code, unchanged.
import { getGeckoLineBreaks, isDiscardable, isEastAsianSegmentBreak, isJapaneseOrChinese, isSpaceCombiningSequenceTail, isSpaceOrTabOrSegmentBreak } from './gecko-line-breaks.js'
import { isBidiControl, type GraphemeTable } from './graphemes.js'
import { BREAK, CLUSTER_START, FORCED_BREAK, ITEM_START, SOFT_HYPHEN_BREAK, getBlinkLineBreaks, getWebKitBreakBetweenItems, getWebKitLineBreaks } from './line-breaks.js'
import { TEXT, SPACE, ZERO_WIDTH_BREAK, SOFT_HYPHEN, PRESERVED_SPACE, TAB, ZERO_WIDTH_GLUE, CONTROL, HARD_BREAK, OBJECT, KIND_BITS, SPACED, UNBROKEN, RETURNABLE, ONE_CLUSTER, SEGMENT_KINDS, collapsibleWhitespaceRunRe, needsWhitespaceNormalizationRe, removeSkippableSegmentBreaks, maybeEastAsianRe, collapseWhitespaceNormal, normalizeWhitespacePreWrap, combiningMarkRe, classifySegmentBreakCode, classifySegmentUnit, gathersKind, isControlSegmentCode, segmentAtLineBreaks, analyzeText, removeItemsSkippableSegmentBreaks, alignToSource, markItemStarts, getWebKitParagraphBreaks } from './analysis.js'
import type { WhiteSpaceMode, WordBreakMode, SegmentBreakKind, SegmentKindCode, TextAnalysis, AnalysisProfile, ParagraphItems } from './analysis.js'
export function isSegmentBreakRunSpace(code: number, scan: AnalysisProfile['lineBreakScan']): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0A || (code === 0x0D && 'blink' === 'blink')
}
export function getTrailingCollapsibleStart(text: string, from: number, profile: AnalysisProfile): number {
  let start = text.length
  for (let i = text.length - 1; i >= from; i--) {
    const code = text.charCodeAt(i)
    if (isCollapsibleSpaceCode(code)) start = i
    else if (!("blink" === 'gecko' && isBidiControl(code))) break
  }
  return start
}
export function isCollapsibleSpaceCode(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0A || code === 0x0D || code === 0x0C
}
export function mapSourceLineBreaks(source: string, normalizedLength: number, sourceBreaks: Uint8Array, whiteSpace: WhiteSpaceMode, spaceSources: Uint16Array | null): Uint8Array {
  const breaks = new Uint8Array(normalizedLength + 1)
  let normalizedIndex = 0
  if (whiteSpace === 'pre-wrap') {
    for (let i = 0; i < source.length; i++, normalizedIndex++) {
      breaks[normalizedIndex] = sourceBreaks[i]!
      if (source.charCodeAt(i) === 0x0D && source.charCodeAt(i + 1) === 0x0A) {
        i++
        if ((sourceBreaks[i]! & BREAK) !== 0) breaks[normalizedIndex] = sourceBreaks[i]!
      }
    }
    breaks[normalizedLength] = sourceBreaks[source.length]!
    return breaks
  }
  let i = 0
  while (i < source.length && isCollapsibleSpaceCode(source.charCodeAt(i))) i++
  while (i < source.length) {
    let end = i + 1
    if (isCollapsibleSpaceCode(source.charCodeAt(i))) {
      while (end < source.length && isCollapsibleSpaceCode(source.charCodeAt(end))) end++
      if (end === source.length) break
    }
    if ((sourceBreaks[i]! & BREAK) === 0 && breaks[normalizedIndex] === 0) breaks[normalizedIndex] = sourceBreaks[i]!
    if (spaceSources !== null) spaceSources[normalizedIndex] = source.charCodeAt(i)
    const start = i
    for (; i < end; i++) {
      if ((sourceBreaks[i]! & BREAK) !== 0) breaks[i === start ? normalizedIndex : normalizedIndex + 1] = sourceBreaks[i]!
    }
    normalizedIndex++
  }
  breaks[normalizedLength] = (sourceBreaks[i]! & BREAK) === 0 ? sourceBreaks[i]! : sourceBreaks[i]! & FORCED_BREAK
  return breaks
}
export function followsChunkContent(normalized: string, i: number): boolean {
  let j = i - 1
  while (j >= 0 && normalized.charCodeAt(j) === 0x00AD) j--
  return j >= 0 && normalized.charCodeAt(j) !== 0x0A
}
