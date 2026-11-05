import { getSourceUnits, textSources, findSegmentSources, getSourceOffset } from './rich-inline/sources.js'
import { createLine, createOnlyItemLine } from './rich-inline/lines.js'
import { getHyphenRooms, setEmptyObjectFacts } from './rich-inline/objects.js'
import type { LayoutCursor } from './layout.js'
import {
  analyzeText,
  isCollapsibleSpaceCode,
  HARD_BREAK,
  KIND_BITS,
  OBJECT,
  PRESERVED_SPACE,
  RETURNABLE,
  SOFT_HYPHEN,
  SPACE,
  SPACED,
  TAB,
  TEXT,
  UNBROKEN,
  ZERO_WIDTH_BREAK,
  ZERO_WIDTH_GLUE,
  type ParagraphItems,
} from './analysis.js'
import { buildLineTextFromRange, buildRangeText, getGraphemeEnds, type PreparedSegments } from './line-text.js'
import {
  normalizeMaxWidth,
  normalizePreparedLineStart,
  stepPreparedLineGeometryFromStart,
  walkPreparedLinesRaw,
  type ParagraphSegmentData,
  type PreparedLineData,
} from './line-break.js'
import { getEngineProfile, getFontMeasurement, getPreparationLanguage, getSpaceWidth, readLetterSpacing, zeros, type EngineProfile } from './measurement.js'
import { measureAnalysis, type ParagraphLists } from './prepare.js'

// Helper for rich-text inline flow under `white-space: normal` or `pre-wrap`: one paragraph's text
// broken across its items, as a browser lays out the text of an inline formatting context across
// its spans. The items' texts join into the paragraph's text, an atomic item or a box as one
// U+FFFC, which is analyzed once, as prepare() analyzes a text, with a segment starting wherever an
// item does. Each item's segments are measured in its font, and the text walkers lay the paragraph
// out. So:
// - white space collapses across item boundaries, and under pre-wrap preserved spaces hang
//   across them, tab stops count from the line's start, and hard breaks end lines
// - break opportunities across item boundaries are the engine's: from the text the items join in
//   Blink and Gecko, and in WebKit from each item's own text and the last two characters before
//   it, under the paragraph's word-break; a run that continues across items wraps together
// - atomic inline boxes like pills, and boxes the app sizes and paints, such as images, are one
//   segment each, which a line can break before and after
// - an item's extra horizontal chrome, such as padding and borders, is part of its width on
//   every line the item reaches
// A line's fragments are its segments cut where the item changes.

import type { RichInlineItem, RichInlineBox, RichInlineOptions, PreparedRichInline, RichInlineCursor, RichInlineFragment, RichInlineLine, RichInlineLineRange, RichInlineStats, InternalRichInlineFragment, InternalPreparedRichInline } from './rich-inline-types.js'
export type { RichInlineItem, RichInlineBox, RichInlineOptions, PreparedRichInline, RichInlineCursor, RichInlineFragment, RichInlineFragmentRange, RichInlineLine, RichInlineLineRange, RichInlineStats } from './rich-inline-types.js'

const PRESERVED_WHITE_SPACE = 1 << PRESERVED_SPACE | 1 << TAB

const RICH_INLINE_START_CURSOR: RichInlineCursor = {
  itemIndex: 0,
  segmentIndex: 0,
  graphemeIndex: 0,
}

function getInternalPreparedRichInline(prepared: PreparedRichInline): InternalPreparedRichInline {
  return prepared as InternalPreparedRichInline
}

function appendObject(
  item: RichInlineItem | RichInlineBox, profile: EngineProfile,
  wordBreak: NonNullable<RichInlineOptions['wordBreak']>, language: string | null,
  flags: Uint8Array, widths: number[], segments: string[], breakableFitAdvances: (number[] | null)[],
  sourceStarts: number[], sourceEnds: number[],
): boolean {
  // One object: a box's width, or the width of the item's text on a line of its own, laid out
  // in normal white space, as a chip's box with `white-space: nowrap` collapses its own, plus
  // its extraWidth: all three browsers lay out a pre-wrap paragraph of 15px Helvetica Neue with
  // the 12px chip ` @bob ` 6.6px narrower than the chip's text with its spaces. It is prepared
  // without emergency breaks, as it is only laid out whole.
  let width = 0
  let text = ''
  let textStart = 0
  let textEnd = 0
  if (item.text === undefined) {
    width = item.width
  } else {
    const ownAnalysis = analyzeText(item.text, profile, 'normal', wordBreak, language)
    const own = measureAnalysis(ownAnalysis, 0, ownAnalysis.flags.length, item.font, false, readLetterSpacing(item.letterSpacing, profile), profile, language, false, null)
    const start: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
    if (normalizePreparedLineStart(own, start)) width = stepPreparedLineGeometryFromStart(own, start, Number.POSITIVE_INFINITY)!
    width += item.extraWidth ?? 0
    // The chip's text as a line of it paints it (buildLineTextFromRange).
    for (let i = 0; i < ownAnalysis.texts.length; i++) {
      const kind = own.segmentFlags[i]! & KIND_BITS
      const ownText = ownAnalysis.texts[i]!
      if (kind !== SOFT_HYPHEN && kind !== HARD_BREAK && !((kind === ZERO_WIDTH_GLUE || kind === ZERO_WIDTH_BREAK) && ownText.charCodeAt(0) === 0x00AD)) text += ownText
    }
    while (isCollapsibleSpaceCode(item.text.charCodeAt(textStart))) textStart++
    textEnd = item.text.length
    while (textEnd > textStart && isCollapsibleSpaceCode(item.text.charCodeAt(textEnd - 1))) textEnd--
  }
  flags[widths.length] = OBJECT
  widths.push(width)
  segments.push(text)
  breakableFitAdvances.push(null)
  sourceStarts.push(textStart)
  sourceEnds.push(textEnd)
  return width === 0
}

