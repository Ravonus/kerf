import { prepareSegments, type SegmentPreparation } from './rich-inline/preparation.js'
import { textSources, findSegmentSources, getSourceOffset } from './rich-inline/sources.js'
import { createLine, createOnlyItemLine } from './rich-inline/lines.js'
import { getHyphenRooms, setEmptyObjectFacts } from './rich-inline/objects.js'
import type { LayoutCursor } from './layout.js'
import {
  analyzeText,
  KIND_BITS,
  RETURNABLE,
  SPACE,
  SPACED,
  UNBROKEN,
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
import { getEngineProfile, getPreparationLanguage, readLetterSpacing, zeros, type EngineProfile } from './measurement.js'
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

import type { RichInlineItem, RichInlineBox, RichInlineOptions, PreparedRichInline, RichInlineCursor, RichInlineLine, RichInlineLineRange, RichInlineStats, InternalRichInlineFragment, InternalPreparedRichInline } from './rich-inline-types.js'
export type { RichInlineItem, RichInlineBox, RichInlineOptions, PreparedRichInline, RichInlineCursor, RichInlineFragment, RichInlineFragmentRange, RichInlineLine, RichInlineLineRange, RichInlineStats } from './rich-inline-types.js'

const RICH_INLINE_START_CURSOR: RichInlineCursor = {
  itemIndex: 0,
  segmentIndex: 0,
  graphemeIndex: 0,
}

function getInternalPreparedRichInline(prepared: PreparedRichInline): InternalPreparedRichInline {
  return prepared as InternalPreparedRichInline
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

function indexSegments(
  items: Array<RichInlineItem | RichInlineBox>, widths: number[], flags: Uint8Array,
  itemSegments: number[], segments: string[], marksReturnable: boolean,
  discretionaryHyphenContexts: number[] | null, hasUnbroken: boolean, fontsDiffer: boolean,
  hyphenWidths: number[], tabStopAdvances: number[], minimumTabAdvances: number[],
) {
  const segmentCount = widths.length
  while (itemSegments.length <= items.length) itemSegments.push(segmentCount)
  const segmentFlags = segmentCount === flags.length ? flags : flags.subarray(0, segmentCount)
  // A paragraph whose lines return from an unfit hyphen marks every break the scan gives before
  // text, so its walk records each as the line's latest break (pendingBreakSegmentIndex in
  // walkPreparedComplexLines). The return itself reads no mark, as a text's doesn't; what the marks
  // still decide is where the Gecko profile ends a line that an object of width 0 sticks out of
  // (ENGINE_FOLLOWUPS.md, Rich-inline item edges).
  if (marksReturnable || (discretionaryHyphenContexts !== null && !hasUnbroken)) for (let i = 0; i < segmentCount; i++) if ((segmentFlags[i]! & UNBROKEN) === 0) segmentFlags[i] = segmentFlags[i]! | RETURNABLE

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
  return { segmentFlags, segmentItems, gapSegments, segmentHyphenWidths, segmentTabStopAdvances, segmentMinimumTabAdvances }
}

function finishRichInline(
  state: SegmentPreparation, sharedSpacing: number | null, paddedOrObject: boolean, mayNarrow: boolean,
): PreparedRichInline {
  const {
    items, widths, flags, itemSegments, segments, marksReturnable, discretionaryHyphenContexts,
    analysis, fontsDiffer, hyphenWidths, tabStopAdvances, minimumTabAdvances, itemEndHalts,
    profile, insideExtras, fillExtras, openingEdges, simple, breakableFitAdvances, spacingsDiffer,
    firstTextItem, breakableLineStartExtras, lineStartExtras, lineEndTrims, overflowLineEndTrims,
    hasEmptyObject, source, starts, preserve, sourceStarts, sourceEnds, sourceUnits,
  } = state
  const { segmentFlags, segmentItems, gapSegments, segmentHyphenWidths, segmentTabStopAdvances, segmentMinimumTabAdvances } =
    indexSegments(items, widths, flags, itemSegments, segments, marksReturnable, discretionaryHyphenContexts,
      analysis.hasUnbroken, fontsDiffer, hyphenWidths, tabStopAdvances, minimumTabAdvances)
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

  const state: SegmentPreparation = {
    count, offsets, analysis, itemSegments, starts, widths, source, items, itemStart, atomic,
    profile, wordBreak, language, flags, segments, breakableFitAdvances, sourceStarts, sourceEnds,
    simple, hasEmptyObject, spacingsDiffer, openingEdges, whiteSpaceItemBreaks, marksReturnable,
    lineEndTrims, lists, readsItemFonts, hyphenWidths, tabStopAdvances, minimumTabAdvances,
    firstTextItem, fontsDiffer, preserve, sourceUnits, breakableLineStartExtras, lineStartExtras,
    itemEndHalts, overflowLineEndTrims, discretionaryHyphenContexts, insideExtras, fillExtras,
  }
  prepareSegments(state)
  return finishRichInline(state, sharedSpacing, paddedOrObject, mayNarrow)
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
