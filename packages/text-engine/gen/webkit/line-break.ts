import { __packs, __missing } from './packs.js'
import {
  CONTROL,
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
} from './analysis.js'
import type { LayoutCursor, LineStats } from './layout.js'
import { getEngineProfile } from './measurement.js'

export const BREAK_AFTER_KINDS = 1 << SPACE | 1 << ZERO_WIDTH_BREAK | 1 << SOFT_HYPHEN | 1 << PRESERVED_SPACE | 1 << TAB

// The prepared handle's line-break data: parallel arrays per segment.
export type PreparedLineBreakData = {
  widths: number[] // Segment widths, e.g. [42.5, 4.4, 37.2]
  // Per segment, its flags byte, e.g. [TEXT, SPACE, TEXT]. A JSON copy of the handle turns it into an
  // object with no length, so the walkers take the segment count from `widths` and read this by
  // index, which the copy answers the same (RESEARCH.md, Decisions Log, 2026-09-24)
  segmentFlags: Uint8Array
  // Normal text can use the simple line stepper across all layout APIs, and layout()
  // counts it with one numeric loop where it has no overflow trims
  simpleLineWalkFastPath: boolean
  // Normal text, or text of its kinds where the scan gives no break at some segment
  // boundary, which layout() counts with the simple stepper
  simpleLineCountFastPath: boolean
  breakableFitAdvances: (number[] | null)[] // Per-grapheme fit advances for breakable segments, else null
  // Per segment with breakable fit advances, per grapheme, width a line that starts with that
  // grapheme adds to its advance, as Blink shapes the start of a line inside a word again
  // (getSegmentFit in src/measurement.ts). Null without any.
  breakableLineStartExtras: (number[] | null)[] | null
  // Per segment, width a line that starts with it adds back, which its width leaves out
  // after the text before it, as Blink's halt of an opening mark (src/han-kerning.ts).
  // Null without any.
  lineStartExtras: number[] | null
  // Per segment, width it drops where a line ends after it and it doesn't fit otherwise,
  // as Blink's line-end halt of a closing mark; an object's is width its line doesn't fit
  // there and still paints (ParagraphSegmentData). Null without any.
  lineEndTrims: number[] | null
  // Per segment, width it drops in place of that where it overflows a line that has no break
  // before it and the line ends after it: Blink retries such a line with a break after every
  // grapheme, so it halts a closing mark before a hard break or a space too. Null without any.
  overflowLineEndTrims: number[] | null
  letterSpacing: number // Extra advance between rendered graphemes on the same line
  discretionaryHyphenWidth: number // Visible width added when a soft hyphen is chosen as the break
  // Per segment, how much narrower a soft hyphen's neighboring text measures
  // joined than apart, else 0. Null when the text has no soft hyphen.
  discretionaryHyphenContexts: number[] | null
  tabStopAdvance: number // Advance between tab stops for pre-wrap tab segments
  minimumTabAdvance: number // The least a tab advances: one nearer its stop takes the stop after
}

// What the line walkers lay out: a text's handle, or the handle of a rich-inline paragraph that
// isn't one text's handle (src/rich-inline.ts), which also holds what its segments have of their
// own. A text's handle has no `items`, so its type, PreparedLineBreakData, doesn't name it.
export type PreparedLineData = PreparedLineBreakData & { items?: ParagraphSegmentData }