function singleItem(
  items: Array<RichInlineItem | RichInlineBox>, profile: EngineProfile,
  whiteSpace: NonNullable<RichInlineOptions['whiteSpace']>, wordBreak: NonNullable<RichInlineOptions['wordBreak']>,
  language: string | null,
): InternalPreparedRichInline | null {
  // A paragraph of one styled run that isn't atomic and has no extraWidth is the most common one,
  // and is that run's text: its handle is the one prepareWithSegments() makes, laid out as
  // layout()'s walkers lay it out. So is a paragraph whose other items are empty, which are
  // dropped (below).
  let onlyIndex = -1
  for (let index = 0; index < items.length; index++) {
    if (items[index]!.text === '') continue
    if (onlyIndex >= 0) {
      onlyIndex = -1
      break
    }
    onlyIndex = index
  }
  const only = onlyIndex < 0 ? undefined : items[onlyIndex]!
  if (only !== undefined && only.text !== undefined && only.break !== 'never' && (only.extraWidth ?? 0) === 0) {
    const analysis = analyzeText(only.text, profile, whiteSpace, wordBreak, language)
    const data = measureAnalysis(analysis, 0, analysis.flags.length, only.font, true, readLetterSpacing(only.letterSpacing, profile), profile, language, true, null) as PreparedSegments
    const itemSegments: number[] = []
    for (let index = 0; index <= items.length; index++) itemSegments.push(index <= onlyIndex ? 0 : data.segmentFlags.length)
    return findWholeLine({
      data, onlyItem: onlyIndex, wholeWidth: null, wholeStart: 0, wholeEnd: 0, itemSegments, segmentItems: null, gapSegments: null, plainWidths: false,
      sourceStarts: null, sourceEnds: null, sourceUnits: null, text: only.text,
    } as InternalPreparedRichInline)
  }

  return null
}

function collectItems(items: Array<RichInlineItem | RichInlineBox>, profile: EngineProfile) {
  // The paragraph's text: the items' texts joined, an atomic item or a box as one U+FFFC. An atomic
  // item's own white space is none of the paragraph's: its inline-block lays its text out as a
  // paragraph of its own, whose lines drop white space at their start and end. Blink puts the box in
  // the outer paragraph as one U+FFFC (inline_node.cc:408-422) and removes its own paragraph's
  // leading and trailing spaces (inline_items_builder.cc:869-871, ExitBlock at 1622-1629); WebKit's
  // atomic inline box is one item of the outer line (InlineItemsBuilder.cpp:1073-1074), and its own
  // lines collapse leading white space (Line::appendText, InlineLine.cpp:348-373) and remove
  // trailing (InlineLineBuilder.cpp:646); Gecko's text run stops at the box
  // (BuildTextRunsScanner::ScanFrame, nsTextFrame.cpp:2248-2254), and its own lines skip leading
  // white space (nsTextFrame.cpp:10935-10944) and trim trailing (nsBlockFrame.cpp:5844). So an
  // atomic item of only white space is still an object, as wide as its extraWidth. An item whose
  // text is empty, atomic or not, is dropped, with no fragment and no width: apps empty a run to
  // hide it (RESEARCH.md, Objects Inside A Line).
  let source = ''
  const starts: number[] = []
  const atomic: boolean[] = []
  // Whether an item is an object or has extraWidth, so that a line of it alone isn't its text's.
  let paddedOrObject = false
  // How many text items have extraWidth: each may get one segment more than the analysis gives it,
  // the start edge of its opening (below).
  let padded = 0
  // The letter spacing the text items that aren't atomic share, and whether two of them differ: the
  // walkers take one for the handle, so where items differ, each segment's width holds its own.
  let sharedSpacing: number | null = null
  let spacingsDiffer = false
  // Whether an item may make a line narrower: under a negative letter spacing or extraWidth.
  let mayNarrow = false
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!
    starts.push(source.length)
    if (item.text === undefined) {
      // A width that isn't finite would give lines of width NaN or Infinity, and Chrome breaks lines
      // around a negative one otherwise than a negative extraWidth does (RESEARCH.md, Objects Inside
      // A Line), so Pretext refuses both.
      if (!Number.isFinite(item.width) || item.width < 0) throw new RangeError(`Item ${index} has no text, so it's a box, whose width must be a finite number of CSS px, at least 0, not ${item.width}`)
      atomic.push(true)
      source += '￼'
      paddedOrObject = true
      continue
    }
    const isAtomic = item.break === 'never' && item.text !== ''
    atomic.push(isAtomic)
    if (isAtomic) {
      source += '￼'
    } else {
      source += item.text
      if (item.text !== '') {
        const letterSpacing = readLetterSpacing(item.letterSpacing, profile)
        if (sharedSpacing !== null && sharedSpacing !== letterSpacing) spacingsDiffer = true
        sharedSpacing ??= letterSpacing
        if (letterSpacing < 0) mayNarrow = true
      }
    }
    if (isAtomic || (item.extraWidth ?? 0) !== 0) paddedOrObject = true
    if (!isAtomic && (item.extraWidth ?? 0) !== 0) padded++
    if ((item.extraWidth ?? 0) < 0) mayNarrow = true
  }
  return { source, starts, atomic, paddedOrObject, padded, sharedSpacing, spacingsDiffer, mayNarrow }
}

