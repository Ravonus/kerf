// Moved here from analysis.ts by scripts/specialize.mjs (pack "rich"). Upstream code, unchanged.
import { getGeckoLineBreaks, isDiscardable, isEastAsianSegmentBreak, isJapaneseOrChinese, isSpaceCombiningSequenceTail, isSpaceOrTabOrSegmentBreak } from './gecko-line-breaks.js'
import { isBidiControl, type GraphemeTable } from './graphemes.js'
import { BREAK, CLUSTER_START, FORCED_BREAK, ITEM_START, SOFT_HYPHEN_BREAK, getBlinkLineBreaks, getWebKitBreakBetweenItems, getWebKitLineBreaks } from './line-breaks.js'
import { TEXT, SPACE, ZERO_WIDTH_BREAK, SOFT_HYPHEN, PRESERVED_SPACE, TAB, ZERO_WIDTH_GLUE, CONTROL, HARD_BREAK, OBJECT, KIND_BITS, SPACED, UNBROKEN, RETURNABLE, ONE_CLUSTER, SEGMENT_KINDS, collapsibleWhitespaceRunRe, needsWhitespaceNormalizationRe, removeSkippableSegmentBreaks, maybeEastAsianRe, collapseWhitespaceNormal, normalizeWhitespacePreWrap, combiningMarkRe, classifySegmentBreakCode, classifySegmentUnit, gathersKind, isControlSegmentCode, segmentAtLineBreaks, analyzeText, isSegmentBreakRunSpace, getTrailingCollapsibleStart, isCollapsibleSpaceCode, mapSourceLineBreaks, followsChunkContent } from './analysis.js'
import type { WhiteSpaceMode, WordBreakMode, SegmentBreakKind, SegmentKindCode, TextAnalysis, AnalysisProfile, ParagraphItems } from './analysis.js'
export function removeItemsSkippableSegmentBreaks(text: string, starts: number[], profile: AnalysisProfile, language: string | null, resultStarts: number[]): string {
  if ("gecko" === 'webkit' || !text.includes('\n')) return text
  let result = ''
  // Where the text that isn't in `result` yet starts. Only an item that holds a line feed can
  // change, so only those are cut out and transformed, and the text between two that changed is
  // copied in one piece.
  let copied = 0
  let newline = text.indexOf('\n')
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k]!
    const end = k + 1 < starts.length ? starts[k + 1]! : text.length
    resultStarts.push(result.length + start - copied)
    if (newline < 0 || newline >= end) continue
    const item = text.slice(start, end)
    const transformed = removeSkippableSegmentBreaks(item, profile, language)
    if (transformed.length !== item.length) {
      result += text.slice(copied, start) + transformed
      copied = end
    }
    newline = text.indexOf('\n', end)
  }
  return copied === 0 ? text : result + text.slice(copied)
}
export function alignToSource(source: string, normalized: string, scan: AnalysisProfile['lineBreakScan']): Int32Array {
  const offsets = new Int32Array(normalized.length)
  // The units no space comes from under `scan`, or -1.
  const cr = 'gecko' === 'blink' ? -1 : 0x0D
  const ff = 'gecko' === 'gecko' ? 0x0C : -1
  let i = 0
  for (let j = 0; j < normalized.length; j++) {
    const unit = normalized.charCodeAt(j)
    while (i < source.length) {
      const code = source.charCodeAt(i)
      if (code === unit || (isCollapsibleSpaceCode(code) && (unit === 0x20 ? code !== cr && code !== ff : unit === 0x0A))) break
      i++
    }
    offsets[j] = i++
    // CRLF became one LF.
    if (unit === 0x0A && source.charCodeAt(i - 1) === 0x0D && source.charCodeAt(i) === 0x0A) i++
  }
  return offsets
}
export function markItemStarts(text: string, normalized: string, breaks: Uint8Array, paragraph: ParagraphItems, scan: AnalysisProfile['lineBreakScan']): void {
  const offsets = paragraph.sourceOffsets = alignToSource(text, normalized, scan)
  const { starts, atomic } = paragraph
  for (let k = 0, j = 0; k < starts.length; k++) {
    while (j < normalized.length && offsets[j]! < starts[k]!) j++
    if (j === normalized.length) break
    breaks[j] = breaks[j]! | ITEM_START
    if (atomic[k] && offsets[j] === starts[k]) {
      breaks[j] = breaks[j]! | BREAK
      breaks[j + 1] = breaks[j + 1]! | BREAK | ITEM_START
    }
  }
}
export function getWebKitParagraphBreaks(source: string, paragraph: ParagraphItems, preserve: boolean, keepAll: boolean, language: string | null): Uint8Array {
  const { items, starts, atomic } = paragraph
  const breaks = new Uint8Array(source.length + 1)
  let previous = -1
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k]!
    const end = k + 1 < starts.length ? starts[k + 1]! : source.length
    if (start === end) continue
    // An item of one unit, as a space between two styled words or an atomic item's U+FFFC, has
    // no break inside, and its scan marks its end only after a line or paragraph separator
    // (getWebKitLineBreaks), so only those are scanned.
    const first = source.charCodeAt(start)
    if (end - start > 1 || first === 0x2028 || first === 0x2029) {
      const itemBreaks = getWebKitLineBreaks(items[k]!.text!, preserve, keepAll, language)
      for (let i = 1; i <= end - start; i++) breaks[start + i] = itemBreaks[i]!
    }
    if (previous >= 0 && !atomic[k] && !atomic[previous]) {
      const last = source.charCodeAt(start - 1)
      const collapses = !preserve && ((first !== 0x0D && isCollapsibleSpaceCode(first)) || (last !== 0x0D && isCollapsibleSpaceCode(last)))
      if (collapses || getWebKitBreakBetweenItems(items[previous]!.text!, items[k]!.text!, keepAll, language)) breaks[start] = breaks[start]! | BREAK
    }
    previous = k
  }
  return breaks
}