// What a rich-inline paragraph's items give its segments, per segment, each list null where no
// segment has a value of its own:
// - `hyphenWidths`, `tabStopAdvances`, `minimumTabAdvances`: the hyphen a soft hyphen paints, the
//   advance between a tab's stops and the least a tab advances, in the item's font, where two
//   items differ in one. A walk reads them, and the handle's own three, at a soft hyphen, under
//   soft-hyphen contexts and at a tab, so a paragraph whose text holds no soft hyphen and no
//   preserved tab has none, and its handle's own three are 0;
// - `hyphenRooms`: the room a line that ends at the break before the segment leaves for a hyphen,
//   where it returns there from a soft hyphen whose hyphen doesn't fit, in a paragraph with a soft
//   hyphen under a profile that leaves such room (getHyphenRooms in src/rich-inline.ts), with one
//   more entry for the break at the paragraph's end;
// - `itemEndHalts`: the line-end trim of a segment that ends its item with a closing mark Blink
//   halts at a line's end, or the trim its retry between graphemes gives one (overflowLineEndTrims),
//   which the mark keeps where the line goes on after it (prepareRichInline() in
//   src/rich-inline.ts);
// - `insideExtras`, `fillExtras`: the item's extraWidth where a line that starts inside the
//   segment pays it, or starts at it and fills it grapheme by grapheme, as a line that starts
//   with the whole segment pays lineStartExtras;
// - `openingEdges`: the width of a segment that is the start edge of a padded item's opening
//   (getOpeningFit in src/rich-inline.ts), which a line that takes it paints whole, whatever of
//   it the line fitted: an object's line-end trim is the part its line doesn't fit, and an edge
//   the engine fits none of is a preserved space, which takes no room in the run of preserved
//   spaces and tabs it is in;
// - `emptyObjectSpaces`, `emptyObjectReturns`: where the engine places an object of width 0
//   though it sticks out of the line, for each such object what a line reads of the text around
//   it (setEmptyObjectFacts in src/rich-inline.ts): the width of the white space that ends the
//   text before it as its last text frame's own, 0 where that text ends in other white space
//   and -1 where it ends in none, and 1 where a line with a break before the object goes back
//   to it, as what follows the object would stick out too.
export type ParagraphSegmentData = {
  hyphenWidths: number[] | null
  tabStopAdvances: number[] | null
  minimumTabAdvances: number[] | null
  hyphenRooms: number[] | null
  itemEndHalts: number[] | null
  insideExtras: number[] | null
  fillExtras: number[] | null
  openingEdges: number[] | null
  emptyObjectSpaces: number[] | null
  emptyObjectReturns: Uint8Array | null
}

export type InternalLineVisitor = (
  width: number,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
) => void

export function breaksAfterKind(kind: number): boolean {
  return (1 << kind & BREAK_AFTER_KINDS) !== 0
}

// A line ends at a chosen soft hyphen, and paints its hyphen, where the line's end
// cursor is the start of the segment after one. A soft hyphen that ends the text is
// consumed with its line and chosen by no wrap, so the cursor at the text's end
// paints none.
export function isDiscretionaryLineEnd(
  segmentFlags: Uint8Array,
  segmentCount: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): boolean {
  return endGraphemeIndex === 0 && endSegmentIndex > 0 && endSegmentIndex < segmentCount &&
    (segmentFlags[endSegmentIndex - 1]! & KIND_BITS) === SOFT_HYPHEN
}

// At a paragraph or hard-break start, ZWSP is real source: it establishes the
// line and offers a break after it. UAX #14 forbids an ordinary break before
// ZWSP. After a forced overflow break browsers can still give ZWSP its own line;
// that start is consumed here.
export function consumesAtLineStart(kind: number, atChunkStart: boolean): boolean {
  return kind === SPACE || kind === SOFT_HYPHEN || (kind === ZERO_WIDTH_BREAK && !atChunkStart)
}

// A tab's advance from `position` on the line: to the next stop, or to the one after where
// the next is under the minimum away. A tab on a stop is a whole stop from the next, so each
// tab of a run takes one. Stops no wider than 0, under a letter spacing of minus a space or
// less, leave a tab no advance: Gecko gives tabs no width there (GetSpacingInternal,
// nsTextFrame.cpp:4262-4264), and Blink's, negative by Font::TabWidth, is clamped to 0 where
// the tab's item is placed (ClampNegativeToZero, line_breaker.cc:1486, 1703). Gecko counts in
// whole app units (EngineProfile's tabsInAppUnits), so a tab exactly the minimum from its
// stop takes it, as many do: in Arial and Helvetica a space is half a `0`. Canvas sums come
// within float error of such a tie.
export function getTabAdvance(position: number, tabStopAdvance: number, minimumAdvance: number, appUnits: boolean): number {
  if (appUnits) {
    const stop = Math.round(tabStopAdvance * 60)
    if (stop <= 0) return 0
    const x = Math.round(position * 60)
    return (Math.ceil((x + Math.round(minimumAdvance * 120) / 2) / stop) * stop - x) / 60
  }
  if (tabStopAdvance <= 0) return 0

  // How far the tab is past the stop before it, by a division and a floor, which counts back
  // from a negative position too. `%` gives the same, within float error, but on numbers that
  // aren't whole it is a call to the C library's fmod, which was nearly all a tab's arithmetic
  // cost (RESEARCH.md, JavaScript Engines).
  const pastStop = position - Math.floor(position / tabStopAdvance) * tabStopAdvance
  const advance = tabStopAdvance - pastStop
  return advance < minimumAdvance ? advance + tabStopAdvance : advance
}