export function prepareRichInline(items: Array<RichInlineItem | RichInlineBox>, options?: RichInlineOptions): PreparedRichInline {
  const whiteSpace = options?.whiteSpace ?? 'normal'
  const wordBreak = options?.wordBreak ?? 'normal'
  const preserve = whiteSpace === 'pre-wrap'
  // One language read for the paragraph's analysis and every item's measurement.
  const profile = getEngineProfile()
  const language = getPreparationLanguage(profile)
  // Whether a line can end before preserved white space that starts an item: WebKit finds a soft
  // wrap opportunity next to every white-space item (isAtSoftWrapOpportunity,
  // InlineFormattingUtils.cpp:406-418), which is part of how it finds breaks between inline items,
  // so the profile's scan names it.
  const whiteSpaceItemBreaks = profile.lineBreakScan === 'webkit'

  const single = singleItem(items, profile, whiteSpace, wordBreak, language)
  if (single !== null) return single

  const { source, starts, atomic, paddedOrObject, padded, sharedSpacing, spacingsDiffer, mayNarrow } = collectItems(items, profile)
  const paragraph: ParagraphItems = { items, starts, atomic, ownSegmentBreaks: !profile.transformsSegmentBreaksAcrossItems, sourceOffsets: null }
  const analysis = analyzeText(source, profile, whiteSpace, wordBreak, language, paragraph)
  const offsets = paragraph.sourceOffsets!
  const count = analysis.flags.length

  // The paragraph's lists, which each item's measurement adds its segments to (measureAnalysis).
  const widths: number[] = []
  const flags = new Uint8Array(count + padded)
  const breakableFitAdvances: (number[] | null)[] = []
  const lists: ParagraphLists = { widths, segmentFlags: flags, breakableFitAdvances }
  const segments: string[] = []
  const sourceStarts: number[] = []
  const sourceEnds: number[] = []
  let sourceUnits: (number[] | null)[] | null = null
  const itemSegments: number[] = []
  // What only some segments have, each made whole at the first one that does: a zero or a null for
  // every segment the paragraph can have, `flags.length` of them, which is more than it has where
  // a padded item gets no start edge, and the segment's value stored at its index. Chrome 154,
  // Firefox 156 and Safari 27 prepare CJK styled paragraphs again up to 8% faster with the lists
  // made whole than with each filled by a call and a push a segment (RESEARCH.md, Keeping Work
  // Bounded, JavaScript Engines, under A paragraph's sparse lists made whole).
  let breakableLineStartExtras: (number[] | null)[] | null = null
  let lineStartExtras: number[] | null = null
  let lineEndTrims: number[] | null = null
  let overflowLineEndTrims: number[] | null = null
  let itemEndHalts: number[] | null = null
  // A line returns from a soft hyphen whose hyphen doesn't fit on a handle with soft-hyphen
  // contexts, which an item's measurement makes for text with one.
  let discretionaryHyphenContexts: number[] | null = null
  let insideExtras: number[] | null = null
  let fillExtras: number[] | null = null
  let openingEdges: number[] | null = null
  // Each text item's hyphen width, tab stop advance and least tab advance, and whether two items
  // differ in one, in a paragraph whose text has what reads them: a soft hyphen or, preserved, a
  // tab (ParagraphSegmentData). Another paragraph keeps none, and its handle's own are 0.
  const readsItemFonts = source.includes('\u00AD') || (preserve && source.includes('\t'))
  const hyphenWidths: number[] = zeros(readsItemFonts ? items.length : 0)
  const tabStopAdvances: number[] = zeros(readsItemFonts ? items.length : 0)
  const minimumTabAdvances: number[] = zeros(readsItemFonts ? items.length : 0)
  let firstTextItem = -1
  let fontsDiffer = false
  let simple = !analysis.hasUnbroken
  // Whether a segment got no break before it here (below), an item's start edge or white space that
  // goes on from the item before, in a paragraph whose analysis found none, so its other segments
  // aren't marked as breaks to return to.
  let marksReturnable = false
  // Where the item at hand starts among the paragraph's segments.
  let itemStart = 0
  // Whether the paragraph holds an object of width 0.
  let hasEmptyObject = false

  for (let from = 0; from < count;) {
    // The item this segment starts in, and the segments that start in it.
    const offset = offsets[analysis.starts[from]!]!
    let index = itemSegments.length === 0 ? 0 : itemSegments.length - 1
    while (index + 1 < starts.length && starts[index + 1]! <= offset) index++
    while (itemSegments.length <= index) itemSegments.push(widths.length)
    const itemEnd = index + 1 < starts.length ? starts[index + 1]! : source.length
    let to = from + 1
    while (to < count && offsets[analysis.starts[to]!]! < itemEnd) to++
    const item = items[index]!
    const previousItemStart = itemStart
    itemStart = widths.length

    if (item.text === undefined || atomic[index]) {
      if (appendObject(item, profile, wordBreak, language, flags, widths, segments, breakableFitAdvances, sourceStarts, sourceEnds)) {
        // Gecko places an object of width 0 otherwise than the simple walker does (walkPreparedComplexLines).
        simple = false
        hasEmptyObject = true
      }
      from = to
      continue
    }

    const letterSpacing = readLetterSpacing(item.letterSpacing, profile)
    if (to === from + 1 && (analysis.flags[from]! & KIND_BITS) === SPACE && analysis.texts[from] === ' ') {
      // An item of only collapsible white space, as between two styled words: its one space, as
      // measureAnalysis() measures one.
      if (letterSpacing !== 0) simple = false
      flags[widths.length] = SPACE | (analysis.flags[from]! & (UNBROKEN | RETURNABLE)) | (letterSpacing !== 0 ? SPACED : 0)
      widths.push(getSpaceWidth(getFontMeasurement(item.font, language, letterSpacing !== 0)) + (spacingsDiffer ? letterSpacing : 0))
      segments.push(' ')
      breakableFitAdvances.push(null)
      sourceStarts.push(offset - starts[index]!)
      sourceEnds.push(offset + 1 - starts[index]!)
      from = to
      continue
    }
    // Every line the item reaches pays its extraWidth, as its fragment on that line paints it
    // (box-decoration-break: clone). The first of its segments whose width a line counts, after
    // the collapsed space before its text, holds it for a line that comes into the item or starts
    // with it, and a line that starts later in the item pays it there (ParagraphSegmentData). An
    // item that opens with preserved white space, a hard break or a zero-width space, which a line
    // can end with after content that fills it, gets a start edge of its own before them: an empty
    // segment as wide as the extraWidth, which fits by the edges the engine fits where a line takes
    // the item's opening and no more of it (getOpeningFit), and no break comes before it, as none
    // comes before white space, a hard break or a zero-width space in the text (UAX #14 LB6, LB7),
    // but after an object in Blink and Gecko, and before a zero-width space after an object or
    // white space, where the browsers break.
    const extraWidth = item.extraWidth ?? 0
    let first = to
    if (extraWidth !== 0) {
      first = from
      while (first < to && ((analysis.flags[first]! & KIND_BITS) === SOFT_HYPHEN || (first === from && (analysis.flags[from]! & KIND_BITS) === SPACE))) first++
      const firstKind = first < to ? analysis.flags[first]! & KIND_BITS : TEXT
      if (firstKind === PRESERVED_SPACE || firstKind === TAB || firstKind === HARD_BREAK || (firstKind === ZERO_WIDTH_BREAK && first === from)) {
        const at = widths.length
        const afterObject = at > 0 && (flags[at - 1]! & KIND_BITS) === OBJECT
        // Whether the item follows preserved spaces that follow text in their own text item. Blink
        // ends a text item at each character it makes a control item (IsControlItemCharacter,
        // inline_items_builder.cc:177-184; AppendPreserveWhitespace, :1082-1126): a run of preserved
        // tabs (:1098-1110), a line feed, whose forced break the spaces after it follow as a text item
        // of their own (:1084-1097, 1023-1033), and a lone CR or FF (:1119-1125), which the analysis
        // takes as a line feed. So spaces after a tab or a hard break, which is a line feed in the
        // one profile that reads this, follow no text. A ZWNJ, the other such character, starts a
        // text item and is text in it (:1112-1118), as it is here. An item of only spaces after its
        // own start edge follows none either. Blink also ends a text item where a bidi run ends
        // inside it (InlineItem::SetBidiLevel, inline_item.cc:207-236), which no profile resolves:
        // the premise is that the spaces are at the level of the text before them, and its gap is
        // spaces after right-to-left text (ENGINE_FOLLOWUPS.md, Rich-inline item edges).
        const afterTextSpaces = at - 1 > previousItemStart && (flags[at - 1]! & KIND_BITS) === PRESERVED_SPACE && (1 << (flags[at - 2]! & KIND_BITS) & (1 << TAB | 1 << HARD_BREAK)) === 0 &&
          (openingEdges === null || openingEdges[at - 2] === 0)
        const fit = getOpeningFit(analysis.flags, from, to, extraWidth, afterTextSpaces, profile)
        // In WebKit a break comes before white space that starts an item (whiteSpaceItemBreaks), and
        // none before a hard break, after an object too (nextWrapOpportunity,
        // InlineFormattingUtils.cpp:469-475).
        const breaksBefore = at === 0 || (firstKind === ZERO_WIDTH_BREAK ? afterObject || (1 << (flags[at - 1]! & KIND_BITS) & (1 << SPACE | PRESERVED_WHITE_SPACE)) !== 0
          : whiteSpaceItemBreaks ? firstKind !== HARD_BREAK : afterObject)
        // A line that takes the opening paints the whole edge, whatever of it the line fitted
        // (ParagraphSegmentData, openingEdges). An opening no edge of which is fitted takes no room
        // among the white space around it, which hangs past it. Else it is an object, whose line-end
        // trim is what the line doesn't fit: the white space after it stays on its line, as the line
        // keeps the opening it took.
        flags[at] = fit === 0 ? PRESERVED_SPACE : breaksBefore ? OBJECT : OBJECT | UNBROKEN
        widths.push(extraWidth)
        ;(openingEdges ??= zeroList(flags.length))[at] = extraWidth
        if (!breaksBefore && !analysis.hasUnbroken) marksReturnable = true
        // Where the engine ends a line inside the preserved spaces before a padded hard break that
        // doesn't fit (hardBreakItemRetreat), those spaces get an advance each, as text a line can
        // end inside has.
        if (firstKind === HARD_BREAK && !breaksBefore && profile.hardBreakItemRetreat !== 'item' && (flags[at - 1]! & KIND_BITS) === PRESERVED_SPACE && segments[at - 1] !== '') {
          const spaces = segments[at - 1]!.length
          const advances: number[] = []
          for (let g = 0; g < spaces; g++) advances.push(widths[at - 1]! / spaces)
          breakableFitAdvances[at - 1] = advances
        }
        // The simple walkers take every boundary for a break and a line-end trim out of the line's width.
        simple = false
        segments.push('')
        breakableFitAdvances.push(null)
        // The edge comes before the item's segments, so before the space or soft hyphens that lead them.
        sourceStarts.push(offset - starts[index]!)
        sourceEnds.push(offset - starts[index]!)
        if (fit !== 0 && fit !== extraWidth) (lineEndTrims ??= zeroList(flags.length))[at] = extraWidth - fit
        first = from - 1
      }
    }
    // An item that is one segment holding all of its text, as a styled word, is measured by the
    // item's own string, not the equal slice of the paragraph's text: a font's widths are kept by
    // text, and a string the caller hands in again keeps its hash, where the slice is hashed anew
    // at every preparation.
    if (to === from + 1 && analysis.texts[from] === item.text) analysis.texts[from] = item.text
    // The item's segments, measured in its font onto the end of the paragraph's lists; `sub` holds
    // what else measurement gives them, from the item's first segment.
    const itemAt = widths.length
    const sub = measureAnalysis(analysis, from, to, item.font, false, letterSpacing, profile, language, true, lists)
    simple &&= sub.simpleLineCountFastPath
    if (readsItemFonts) {
      // The gap before the hyphen is the letter spacing after the grapheme before it.
      hyphenWidths[index] = spacingsDiffer ? sub.discretionaryHyphenWidth - letterSpacing : sub.discretionaryHyphenWidth
      tabStopAdvances[index] = sub.tabStopAdvance
      minimumTabAdvances[index] = sub.minimumTabAdvance
      if (firstTextItem < 0) firstTextItem = index
      else if (hyphenWidths[index] !== hyphenWidths[firstTextItem] || tabStopAdvances[index] !== tabStopAdvances[firstTextItem] || minimumTabAdvances[index] !== minimumTabAdvances[firstTextItem]) fontsDiffer = true
    }
    for (let i = from; i < to; i++) {
      const s = i - from
      const at = itemAt + s
      const spaced = spacingsDiffer && (flags[at]! & SPACED) !== 0
      const holdsExtra = i === first
      if (spaced || holdsExtra) {
        let advances = breakableFitAdvances[at] ?? null
        if (advances !== null) {
          // The cached advances are shared by every occurrence of this text.
          advances = breakableFitAdvances[at] = advances.slice()
          if (spaced) for (let g = 0; g < advances.length; g++) advances[g] = advances[g]! + letterSpacing
          if (holdsExtra) advances[0] = advances[0]! + extraWidth
        }
        if (spaced) widths[at] = widths[at]! + letterSpacing
        if (holdsExtra) widths[at] = widths[at]! + extraWidth
      }
      // No break comes before white space (UAX #14 LB7), so none inside a run of preserved spaces
      // and tabs that goes on from the item before, but in WebKit (whiteSpaceItemBreaks).
      if (s === 0 && at > 0 && !whiteSpaceItemBreaks && (1 << (flags[at]! & KIND_BITS) & PRESERVED_WHITE_SPACE) !== 0 && (1 << (flags[at - 1]! & KIND_BITS) & PRESERVED_WHITE_SPACE) !== 0) {
        flags[at] = flags[at]! | UNBROKEN
        if (!analysis.hasUnbroken) marksReturnable = true
      }
      const normalizedStart = analysis.starts[i]!
      const normalizedEnd = i + 1 < count ? analysis.starts[i + 1]! : analysis.normalized.length
      const sourceEnd = offsets[normalizedEnd - 1]! + 1
      // Where the segment's text ends in the normalized text.
      let textEnd = normalizedEnd
      sourceStarts.push(offsets[normalizedStart]! - starts[index]!)
      if (sourceEnd > itemEnd) {
        // The Gecko analysis keeps the soft hyphens and bidi controls Firefox's text run drops with
        // the segment before them, across items: the segment's text here is its own item's part, and
        // the rest, which paints nothing, is in no fragment.
        while (offsets[textEnd - 1]! >= itemEnd) textEnd--
        segments.push(analysis.normalized.slice(normalizedStart, textEnd))
        sourceEnds.push(itemEnd - starts[index]!)
      } else {
        segments.push(analysis.texts[i]!)
        // CRLF is one line feed, which ends with the item where the next item holds the line feed.
        sourceEnds.push((preserve && sourceEnd < itemEnd && source.charCodeAt(sourceEnd - 1) === 0x0D && source.charCodeAt(sourceEnd) === 0x0A ? sourceEnd + 1 : sourceEnd) - starts[index]!)
      }
      const units = getSourceUnits(offsets, normalizedStart, textEnd, starts[index]!)
      if (units !== null) (sourceUnits ??= new Array<number[] | null>(flags.length).fill(null))[at] = units
      if (sub.breakableLineStartExtras !== null && sub.breakableLineStartExtras[s] !== null) (breakableLineStartExtras ??= new Array<number[] | null>(flags.length).fill(null))[at] = sub.breakableLineStartExtras[s]!
      const startExtra = (sub.lineStartExtras === null ? 0 : sub.lineStartExtras[s]!) + (i > first ? extraWidth : 0)
      if (startExtra !== 0) (lineStartExtras ??= zeroList(flags.length))[at] = startExtra
      if (sub.lineEndTrims !== null) {
        const endTrim = sub.lineEndTrims[s]!
        if (endTrim !== 0) (lineEndTrims ??= zeroList(flags.length))[at] = endTrim
        // A closing mark that ends its item, halted at a line's end, stays halted where the line
        // goes on. Blink breaks an item's text that doesn't fit its line, and where the text fits
        // with its last mark halted, which it tries where a break comes right after the mark, that
        // is the item's result, and the line takes what follows after it
        // (ShapingLineBreaker::ShapeLine, shaping_line_breaker.cc:342-363; LineBreaker::BreakText,
        // line_breaker.cc:1736-1758): in 16px Hiragino Sans, Chrome 154 lays out `文字」` and a span
        // `i` as one 43.81px line at 44-47px. A run of U+3000 that ends the item has a line-end
        // trim too, its hang, which is no halt. An item with extraWidth keeps the halt at a line's
        // end only. Blink fits its text before its end edge: where the text fits there the mark
        // stays whole though the edge overflows, so Chrome leaves the mark of a span `文字」` with
        // 4px of padding on each side whole at 52-55px and wraps the `i` after it, and where it
        // doesn't the mark is halted and the line goes on, as at 51.81-51.94px, where the `i`
        // fits after it. The extraWidth doesn't split the end edge off, so the line can't tell
        // the two and takes the first for both. Its gap is what follows such a mark and is
        // narrower than the halt less that edge, which wraps where Chrome keeps it
        // (ENGINE_FOLLOWUPS.md, Rich-inline item edges). The walkers that take every boundary for
        // a break end the line after a trimmed segment, so the paragraph isn't theirs.
        if (endTrim !== 0 && i === to - 1 && to < count && extraWidth === 0 && !analysis.texts[i]!.endsWith('\u3000')) {
          ;(itemEndHalts ??= zeroList(flags.length))[at] = endTrim
          simple = false
        }
      }
      if (sub.overflowLineEndTrims !== null) {
        const retryTrim = sub.overflowLineEndTrims[s]!
        if (retryTrim !== 0) (overflowLineEndTrims ??= zeroList(flags.length))[at] = retryTrim
        // Where no break comes after the mark, as before a period or a no-break space that starts
        // the next item, Blink halts it only on a line it lays out again with a break after every
        // grapheme (HandleOverflow, line_breaker.cc:4259-4264), and there too the halted text is the
        // item's result and the line goes on: Chrome 154 lays out `文字」`, a span `.` and `字` as
        // `文` / `字」.` / `字` at 28.5-31.75px, where their text in one node ends the second line
        // after the mark.
        if (retryTrim !== 0 && i === to - 1 && to < count && extraWidth === 0) {
          ;(itemEndHalts ??= zeroList(flags.length))[at] = retryTrim
          simple = false
        }
      }
      if (sub.discretionaryHyphenContexts !== null) (discretionaryHyphenContexts ??= zeroList(flags.length))[at] = sub.discretionaryHyphenContexts[s]!
      if (i >= first && first < to) (insideExtras ??= zeroList(flags.length))[at] = extraWidth
      if (i > first && first < to) (fillExtras ??= zeroList(flags.length))[at] = extraWidth
    }
    from = to
  }
  const segmentCount = widths.length
  while (itemSegments.length <= items.length) itemSegments.push(segmentCount)
  const segmentFlags = segmentCount === flags.length ? flags : flags.subarray(0, segmentCount)
  // A paragraph whose lines return from an unfit hyphen marks every break the scan gives before
  // text, so its walk records each as the line's latest break (pendingBreakSegmentIndex in
  // walkPreparedComplexLines). The return itself reads no mark, as a text's doesn't; what the marks
  // still decide is where the Gecko profile ends a line that an object of width 0 sticks out of
  // (ENGINE_FOLLOWUPS.md, Rich-inline item edges).
  if (marksReturnable || (discretionaryHyphenContexts !== null && !analysis.hasUnbroken)) for (let i = 0; i < segmentCount; i++) if ((segmentFlags[i]! & UNBROKEN) === 0) segmentFlags[i] = segmentFlags[i]! | RETURNABLE

  const segmentItems = new Int32Array(segmentCount)
  const gapSegments = new Uint8Array(segmentCount)
  for (let index = 0; index < items.length; index++) {
    const firstSegment = itemSegments[index]!
    const end = itemSegments[index + 1]!
    for (let i = firstSegment; i < end; i++) {
      segmentItems[i] = index
      if ((i === firstSegment || i === end - 1) && (segmentFlags[i]! & KIND_BITS) === SPACE && segments[i]!.length === 1) gapSegments[i] = 1
    }
  }

  let segmentHyphenWidths: number[] | null = null
  let segmentTabStopAdvances: number[] | null = null
  let segmentMinimumTabAdvances: number[] | null = null
  if (fontsDiffer) {
    segmentHyphenWidths = []
    segmentTabStopAdvances = []
    segmentMinimumTabAdvances = []
    for (let i = 0; i < segmentCount; i++) {
      const index = segmentItems[i]!
      segmentHyphenWidths.push(hyphenWidths[index]!)
      segmentTabStopAdvances.push(tabStopAdvances[index]!)
      segmentMinimumTabAdvances.push(minimumTabAdvances[index]!)
    }
  }
  const segmentData: ParagraphSegmentData = {
    hyphenWidths: segmentHyphenWidths, tabStopAdvances: segmentTabStopAdvances, minimumTabAdvances: segmentMinimumTabAdvances,
    itemEndHalts,
    hyphenRooms: discretionaryHyphenContexts !== null && profile.unfitHyphenRetreat === 'reduced-width' ? getHyphenRooms(hyphenWidths, itemSegments, segmentItems) : null,
    insideExtras, fillExtras, openingEdges,
    emptyObjectSpaces: null, emptyObjectReturns: null,
  }
  // The properties measureAnalysis() gives a text's handle, in its order, then the paragraph's own.
  const data = {
    widths,
    segmentFlags,
    simpleLineWalkFastPath: simple,
    simpleLineCountFastPath: false,
    breakableFitAdvances,
    letterSpacing: spacingsDiffer || sharedSpacing === null ? 0 : sharedSpacing,
    discretionaryHyphenWidth: firstTextItem < 0 ? 0 : hyphenWidths[firstTextItem]!,
    discretionaryHyphenContexts,
    breakableLineStartExtras,
    lineStartExtras,
    lineEndTrims,
    overflowLineEndTrims,
    tabStopAdvance: firstTextItem < 0 ? 0 : tabStopAdvances[firstTextItem]!,
    minimumTabAdvance: firstTextItem < 0 ? 0 : minimumTabAdvances[firstTextItem]!,
    items: segmentData,
  } satisfies PreparedLineData as PreparedSegments
  data.segments = segments
  if (hasEmptyObject && profile.emptyAtomicAlwaysFits) setEmptyObjectFacts(segmentData, data, items, itemSegments, segmentItems, source, starts)

  let onlyItem = -1
  for (let index = 0; index < items.length && !paddedOrObject; index++) {
    if (itemSegments[index] === itemSegments[index + 1]) continue
    if (onlyItem >= 0) {
      onlyItem = -1
      break
    }
    onlyItem = index
  }
  const flow = {
    data, onlyItem, wholeWidth: null, wholeStart: 0, wholeEnd: 0, itemSegments, segmentItems, gapSegments,
    plainWidths: data.letterSpacing === 0 && itemEndHalts === null && !(preserve && source.includes('\t')),
    sourceStarts, sourceEnds, sourceUnits, text: '',
  } as InternalPreparedRichInline
  return mayNarrow && onlyItem < 0 && narrowsLine(data, itemSegments) ? flow : findWholeLine(flow)
}

