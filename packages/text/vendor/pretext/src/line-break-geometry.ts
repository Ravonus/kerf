// Line geometry helpers moved from @chenglou/pretext 1.0.0.
import { HARD_BREAK, KIND_BITS, SOFT_HYPHEN, SPACE, ZERO_WIDTH_BREAK } from './analysis.js'
import type { LayoutCursor } from './layout.js'
import type { PreparedLineData, ParagraphSegmentData } from './line-break-types.js'

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