// The advance of tab segment `index` of a rich-inline paragraph, which the line reaches at
// `lineWidth`: to the next stop of its item's font. Tab stops count from the line's start in
// every engine, never from an item's (Blink's line_breaker.cc:2963-2971, WebKit's pen position,
// Gecko's CalcTabWidths, nsTextFrame.cpp:4298-4378). A padded item's text starts after its start
// edge, half its extraWidth, all of which `lineWidth` counts, for a tab that starts the line too
// (lineStartExtras): the other half is the end edge, which follows the item's text on the line.
// Where the paragraph's items differ in letter spacing, a tab's width holds the gap after it, as
// every segment's holds its own (src/rich-inline.ts); else it is 0.
export function getItemTabAdvance(prepared: PreparedLineData, items: ParagraphSegmentData, index: number, lineWidth: number, appUnits: boolean): number {
  const stopAdvance = items.tabStopAdvances === null ? prepared.tabStopAdvance : items.tabStopAdvances[index]!
  const minimumAdvance = items.minimumTabAdvances === null ? prepared.minimumTabAdvance : items.minimumTabAdvances[index]!
  const endEdge = items.insideExtras === null ? 0 : items.insideExtras[index]! / 2
  return getTabAdvance(lineWidth - endEdge, stopAdvance, minimumAdvance, appUnits) + prepared.widths[index]!
}

export function getTerminalLetterSpacing(prepared: PreparedLineData, openingEdges: number[] | null, hangingKinds: number, startSegmentIndex: number, startGraphemeIndex: number, endSegmentIndex: number, endGraphemeIndex: number): number {
  return (__packs.getTerminalLetterSpacing ?? __missing('spacing', 'getTerminalLetterSpacing'))(prepared, openingEdges, hangingKinds, startSegmentIndex, startGraphemeIndex, endSegmentIndex, endGraphemeIndex)
}

// The width a paragraph is laid out at: `NaN`, which a typed caller can pass, is unbounded.
// Every comparison fails at `NaN`, and the line loops ask some whether a segment fits and
// others whether it overflows, so the line APIs called once for a paragraph pass their width
// through here and the loops stay written for numbers. The streams, called once for each
// line, take their width as given (RESEARCH.md, Decisions Log, 2026-10-02).
export function normalizeMaxWidth(maxWidth: number): number {
  return maxWidth <= Infinity ? maxWidth : Infinity
}

// Mutates `cursor` to the next renderable line start. False when no line remains.
// A chunk runs to a hard break or the end of the text, and the hard break ends a
// line however little the chunk holds: a chunk holding only its hard break, or only
// source a line start consumes before it, such as soft hyphens, is an empty line,
// which starts at its hard break. The rest of a chunk after a line that wrapped
// inside it is no line of its own when a line start consumes all of it.
export function normalizePreparedLineStart(
  prepared: PreparedLineData,
  cursor: LayoutCursor,
): boolean {
  const { segmentFlags } = prepared
  const segmentCount = prepared.widths.length
  let segmentIndex = cursor.segmentIndex
  if (segmentIndex >= segmentCount) return false
  if (cursor.graphemeIndex > 0) return true

  let atChunkStart = segmentIndex === 0 || (segmentFlags[segmentIndex - 1]! & KIND_BITS) === HARD_BREAK
  while (true) {
    const kind = segmentFlags[segmentIndex]! & KIND_BITS
    if (kind === HARD_BREAK) {
      if (atChunkStart) {
        cursor.segmentIndex = segmentIndex
        cursor.graphemeIndex = 0
        return true
      }
      if (++segmentIndex >= segmentCount) return false
      cursor.segmentIndex = segmentIndex
      cursor.graphemeIndex = 0
      atChunkStart = true
    } else if (consumesAtLineStart(kind, atChunkStart)) {
      if (++segmentIndex >= segmentCount) return false
    } else {
      cursor.segmentIndex = segmentIndex
      cursor.graphemeIndex = 0
      return true
    }
  }
}