// Per segment, the room a line that ends at the break before it leaves for a hyphen, where the line
// returns there from a soft hyphen whose hyphen doesn't fit, with a last entry for the break at the
// paragraph's end. Blink breaks a text item again against the width less the item's own hyphen
// where the hyphen of the soft hyphen it ends at overflows (LineBreaker::BreakText,
// line_breaker.cc:1705-1719), so a break inside the item that holds the soft hyphen leaves room
// for that item's hyphen. Where none in the item does, the line goes back over the items before it
// to the latest break that fits, with no room (HandleOverflow, :4105-4112), so the break before an
// item's first segment leaves none. The premise is that a break inside an item is returned to from
// a soft hyphen of that item: for one inside an earlier item Blink asks only that the line fit
// (:4138-4158), and this leaves room for that item's hyphen (ENGINE_FOLLOWUPS.md, Rich-inline item
// edges).
// Finds the paragraph's line where nothing wraps it, which is taken without a walk at any width it
// fits: most paragraphs of a chat are one line. That is a premise. Blink, Gecko and WebKit each fit
// a line at prefixes of it, after each item, at each break opportunity and frame end, and after each
// run between two wrap opportunities (line_breaker.cc:1009-1147; gfxTextRun.cpp:1085-1109;
// InlineLineBuilder.cpp:538-604), and none lets text make a line narrower (ClampNegativeToZero,
// line_breaker.cc:1703; nsTextFrame.cpp:11272-11273; InlineLine.cpp:440), so where no item makes
// the line narrower its width only grows from item to item and the walkers take the same line. A
// paragraph with such an item, one of no advance under negative letter spacing or one with a
// negative extraWidth, has no such line and is walked (narrowsLine). Inside an item the premise's
// gap is left: under negative letter spacing a line can overflow at a break and come back under
// the line's width after it, where the text walkers end the line at the break and the paragraph
// takes it whole, so a paragraph of one item can take fewer lines than layoutWithLines() gives its
// text. Blink takes a text item whole where its shaped width fits (ShapingLineBreaker::ShapeLine,
// shaping_line_breaker.cc:281-297), which is that line; ENGINE_FOLLOWUPS.md, Negative letter
// spacing and hanging spaces, has the counts. The walk hands walkPreparedLinesRaw() a visitor of
// its own, which costs later walks of one-item CJK paragraphs 4-6% in Firefox 156 and a stream
// over a page of mostly such paragraphs 8% in Safari 27; the line stepped with no visitor was
// measured and left out (RESEARCH.md, Decisions Log, 2026-10-09, a loop of its own for the count
// of lines).
function findWholeLine(flow: InternalPreparedRichInline): InternalPreparedRichInline {
  const lineCount = walkPreparedLinesRaw(flow.data, Number.POSITIVE_INFINITY, (width, startSegmentIndex, _startGraphemeIndex, endSegmentIndex) => {
    flow.wholeWidth = width
    flow.wholeStart = startSegmentIndex
    flow.wholeEnd = endSegmentIndex
  })
  if (lineCount !== 1) flow.wholeWidth = null
  return flow
}

