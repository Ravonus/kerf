// Rich-inline item preparation moved from @chenglou/pretext 1.0.0.
import { analyzeText, isCollapsibleSpaceCode, HARD_BREAK, KIND_BITS, OBJECT, PRESERVED_SPACE, RETURNABLE, SOFT_HYPHEN, SPACE, SPACED, TAB, TEXT, UNBROKEN, ZERO_WIDTH_BREAK, ZERO_WIDTH_GLUE, type TextAnalysis, type WordBreakMode } from '../analysis.js'
import type { LayoutCursor } from '../layout.js'
import { normalizePreparedLineStart, stepPreparedLineGeometryFromStart } from '../line-break.js'
import { getFontMeasurement, getSpaceWidth, readLetterSpacing, zeros, type EngineProfile } from '../measurement.js'
import { measureAnalysis, type ParagraphLists } from '../prepare.js'
import type { RichInlineItem, RichInlineBox, RichInlineOptions } from '../rich-inline-types.js'
import { getSourceUnits } from './sources.js'

const PRESERVED_WHITE_SPACE = 1 << PRESERVED_SPACE | 1 << TAB

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

export type SegmentPreparation = {
  count: number
  offsets: Int32Array
  analysis: TextAnalysis
  itemSegments: number[]
  starts: number[]
  widths: number[]
  source: string
  items: (RichInlineItem | RichInlineBox)[]
  itemStart: number
  atomic: boolean[]
  profile: EngineProfile
  wordBreak: WordBreakMode
  language: string | null
  flags: Uint8Array
  segments: string[]
  breakableFitAdvances: (number[] | null)[]
  sourceStarts: number[]
  sourceEnds: number[]
  simple: boolean
  hasEmptyObject: boolean
  spacingsDiffer: boolean
  openingEdges: number[] | null
  whiteSpaceItemBreaks: boolean
  marksReturnable: boolean
  lineEndTrims: number[] | null
  lists: ParagraphLists
  readsItemFonts: boolean
  hyphenWidths: number[]
  tabStopAdvances: number[]
  minimumTabAdvances: number[]
  firstTextItem: number
  fontsDiffer: boolean
  preserve: boolean
  sourceUnits: (number[] | null)[] | null
  breakableLineStartExtras: (number[] | null)[] | null
  lineStartExtras: number[] | null
  itemEndHalts: number[] | null
  overflowLineEndTrims: number[] | null
  discretionaryHyphenContexts: number[] | null
  insideExtras: number[] | null
  fillExtras: number[] | null
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
function prepareOpening(
  state: SegmentPreparation, from: number, to: number, extraWidth: number,
  previousItemStart: number, offset: number, index: number,
): number {
  let first = to
  if (extraWidth !== 0) {
    first = from
    while (first < to && ((state.analysis.flags[first]! & KIND_BITS) === SOFT_HYPHEN || (first === from && (state.analysis.flags[from]! & KIND_BITS) === SPACE))) first++
    const firstKind = first < to ? state.analysis.flags[first]! & KIND_BITS : TEXT
    if (firstKind === PRESERVED_SPACE || firstKind === TAB || firstKind === HARD_BREAK || (firstKind === ZERO_WIDTH_BREAK && first === from)) {
      const at = state.widths.length
      const afterObject = at > 0 && (state.flags[at - 1]! & KIND_BITS) === OBJECT
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
      const afterTextSpaces = at - 1 > previousItemStart && (state.flags[at - 1]! & KIND_BITS) === PRESERVED_SPACE && (1 << (state.flags[at - 2]! & KIND_BITS) & (1 << TAB | 1 << HARD_BREAK)) === 0 &&
        (state.openingEdges === null || state.openingEdges[at - 2] === 0)
      const fit = getOpeningFit(state.analysis.flags, from, to, extraWidth, afterTextSpaces, state.profile)
      // In WebKit a break comes before white space that starts an item (whiteSpaceItemBreaks), and
      // none before a hard break, after an object too (nextWrapOpportunity,
      // InlineFormattingUtils.cpp:469-475).
      const breaksBefore = at === 0 || (firstKind === ZERO_WIDTH_BREAK ? afterObject || (1 << (state.flags[at - 1]! & KIND_BITS) & (1 << SPACE | PRESERVED_WHITE_SPACE)) !== 0
        : state.whiteSpaceItemBreaks ? firstKind !== HARD_BREAK : afterObject)
      // A line that takes the opening paints the whole edge, whatever of it the line fitted
      // (ParagraphSegmentData, openingEdges). An opening no edge of which is fitted takes no room
      // among the white space around it, which hangs past it. Else it is an object, whose line-end
      // trim is what the line doesn't fit: the white space after it stays on its line, as the line
      // keeps the opening it took.
      state.flags[at] = fit === 0 ? PRESERVED_SPACE : breaksBefore ? OBJECT : OBJECT | UNBROKEN
      state.widths.push(extraWidth)
      ;(state.openingEdges ??= zeroList(state.flags.length))[at] = extraWidth
      if (!breaksBefore && !state.analysis.hasUnbroken) state.marksReturnable = true
      // Where the engine ends a line inside the preserved spaces before a padded hard break that
      // doesn't fit (hardBreakItemRetreat), those spaces get an advance each, as text a line can
      // end inside has.
      if (firstKind === HARD_BREAK && !breaksBefore && state.profile.hardBreakItemRetreat !== 'item' && (state.flags[at - 1]! & KIND_BITS) === PRESERVED_SPACE && state.segments[at - 1] !== '') {
        const spaces = state.segments[at - 1]!.length
        const advances: number[] = []
        for (let g = 0; g < spaces; g++) advances.push(state.widths[at - 1]! / spaces)
        state.breakableFitAdvances[at - 1] = advances
      }
      // The simple walkers take every boundary for a break and a line-end trim out of the line's width.
      state.simple = false
      state.segments.push('')
      state.breakableFitAdvances.push(null)
      // The edge comes before the item's segments, so before the space or soft hyphens that lead them.
      state.sourceStarts.push(offset - state.starts[index]!)
      state.sourceEnds.push(offset - state.starts[index]!)
      if (fit !== 0 && fit !== extraWidth) (state.lineEndTrims ??= zeroList(state.flags.length))[at] = extraWidth - fit
      first = from - 1
    }
  }
  return first
}

function applyEndTrim(
  state: SegmentPreparation, sub: ReturnType<typeof measureAnalysis>,
  s: number, i: number, to: number, at: number, extraWidth: number,
): void {
  if (sub.lineEndTrims !== null) {
    const endTrim = sub.lineEndTrims[s]!
    if (endTrim !== 0) (state.lineEndTrims ??= zeroList(state.flags.length))[at] = endTrim
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
    if (endTrim !== 0 && i === to - 1 && to < state.count && extraWidth === 0 && !state.analysis.texts[i]!.endsWith('\u3000')) {
      ;(state.itemEndHalts ??= zeroList(state.flags.length))[at] = endTrim
      state.simple = false
    }
  }
}

function appendMeasuredSegments(
  state: SegmentPreparation, from: number, to: number, index: number, itemAt: number,
  itemEnd: number, first: number, extraWidth: number, letterSpacing: number,
  sub: ReturnType<typeof measureAnalysis>,
): void {
for (let i = from; i < to; i++) {
  const s = i - from
  const at = itemAt + s
  const spaced = state.spacingsDiffer && (state.flags[at]! & SPACED) !== 0
  const holdsExtra = i === first
  if (spaced || holdsExtra) {
    let advances = state.breakableFitAdvances[at] ?? null
    if (advances !== null) {
      // The cached advances are shared by every occurrence of this text.
      advances = state.breakableFitAdvances[at] = advances.slice()
      if (spaced) for (let g = 0; g < advances.length; g++) advances[g] = advances[g]! + letterSpacing
      if (holdsExtra) advances[0] = advances[0]! + extraWidth
    }
    if (spaced) state.widths[at] = state.widths[at]! + letterSpacing
    if (holdsExtra) state.widths[at] = state.widths[at]! + extraWidth
  }
  // No break comes before white space (UAX #14 LB7), so none inside a run of preserved spaces
  // and tabs that goes on from the item before, but in WebKit (whiteSpaceItemBreaks).
  if (s === 0 && at > 0 && !state.whiteSpaceItemBreaks && (1 << (state.flags[at]! & KIND_BITS) & PRESERVED_WHITE_SPACE) !== 0 && (1 << (state.flags[at - 1]! & KIND_BITS) & PRESERVED_WHITE_SPACE) !== 0) {
    state.flags[at] = state.flags[at]! | UNBROKEN
    if (!state.analysis.hasUnbroken) state.marksReturnable = true
  }
  const normalizedStart = state.analysis.starts[i]!
  const normalizedEnd = i + 1 < state.count ? state.analysis.starts[i + 1]! : state.analysis.normalized.length
  const sourceEnd = state.offsets[normalizedEnd - 1]! + 1
  // Where the segment's text ends in the normalized text.
  let textEnd = normalizedEnd
  state.sourceStarts.push(state.offsets[normalizedStart]! - state.starts[index]!)
  if (sourceEnd > itemEnd) {
    // The Gecko analysis keeps the soft hyphens and bidi controls Firefox's text run drops with
    // the segment before them, across items: the segment's text here is its own item's part, and
    // the rest, which paints nothing, is in no fragment.
    while (state.offsets[textEnd - 1]! >= itemEnd) textEnd--
    state.segments.push(state.analysis.normalized.slice(normalizedStart, textEnd))
    state.sourceEnds.push(itemEnd - state.starts[index]!)
  } else {
    state.segments.push(state.analysis.texts[i]!)
    // CRLF is one line feed, which ends with the item where the next item holds the line feed.
    state.sourceEnds.push((state.preserve && sourceEnd < itemEnd && state.source.charCodeAt(sourceEnd - 1) === 0x0D && state.source.charCodeAt(sourceEnd) === 0x0A ? sourceEnd + 1 : sourceEnd) - state.starts[index]!)
  }
  const units = getSourceUnits(state.offsets, normalizedStart, textEnd, state.starts[index]!)
  if (units !== null) (state.sourceUnits ??= new Array<number[] | null>(state.flags.length).fill(null))[at] = units
  if (sub.breakableLineStartExtras !== null && sub.breakableLineStartExtras[s] !== null) (state.breakableLineStartExtras ??= new Array<number[] | null>(state.flags.length).fill(null))[at] = sub.breakableLineStartExtras[s]!
  const startExtra = (sub.lineStartExtras === null ? 0 : sub.lineStartExtras[s]!) + (i > first ? extraWidth : 0)
  if (startExtra !== 0) (state.lineStartExtras ??= zeroList(state.flags.length))[at] = startExtra
  applyEndTrim(state, sub, s, i, to, at, extraWidth)
  if (sub.overflowLineEndTrims !== null) {
    const retryTrim = sub.overflowLineEndTrims[s]!
    if (retryTrim !== 0) (state.overflowLineEndTrims ??= zeroList(state.flags.length))[at] = retryTrim
    // Where no break comes after the mark, as before a period or a no-break space that starts
    // the next item, Blink halts it only on a line it lays out again with a break after every
    // grapheme (HandleOverflow, line_breaker.cc:4259-4264), and there too the halted text is the
    // item's result and the line goes on: Chrome 154 lays out `文字」`, a span `.` and `字` as
    // `文` / `字」.` / `字` at 28.5-31.75px, where their text in one node ends the second line
    // after the mark.
    if (retryTrim !== 0 && i === to - 1 && to < state.count && extraWidth === 0) {
      ;(state.itemEndHalts ??= zeroList(state.flags.length))[at] = retryTrim
      state.simple = false
    }
  }
  if (sub.discretionaryHyphenContexts !== null) (state.discretionaryHyphenContexts ??= zeroList(state.flags.length))[at] = sub.discretionaryHyphenContexts[s]!
  if (i >= first && first < to) (state.insideExtras ??= zeroList(state.flags.length))[at] = extraWidth
  if (i > first && first < to) (state.fillExtras ??= zeroList(state.flags.length))[at] = extraWidth
}
}

export function prepareSegments(state: SegmentPreparation): void {
  for (let from = 0; from < state.count;) {
    // The item this segment starts in, and the segments that start in it.
    const offset = state.offsets[state.analysis.starts[from]!]!
    let index = state.itemSegments.length === 0 ? 0 : state.itemSegments.length - 1
    while (index + 1 < state.starts.length && state.starts[index + 1]! <= offset) index++
    while (state.itemSegments.length <= index) state.itemSegments.push(state.widths.length)
    const itemEnd = index + 1 < state.starts.length ? state.starts[index + 1]! : state.source.length
    let to = from + 1
    while (to < state.count && state.offsets[state.analysis.starts[to]!]! < itemEnd) to++
    const item = state.items[index]!
    const previousItemStart = state.itemStart
    state.itemStart = state.widths.length

    if (item.text === undefined || state.atomic[index]) {
      if (appendObject(item, state.profile, state.wordBreak, state.language, state.flags, state.widths, state.segments, state.breakableFitAdvances, state.sourceStarts, state.sourceEnds)) {
        // Gecko places an object of width 0 otherwise than the simple walker does (walkPreparedComplexLines).
        state.simple = false
        state.hasEmptyObject = true
      }
      from = to
      continue
    }

    const letterSpacing = readLetterSpacing(item.letterSpacing, state.profile)
    if (to === from + 1 && (state.analysis.flags[from]! & KIND_BITS) === SPACE && state.analysis.texts[from] === ' ') {
      // An item of only collapsible white space, as between two styled words: its one space, as
      // measureAnalysis() measures one.
      if (letterSpacing !== 0) state.simple = false
      state.flags[state.widths.length] = SPACE | (state.analysis.flags[from]! & (UNBROKEN | RETURNABLE)) | (letterSpacing !== 0 ? SPACED : 0)
      state.widths.push(getSpaceWidth(getFontMeasurement(item.font, state.language, letterSpacing !== 0)) + (state.spacingsDiffer ? letterSpacing : 0))
      state.segments.push(' ')
      state.breakableFitAdvances.push(null)
      state.sourceStarts.push(offset - state.starts[index]!)
      state.sourceEnds.push(offset + 1 - state.starts[index]!)
      from = to
      continue
    }
    const extraWidth = item.extraWidth ?? 0
    const first = extraWidth === 0 ? to : prepareOpening(state, from, to, extraWidth, previousItemStart, offset, index)
    // An item that is one segment holding all of its text, as a styled word, is measured by the
    // item's own string, not the equal slice of the paragraph's text: a font's widths are kept by
    // text, and a string the caller hands in again keeps its hash, where the slice is hashed anew
    // at every preparation.
    if (to === from + 1 && state.analysis.texts[from] === item.text) state.analysis.texts[from] = item.text
    // The item's segments, measured in its font onto the end of the paragraph's lists; `sub` holds
    // what else measurement gives them, from the item's first segment.
    const itemAt = state.widths.length
    const sub = measureAnalysis(state.analysis, from, to, item.font, false, letterSpacing, state.profile, state.language, true, state.lists)
    state.simple &&= sub.simpleLineCountFastPath
    if (state.readsItemFonts) {
      // The gap before the hyphen is the letter spacing after the grapheme before it.
      state.hyphenWidths[index] = state.spacingsDiffer ? sub.discretionaryHyphenWidth - letterSpacing : sub.discretionaryHyphenWidth
      state.tabStopAdvances[index] = sub.tabStopAdvance
      state.minimumTabAdvances[index] = sub.minimumTabAdvance
      if (state.firstTextItem < 0) state.firstTextItem = index
      else if (state.hyphenWidths[index] !== state.hyphenWidths[state.firstTextItem] || state.tabStopAdvances[index] !== state.tabStopAdvances[state.firstTextItem] || state.minimumTabAdvances[index] !== state.minimumTabAdvances[state.firstTextItem]) state.fontsDiffer = true
    }
    appendMeasuredSegments(state, from, to, index, itemAt, itemEnd, first, extraWidth, letterSpacing, sub)
    from = to
  }
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