// Walks every line of the text into `stats`, visiting each, and returns the line count.
export function walkPreparedLinesRaw(
  prepared: PreparedLineData,
  maxWidth: number,
  onLine?: InternalLineVisitor,
  stats: LineStats = { lineCount: 0, maxLineWidth: 0 },
): number {
  const cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  if (!prepared.simpleLineWalkFastPath) {
    if (normalizePreparedLineStart(prepared, cursor)) walkPreparedComplexLines(prepared, cursor, maxWidth, onLine, stats)
    return stats.lineCount
  }
  // A fast-path handle is one chunk of text, spaces and ZWSPs, so each line steps
  // from where the last one ended, past what a line can't start with. One loop for
  // both walkers, normalizing each line start and stepping through
  // stepPreparedLineGeometryFromStart(), walked chat 6 to 32% slower in Chrome and
  // Firefox (RESEARCH.md, Keeping Work Bounded).
  const { segmentFlags } = prepared
  const segmentCount = prepared.widths.length
  while (true) {
    let startSegmentIndex = cursor.segmentIndex
    const atTextStart = startSegmentIndex === 0
    while (startSegmentIndex < segmentCount && consumesAtLineStart(segmentFlags[startSegmentIndex]! & KIND_BITS, atTextStart)) {
      startSegmentIndex++
    }
    if (startSegmentIndex >= segmentCount) return stats.lineCount
    const startGraphemeIndex = cursor.graphemeIndex
    cursor.segmentIndex = startSegmentIndex
    const width = stepPreparedSimpleLineGeometry(prepared, cursor, maxWidth)
    stats.lineCount++
    if (width > stats.maxLineWidth) stats.maxLineWidth = width
    onLine?.(width, startSegmentIndex, startGraphemeIndex, cursor.segmentIndex, cursor.graphemeIndex)
  }
}

// layout()'s count: the simple stepper's lines as one numeric loop, with no
// cursor and no per-line call. Every segment boundary of a fast-path handle is
// a break, so an overflowing space or ZWSP ends its line and any other segment
// starts the next one. The full walker costs three to five times as much per
// segment, so one walker for all text was rejected (RESEARCH.md, Decisions Log,
// 2026-09-24).
export function countPreparedLines(prepared: PreparedLineData, maxWidth: number): number {
  // The loop takes no overflow trims, which the stepper takes for a line's first segment.
  if (!prepared.simpleLineWalkFastPath || prepared.overflowLineEndTrims !== null) {
    return prepared.simpleLineCountFastPath ? countSteppedLines(prepared, maxWidth) : walkPreparedLinesRaw(prepared, maxWidth)
  }
  const { widths, segmentFlags, breakableFitAdvances, breakableLineStartExtras, lineStartExtras, lineEndTrims } = prepared
  const fitLimit = Math.max(0, maxWidth) + 0.015625
  const segmentCount = widths.length
  let count = 0
  // Every line starts at 0 and adds its content's widths. Firefox runs this loop
  // about 1.6 times as long when a line's width is set from a segment's width
  // instead (RESEARCH.md, Keeping Work Bounded).
  let lineW = 0
  let hasContent = false

  // A ZWSP at the start of the text starts the first line.
  for (let i = 0; i < segmentCount; i++) {
    const kind = segmentFlags[i]! & KIND_BITS
    const w = widths[i]!
    const endTrim = lineEndTrims === null ? 0 : lineEndTrims[i]!
    if (hasContent) {
      // A segment that fits only by its line-end trim ends the line, as the full
      // width it adds leaves no room after it.
      if (lineW + w - endTrim <= fitLimit) {
        lineW += w
        continue
      }
      count++
      lineW = 0
      hasContent = false
      if (kind !== TEXT) continue
    } else if (kind === SPACE || (kind === ZERO_WIDTH_BREAK && i > 0)) {
      continue
    }

    const startW = lineStartExtras === null ? w : w + lineStartExtras[i]!
    const advances = breakableFitAdvances[i] as number[] | null
    if (startW - endTrim <= fitLimit || advances === null) {
      lineW += startW
      hasContent = true
      continue
    }
    // An overflowing breakable segment fills lines grapheme by grapheme.
    const startExtras = breakableLineStartExtras?.[i] ?? null
    let g = 0
    while (g < advances.length) {
      if (startExtras !== null) lineW += startExtras[g]!
      lineW += advances[g++]!
      while (g < advances.length && lineW + advances[g]! <= fitLimit) lineW += advances[g++]!
      if (g < advances.length) {
        count++
        lineW = 0
      } else {
        hasContent = true
      }
    }
  }
  return count + (hasContent ? 1 : 0)
}