// Whether an item of the paragraph takes less than no room on a line: its segments' widths, with
// the letter spacing after each one that takes it, add up to less than 0.
function narrowsLine(data: PreparedSegments, itemSegments: number[]): boolean {
  const { widths, segmentFlags, letterSpacing } = data
  for (let index = 0; index + 1 < itemSegments.length; index++) {
    let width = 0
    for (let i = itemSegments[index]!; i < itemSegments[index + 1]!; i++) width += widths[i]! + ((segmentFlags[i]! & SPACED) !== 0 ? letterSpacing : 0)
    if (width < 0) return true
  }
  return false
}

// Whether the paragraph's whole line fits `maxWidth`, as the walkers fit a line. The line functions
// hand it their width clamped at 0, as the walkers clamp the one they are handed. The line's width
// here is signed, and under 0 where letter spacing is more negative than the letters are wide:
// fitted against a width under 0 as given, such a paragraph would be one line down to its own
// width and walked under it, where the walkers can end a line that the whole fit takes
// (findWholeLine; RESEARCH.md, Decisions Log, 2026-10-09, rich inline's width).
function fitsWhole(flow: InternalPreparedRichInline, maxWidth: number): boolean {
  return flow.wholeWidth !== null && flow.wholeWidth <= maxWidth + getEngineProfile().lineFitEpsilon
}