// layout()'s count of text of the simple walkers' kinds where the scan gives no
// break at some segment boundary, as before NEL: the simple stepper's lines, except
// that the full walker steps a line again where the stepper ended it at such a
// boundary, before the segment or after the space before it, returning the line to
// its last break. Checking for that inside the counter's loop slowed Firefox's and
// Chrome's count of all other text once the check had ever held, and the line APIs
// keep the full walker for this text, since the stepper's widths can differ from
// its in the last bits (RESEARCH.md, Keeping Work Bounded).
export function countSteppedLines(prepared: PreparedLineData, maxWidth: number): number {
  const { segmentFlags } = prepared
  const segmentCount = prepared.widths.length
  const cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let count = 0
  while (normalizePreparedLineStart(prepared, cursor)) {
    const startSegmentIndex = cursor.segmentIndex
    const startGraphemeIndex = cursor.graphemeIndex
    stepPreparedSimpleLineGeometry(prepared, cursor, maxWidth)
    if (cursor.graphemeIndex === 0 && cursor.segmentIndex < segmentCount && (segmentFlags[cursor.segmentIndex]! & UNBROKEN) !== 0) {
      cursor.segmentIndex = startSegmentIndex
      cursor.graphemeIndex = startGraphemeIndex
      walkPreparedComplexLines(prepared, cursor, maxWidth, undefined, null, true)
    }
    count++
  }
  return count
}

// Whether the run of preserved spaces and tabs that hang, which starts at segment `start` right
// after an object on its line, an atomic rich-inline item or a box (OBJECT), stays there however
// far the line overflows, as no break comes before it in the text (UAX #14 LB7). Blink takes it
// as trailing items after the break after an atomic inline (HandleTrailingSpaces,
// line_breaker.cc:2426-2534), trailing on into the next item where an item's spaces reach its end
// (:2518-2533); WebKit gives a soft wrap opportunity after each white-space item
// (isAtSoftWrapOpportunity, InlineFormattingUtils.cpp:408-413) and keeps each as content that hangs
// (InlineContentBreaker.cpp:181-182); and Gecko lets an empty frame past the line's end
// (CanPlaceFrame, nsLineLayout.cpp:1217-1270). After text that overflows, the engine's retry
// between graphemes breaks before the white space instead. But Gecko breaks only after a run of
// spaces and tabs (nsLineBreaker.cpp:323, :586) and doesn't hang a tab, so where the white space
// runs into a tab, Firefox moves all of it to the next line with the tab. The walker asks once
// per run, so a long run costs one pass.
// moved to the "complex" pack: staysAfterObject

// Whether a line that would end at the break before `breakSegmentIndex`, painting
// `breakWidth`, returns to an earlier opportunity: where it ends at a selected
// discretionary hyphen that doesn't fit. A return needs an overflow that isolated
// widths can show: the soft hyphens on the line may measure narrower joined than apart
// by less than the overflow. Those are the soft hyphens the line passes, whose text the
// engine shapes whole, and with `endKeepsJoin` the one the line ends at too
// (EngineProfile, unfitHyphenRetreat).
// moved to the "complex" pack: returnsFromUnfitHyphen

// The full walker, for text the simple walkers don't cover: from a normalized line
// start, every line into `stats`, or with `singleLine` one line, whose width it
// returns (null without one). Every line state is a local of this one function,
// with no closure over it: V8 boxes a captured number, so each write to one cost
// 12-14ns there against about 1ns for a local. It keeps its own loop over lines:
// stepping one line per call, it read the handle and the profile and derived its
// limits again for every line, and short lines laid out 7 to 40% slower in all
// three browsers (RESEARCH.md, Keeping Work Bounded).
export function walkPreparedComplexLines(prepared: PreparedLineData, cursor: LayoutCursor, maxWidth: number, onLine: InternalLineVisitor | undefined, stats: LineStats | null, singleLine): number | null {
  return (__packs.walkPreparedComplexLines ?? __missing('complex', 'walkPreparedComplexLines'))(prepared, cursor, maxWidth, onLine, stats, singleLine)
}