// `count` zeros, where a paragraph's list of numbers starts: a copy of one list of zeros, which
// grows to the longest asked for, up to 1024; a longer list is pushed. A copy is one allocation,
// where zeros pushed one at a time regrow the list as it fills: a list of 127 costs 18 ns copied
// and 141 pushed in V8's shell, 44 and 293 in SpiderMonkey's, 59 and 204 in JavaScriptCore's.
const ZEROS: number[] = []
function zeroList(count: number): number[] {
  if (count > 1024) return zeros(count)
  while (ZEROS.length < count) ZEROS.push(0)
  return ZEROS.slice(0, count)
}

// How much of a padded item's extraWidth a line fits where it takes the item's opening, the
// white space, hard break or zero-width space that starts it, and no more of it; a line that goes
// on into the item fits all of it. Blink adds a span's start edge to the line when it opens
// (HandleOpenTag, line_breaker.cc:3957-3976), and only a test-only flag narrows the line for its
// cloned end edge (BoxDecorationBreakCloneLineBreaking, :454-461), so it fits half: the extraWidth
// isn't split by side (ENGINE_FOLLOWUPS.md). The items a line takes after the break it returns to
// stay on it where they are all trailable, white space with the tags of spans that open and close
// among it (RewindOverflow, :4332-4424), so Blink fits no edge of a span of only white space. Nor
// does it after preserved spaces that follow text in one item, which its return breaks before
// (HandleOverflow, :4163-4185, at the run's start that ShapingLineBreaker::ShapeLine breaks at,
// shaping_line_breaker.cc:490-495): the line then trails them, taking the open tag and white
// space or a forced break after them with no fit (HandleTrailingSpaces, :2426-2534). WebKit fits
// a box that opens in the content it places without its cloned end edge
// (placedClonedDecorationWidth, InlineLineBuilder.cpp:1501-1523), where a hard break or white
// space starts it, after the white space before it, which the line counts (the walker's line
// width holds it), but that content runs on past the inline box ends after a line break or white
// space (nextWrapOpportunity, InlineFormattingUtils.cpp:470-475, 530-538), so it fits the end
// edge too of an item of white space that ends there. Gecko fits a frame's whole width, its
// cloned end edge too (CanPlaceFrame, nsLineLayout.cpp:1217-1270).
function getOpeningFit(flags: number[], from: number, to: number, extraWidth: number, afterTextSpaces: boolean, profile: EngineProfile): number {
  const fit = profile.paddedOpeningFit
  const firstKind = flags[from]! & KIND_BITS
  const opensWithWhiteSpace = firstKind === PRESERVED_SPACE || (firstKind === TAB && profile.hangTabs)
  const opensWithBreak = firstKind === HARD_BREAK || firstKind === ZERO_WIDTH_BREAK
  let whiteSpaceEnd = from
  while (whiteSpaceEnd < to && ((flags[whiteSpaceEnd]! & KIND_BITS) === PRESERVED_SPACE || (flags[whiteSpaceEnd]! & KIND_BITS) === TAB)) whiteSpaceEnd++
  if (fit === 'start' && (opensWithWhiteSpace || opensWithBreak)) return afterTextSpaces || whiteSpaceEnd === to ? 0 : extraWidth / 2
  if (fit === 'placed' && (opensWithWhiteSpace || opensWithBreak)) {
    const onlyOpening = whiteSpaceEnd === to || (whiteSpaceEnd === to - 1 && (flags[whiteSpaceEnd]! & KIND_BITS) === HARD_BREAK)
    return onlyOpening ? extraWidth : extraWidth / 2
  }
  return extraWidth
}

// The paragraph's segment a cursor names, or the segment count for one past the last item.
function getSegmentIndex(flow: InternalPreparedRichInline, cursor: RichInlineCursor): number {
  const { itemSegments } = flow
  return cursor.itemIndex < itemSegments.length ? itemSegments[cursor.itemIndex]! + cursor.segmentIndex : flow.data.widths.length
}

export function layoutNextRichInlineLineRange(
  prepared: PreparedRichInline,
  maxWidth: number,
  start: RichInlineCursor = RICH_INLINE_START_CURSOR,
): RichInlineLineRange | null {
  const flow = getInternalPreparedRichInline(prepared)
  const safeWidth = Math.max(0, maxWidth)
  if (start.itemIndex === 0 && start.segmentIndex === 0 && start.graphemeIndex === 0 && fitsWhole(flow, safeWidth)) {
    return flow.onlyItem >= 0 ? createOnlyItemLine(flow, flow.wholeWidth!, flow.wholeStart, 0, flow.wholeEnd, 0) : createLine(flow, flow.wholeWidth!, flow.wholeStart, 0, flow.wholeEnd, 0)
  }
  const lineEnd: LayoutCursor = { segmentIndex: getSegmentIndex(flow, start), graphemeIndex: start.graphemeIndex }
  if (!normalizePreparedLineStart(flow.data, lineEnd)) return null
  const startSegmentIndex = lineEnd.segmentIndex
  const startGraphemeIndex = lineEnd.graphemeIndex
  const width = stepPreparedLineGeometryFromStart(flow.data, lineEnd, safeWidth)
  if (width === null) return null
  return flow.onlyItem >= 0 ? createOnlyItemLine(flow, width, startSegmentIndex, startGraphemeIndex, lineEnd.segmentIndex, lineEnd.graphemeIndex)
    : createLine(flow, width, startSegmentIndex, startGraphemeIndex, lineEnd.segmentIndex, lineEnd.graphemeIndex)
}