// Steps one line of a fast-path handle from a normalized line start.
export function stepPreparedSimpleLineGeometry(
  prepared: PreparedLineData,
  cursor: LayoutCursor,
  maxWidth: number,
): number {
  const { widths, segmentFlags, breakableFitAdvances, lineStartExtras, lineEndTrims, overflowLineEndTrims } = prepared
  // A negative width lays out as 0, as in the complex walker.
  const fitLimit = Math.max(0, maxWidth) + 0.015625
  const start = cursor.segmentIndex

  // The first segment of the line, or the rest of one a line ended inside. One that
  // overflows and can break fills the line grapheme by grapheme.
  const startAdvances = breakableFitAdvances[start]
  const startW = lineStartExtras === null ? widths[start]! : widths[start]! + lineStartExtras[start]!
  const startEndTrim = lineEndTrims === null ? 0 : lineEndTrims[start]!
  // Blink's retry between graphemes halts an overflowing first segment where that lets it fit.
  const startTrim = overflowLineEndTrims !== null && startW - overflowLineEndTrims[start]! <= fitLimit
    ? overflowLineEndTrims[start]!
    : startEndTrim
  let lineW: number
  // The line-end trim of the last segment, where only that trim let it fit. Every
  // later segment overflows, so the line ends after it and paints that much less.
  let endTrimmed = 0
  if (cursor.graphemeIndex > 0 || (startW - startTrim > fitLimit && startAdvances !== null)) {
    const fitAdvances = startAdvances!
    const startExtras = prepared.breakableLineStartExtras?.[start] ?? null
    let g = cursor.graphemeIndex + 1
    lineW = startExtras === null ? fitAdvances[g - 1]! : fitAdvances[g - 1]! + startExtras[g - 1]!
    // A line that starts inside a padded rich-inline item, or fills its first segment, pays
    // the item's extraWidth (ParagraphSegmentData).
    const items = prepared.items
    if (items !== undefined && (g > 1 ? items.insideExtras !== null : items.fillExtras !== null)) lineW += g > 1 ? items.insideExtras![start]! : items.fillExtras![start]!
    for (; g < fitAdvances.length; g++) {
      if (lineW + fitAdvances[g]! > fitLimit) {
        cursor.graphemeIndex = g
        return lineW
      }
      lineW += fitAdvances[g]!
    }
  } else {
    lineW = startW
    if (startW > fitLimit) endTrimmed = startTrim
  }

  // Every boundary of a fast-path handle is a break, so the line takes whole
  // segments until one overflows. An overflowing space or ZWSP hangs and ends the
  // line; before other text, the line leaves out a space or ZWSP it ends with.
  for (let i = start + 1; i < widths.length; i++) {
    const w = widths[i]!
    const endTrim = lineEndTrims === null ? 0 : lineEndTrims[i]!
    if (lineW + w - endTrim > fitLimit) {
      const hangs = breaksAfterKind(segmentFlags[i]! & KIND_BITS)
      cursor.segmentIndex = hangs ? i + 1 : i
      cursor.graphemeIndex = 0
      return !hangs && breaksAfterKind(segmentFlags[i - 1]! & KIND_BITS) ? lineW - widths[i - 1]! : lineW - endTrimmed
    }
    lineW += w
    endTrimmed = lineW > fitLimit ? endTrim : 0
  }
  cursor.segmentIndex = widths.length
  cursor.graphemeIndex = 0
  return lineW - endTrimmed
}

// Steps one line from a normalized line start. A cursor inside a segment needs that segment's
// breakable fit advances.
export function stepPreparedLineGeometryFromStart(
  prepared: PreparedLineData,
  cursor: LayoutCursor,
  maxWidth: number,
): number | null {
  if (prepared.simpleLineWalkFastPath) return stepPreparedSimpleLineGeometry(prepared, cursor, maxWidth)
  return walkPreparedComplexLines(prepared, cursor, maxWidth, undefined, null, true)
}