// Bridge from cheap range walking to full fragment text. Lets callers do
// shrinkwrap/virtualization/probing work first, then only pay for text on the
// lines they actually render.
export function materializeRichInlineLineRange(
  prepared: PreparedRichInline,
  line: RichInlineLineRange,
): RichInlineLine {
  const flow = getInternalPreparedRichInline(prepared)
  const { data, itemSegments } = flow
  let { sourceStarts, sourceEnds, sourceUnits } = flow
  if (sourceStarts === null) ({ sourceStarts, sourceEnds, sourceUnits } = textSources.get(flow) ?? findSegmentSources(flow))
  const lineEndSegmentIndex = getSegmentIndex(flow, line.end)
  const fragments: InternalRichInlineFragment[] = []

  for (let i = 0; i < line.fragments.length; i++) {
    const fragment = line.fragments[i]!
    const first = itemSegments[fragment.itemIndex]
    if (first === undefined || fragment.itemIndex + 1 >= itemSegments.length) throw new Error('Missing rich-text inline item for fragment')
    // A range kept from a longer paragraph can end past its item in this one: its text stops at the item's end.
    const itemEnd = itemSegments[fragment.itemIndex + 1]!
    const startSegmentIndex = Math.min(first + fragment.start.segmentIndex, itemEnd)
    const startGraphemeIndex = fragment.start.graphemeIndex
    const endSegmentIndex = Math.min(first + fragment.end.segmentIndex, itemEnd)
    const endGraphemeIndex = endSegmentIndex < itemEnd ? fragment.end.graphemeIndex : 0
    // Only the fragment a line ends with shows the hyphen of a soft hyphen it ends at.
    const endsLine = i === line.fragments.length - 1 && endSegmentIndex === lineEndSegmentIndex && endGraphemeIndex === line.end.graphemeIndex
    let sourceStart = startSegmentIndex < itemEnd ? sourceStarts[startSegmentIndex]! : startSegmentIndex > first ? sourceEnds![startSegmentIndex - 1]! : 0
    if (startGraphemeIndex > 0 && startSegmentIndex < itemEnd) sourceStart = getSourceOffset(sourceStarts, sourceUnits, startSegmentIndex, getGraphemeEnds(data, startSegmentIndex)[startGraphemeIndex - 1]!)
    let sourceEnd = sourceStart
    if (endGraphemeIndex > 0) sourceEnd = getSourceOffset(sourceStarts, sourceUnits, endSegmentIndex, getGraphemeEnds(data, endSegmentIndex)[endGraphemeIndex - 1]! - 1) + 1
    else if (endSegmentIndex > startSegmentIndex) sourceEnd = sourceEnds![endSegmentIndex - 1]!
    fragments.push({
      itemIndex: fragment.itemIndex,
      text: endsLine ? buildLineTextFromRange(data, startSegmentIndex, startGraphemeIndex, endSegmentIndex, endGraphemeIndex)
        : buildRangeText(data, startSegmentIndex, startGraphemeIndex, endSegmentIndex, endGraphemeIndex),
      gapBefore: fragment.gapBefore,
      gapItemIndex: fragment.gapItemIndex,
      occupiedWidth: fragment.occupiedWidth,
      start: fragment.start,
      end: fragment.end,
      sourceStart,
      sourceEnd,
    })
  }

  return {
    fragments,
    width: line.width,
    end: line.end,
  }
}

export function walkRichInlineLineRanges(
  prepared: PreparedRichInline,
  maxWidth: number,
  onLine: (line: RichInlineLineRange) => void,
): number {
  const flow = getInternalPreparedRichInline(prepared)
  const safeWidth = Math.max(0, normalizeMaxWidth(maxWidth))
  if (fitsWhole(flow, safeWidth)) {
    onLine(flow.onlyItem >= 0 ? createOnlyItemLine(flow, flow.wholeWidth!, flow.wholeStart, 0, flow.wholeEnd, 0) : createLine(flow, flow.wholeWidth!, flow.wholeStart, 0, flow.wholeEnd, 0))
    return 1
  }
  return walkPreparedLinesRaw(flow.data, safeWidth, (width, startSegmentIndex, startGraphemeIndex, endSegmentIndex, endGraphemeIndex) => {
    onLine(flow.onlyItem >= 0 ? createOnlyItemLine(flow, width, startSegmentIndex, startGraphemeIndex, endSegmentIndex, endGraphemeIndex)
      : createLine(flow, width, startSegmentIndex, startGraphemeIndex, endSegmentIndex, endGraphemeIndex))
  })
}

export function measureRichInlineStats(
  prepared: PreparedRichInline,
  maxWidth: number,
): RichInlineStats {
  const flow = getInternalPreparedRichInline(prepared)
  const safeWidth = Math.max(0, normalizeMaxWidth(maxWidth))
  if (fitsWhole(flow, safeWidth)) return { lineCount: 1, maxLineWidth: Math.max(0, flow.wholeWidth!) }
  const stats = { lineCount: 0, maxLineWidth: 0 }
  walkPreparedLinesRaw(flow.data, safeWidth, undefined, stats)
  return stats
}
