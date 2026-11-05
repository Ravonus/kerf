// Line fragments moved from @chenglou/pretext 1.0.0 rich-inline.ts.
import { KIND_BITS, SPACED, TAB } from '../analysis.js'
import { getItemTabAdvance, type ParagraphSegmentData } from '../line-break.js'
import type { PreparedSegments } from '../line-text.js'
import { getEngineProfile } from '../measurement.js'
import type { InternalPreparedRichInline, RichInlineCursor, RichInlineFragmentRange, RichInlineLineRange } from '../rich-inline-types.js'

// The width on a line of graphemes [from, to) of segment i, to its end where `to` is -1: a line
// starts or ends inside its first and its last segment only. Where they start the line
// (`startsLine`), the first of them adds what a line that starts with it does
// (breakableLineStartExtras), as the walker's line does.
function getPartWidth(data: PreparedSegments, i: number, from: number, to: number, startsLine: boolean): number {
  const { breakableFitAdvances, breakableLineStartExtras, letterSpacing, items } = data
  const advances = breakableFitAdvances[i]!
  if (to < 0) to = advances.length
  let w = 0
  for (let g = from; g < to; g++) w += advances[g]! + letterSpacing
  const startExtras = startsLine && breakableLineStartExtras !== null ? breakableLineStartExtras[i]! : null
  if (startExtras !== null) w += startExtras[from]!
  if (items !== undefined && (from > 0 ? items.insideExtras !== null : items.fillExtras !== null)) w += from > 0 ? items.insideExtras![i]! : items.fillExtras![i]!
  return w
}

// A line of a paragraph whose only item with segments has no extraWidth (onlyItem), as most of a
// chat's are: one fragment of that item, as wide as the line. Every segment is that item's, so a
// place in the paragraph is the same place in the item. A function of its own, which the walk and
// the stream call for such a paragraph: with it Safari 27 walked and streamed the chat demo's
// paragraphs 8.0% and 8.6% faster than with that line as a branch of createLine() and Chrome 154
// walked them 4.2% faster, and it cost Chrome's walk of items that are a word or a space each 5.3%
// and Firefox 156's walk of the demo's styled paragraphs 2.2% (RESEARCH.md, Rich Inline As One
// Paragraph; Decisions Log, 2026-10-08).
export function createOnlyItemLine(
  flow: InternalPreparedRichInline,
  width: number,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): RichInlineLineRange {
  const { onlyItem } = flow
  const ended = endSegmentIndex >= flow.data.widths.length
  return {
    fragments: [{
      itemIndex: onlyItem,
      gapBefore: 0,
      gapItemIndex: -1,
      occupiedWidth: width,
      start: { segmentIndex: startSegmentIndex, graphemeIndex: startGraphemeIndex },
      end: { segmentIndex: endSegmentIndex, graphemeIndex: endGraphemeIndex },
    }],
    width: Math.max(0, width),
    end: { itemIndex: ended ? flow.itemSegments.length - 1 : onlyItem, segmentIndex: ended ? 0 : endSegmentIndex, graphemeIndex: endGraphemeIndex },
  }
}

function bareFragments(
  startSegmentIndex: number, lastSegmentIndex: number, segmentItems: Int32Array,
  itemSegments: number[], gapSegments: Uint8Array, widths: number[], fragments: RichInlineFragmentRange[],
): number {
  let lineW = 0
  let gap = 0
  let gapItemIndex = -1
  let fragment: RichInlineFragmentRange | null = null
  let occupiedWidth = 0
  let to = startSegmentIndex
  for (let i = startSegmentIndex; i <= lastSegmentIndex; i++) {
    if (i === to) {
      if (fragment !== null) fragment.occupiedWidth = occupiedWidth
      const itemIndex = segmentItems[i]!
      if (gapSegments[i]! !== 0) {
        gap = widths[i]!
        gapItemIndex = itemIndex
        to = i + 1
        continue
      }
      const first = itemSegments[itemIndex]!
      to = Math.min(itemSegments[itemIndex + 1]!, lastSegmentIndex + 1)
      if (gapSegments[to - 1]! !== 0) to--
      fragment = { itemIndex, gapBefore: gap, gapItemIndex, occupiedWidth: 0, start: { segmentIndex: i - first, graphemeIndex: 0 }, end: { segmentIndex: to - first, graphemeIndex: 0 } }
      fragments.push(fragment)
      lineW += gap
      gap = 0
      gapItemIndex = -1
      occupiedWidth = 0
    }
    occupiedWidth += widths[i]!
    lineW += widths[i]!
  }
  if (fragment !== null) fragment.occupiedWidth = occupiedWidth
  return lineW
}

function trimFragments(fragments: RichInlineFragmentRange[], itemSegments: number[], items: ParagraphSegmentData, width: number, lineW: number): void {
  let rest = lineW - width
  if (rest < 0 && fragments.length > 0) fragments[fragments.length - 1]!.occupiedWidth -= rest
  const openingEdges = items.openingEdges
  for (let k = fragments.length - 1; k >= 0 && rest > 0; k--) {
    const last = fragments[k]!
    // The edge of a padded opening stays painted: it is the first segment of its item, so of a fragment.
    const edge = openingEdges === null || last.start.graphemeIndex > 0 ? 0 : openingEdges[itemSegments[last.itemIndex]! + last.start.segmentIndex]!
    if (last.occupiedWidth > edge) {
      const part = Math.min(rest, last.occupiedWidth - edge)
      last.occupiedWidth -= part
      rest -= part
    }
    if (rest > 0 && last.gapBefore > 0) {
      const part = Math.min(rest, last.gapBefore)
      last.gapBefore -= part
      rest -= part
      // A gap taken whole is none, and so is one with under 1e-9px left, which could only be float
      // error. That needs a width the line leaves out, such as a mark's halt, to be as wide as the
      // gap to the last bits, which no rule makes it.
      if (last.gapBefore < 1e-9) {
        last.gapBefore = 0
        last.gapItemIndex = -1
      }
    }
  }
}

function measuredFragments(
  flow: InternalPreparedRichInline, width: number, startSegmentIndex: number, startGraphemeIndex: number,
  endSegmentIndex: number, endGraphemeIndex: number, lastSegmentIndex: number, firstPartWidth: number,
  lastPartWidth: number, tabsInAppUnits: boolean, fragments: RichInlineFragmentRange[],
): number {
  const { data, itemSegments } = flow
  const { widths, segmentFlags, lineStartExtras, letterSpacing } = data
  const items = data.items!
  const segmentItems = flow.segmentItems!
  const gapSegments = flow.gapSegments!
  const itemEndHalts = items.itemEndHalts
  let lineW = 0
  let gap = 0
  let gapItemIndex = -1
  let fragment: RichInlineFragmentRange | null = null
  let occupiedWidth = 0
  let to = startSegmentIndex
  for (let i = startSegmentIndex; i <= lastSegmentIndex; i++) {
    if (i === to) {
      if (fragment !== null) fragment.occupiedWidth = occupiedWidth
      const itemIndex = segmentItems[i]!
      if (gapSegments[i]! !== 0) {
        // A collapsed space is no tab and no halted mark, and no line starts with one or ends inside one.
        gap = widths[i]! + (letterSpacing !== 0 && (segmentFlags[i]! & SPACED) !== 0 ? letterSpacing : 0)
        gapItemIndex = itemIndex
        to = i + 1
        continue
      }
      // The fragment's segments end at `to`: the item's on the line, less the collapsed space that ends it.
      const first = itemSegments[itemIndex]!
      to = Math.min(itemSegments[itemIndex + 1]!, lastSegmentIndex + 1)
      if (gapSegments[to - 1]! !== 0) to--
      const endsInside = to > endSegmentIndex
      fragment = {
        itemIndex,
        gapBefore: gap,
        gapItemIndex,
        occupiedWidth: 0,
        start: { segmentIndex: i - first, graphemeIndex: i === startSegmentIndex ? startGraphemeIndex : 0 },
        end: { segmentIndex: (endsInside ? endSegmentIndex : to) - first, graphemeIndex: endsInside ? endGraphemeIndex : 0 },
      }
      fragments.push(fragment)
      lineW += gap
      gap = 0
      gapItemIndex = -1
      occupiedWidth = 0
    }
    // A segment's width on the line, with the letter spacing after each of its graphemes, as a
    // fragment's width counts it.
    let w: number
    if ((i > startSegmentIndex || startGraphemeIndex === 0) && i < endSegmentIndex) {
      const startExtra = i === startSegmentIndex && lineStartExtras !== null ? lineStartExtras[i]! : 0
      w = startExtra + ((segmentFlags[i]! & KIND_BITS) !== TAB ? widths[i]! : getItemTabAdvance(data, items, i, lineW + startExtra, tabsInAppUnits))
      if (letterSpacing !== 0 && (segmentFlags[i]! & SPACED) !== 0) w += letterSpacing
    } else {
      w = i === startSegmentIndex ? firstPartWidth : lastPartWidth
    }
    // A mark that ends its item was halted where the line went on after it: the line is then
    // narrower than its segments up to the mark (ParagraphSegmentData, itemEndHalts), since what
    // follows a halted mark fits in less than the halt. Premise: what follows a mark on its line
    // takes no less than no room. Its gap is an item after the mark whose letter spacing is more
    // negative than its letters are wide, where a mark that wasn't halted gives its halt to the
    // line's last fragment; the line's width and breaks are the walker's either way. The 1e-6px
    // is room for float error: the walker adds the same advances in another order, so where
    // nothing after a mark that wasn't halted takes room, the segments up to it can add up to
    // more than the line by a few units in the last place of the line's width (one is 6e-14px on
    // a line of 300px, 6e-11px on one of 280,000px), and the mark would read as halted, its halt
    // going to the line's last fragment.
    if (itemEndHalts !== null && itemEndHalts[i]! !== 0 && lineW + w - width > 1e-6) w -= itemEndHalts[i]!
    occupiedWidth += w
    lineW += w
  }
  if (fragment !== null) fragment.occupiedWidth = occupiedWidth
  return lineW
}

// A line of the paragraph from the text walkers' line: its segments cut into fragments where the
// item changes. A collapsed space at an item's start or end is no fragment's text but the gap
// before the next fragment on the line, as that item's white space made it. Each fragment's width
// is its segments' on this line, and the fragments add up to the line's width: what the line's
// width leaves out at its end comes out of the last fragments and the gaps before them, from the
// line's end back, as white space that hangs there, but never out of the edge of a padded item's
// opening, which the line paints whole (getOpeningFit), and what it adds, the hyphen of a soft
// hyphen the line ends at, goes to the last one. One loop over the line's segments: where a
// fragment or a gap starts, the paragraph's lists give where that fragment ends, so every other
// segment only adds its width. A line where no segment's width depends on the line (`bare`), as
// nearly every line of styled prose is, has a loop of its own that adds bare widths: in one loop
// with the widths that tabs, letter spacing, halts and a line's edges need, Chrome walked the chat
// demo's styled paragraphs about 19% slower and Safari 8% (two runs against one build). The widths
// of the two segments a line can start or end inside are found before the loops, and neither holds
// another loop or a search: a search for the item, or a call or a loop inside one for a width it
// rarely needs, cost Firefox a third to a half of a walk's time, and a loop inside for each
// fragment's widths 9% on items of one segment (RESEARCH.md, Rich Inline As One Paragraph).
export function createLine(
  flow: InternalPreparedRichInline,
  width: number,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): RichInlineLineRange {
  const { data, itemSegments } = flow
  const { widths, lineStartExtras } = data
  const items = data.items!
  const segmentItems = flow.segmentItems!
  const gapSegments = flow.gapSegments!
  const itemCount = itemSegments.length - 1
  const endItemIndex = endSegmentIndex >= widths.length ? itemCount : segmentItems[endSegmentIndex]!
  const end: RichInlineCursor = { itemIndex: endItemIndex, segmentIndex: endSegmentIndex - itemSegments[endItemIndex]!, graphemeIndex: endGraphemeIndex }
  const tabsInAppUnits = getEngineProfile().tabsInAppUnits
  const fragments: RichInlineFragmentRange[] = []
  const lastSegmentIndex = endGraphemeIndex > 0 ? endSegmentIndex : endSegmentIndex - 1
  const firstPartWidth = startSegmentIndex <= lastSegmentIndex && (startGraphemeIndex > 0 || startSegmentIndex === endSegmentIndex)
    ? getPartWidth(data, startSegmentIndex, startGraphemeIndex, startSegmentIndex < endSegmentIndex ? -1 : endGraphemeIndex, true) : 0
  const lastPartWidth = endGraphemeIndex > 0 && endSegmentIndex > startSegmentIndex ? getPartWidth(data, endSegmentIndex, 0, endGraphemeIndex, false) : 0
  // Whether each of the line's segments is as wide on it as its width: in a paragraph of plain
  // widths, a line that starts and ends between segments and adds nothing at its start.
  const bare = flow.plainWidths && startGraphemeIndex === 0 && endGraphemeIndex === 0 && (lineStartExtras === null || lineStartExtras[startSegmentIndex] === 0)
  // The line's width so far, and the gap that waits for a fragment.
  let lineW = 0
  if (bare) {
    lineW = bareFragments(startSegmentIndex, lastSegmentIndex, segmentItems, itemSegments, gapSegments, widths, fragments)
  } else {
    lineW = measuredFragments(flow, width, startSegmentIndex, startGraphemeIndex, endSegmentIndex, endGraphemeIndex, lastSegmentIndex, firstPartWidth, lastPartWidth, tabsInAppUnits, fragments)
  }
  trimFragments(fragments, itemSegments, items, width, lineW)
  return { fragments, width: Math.max(0, width), end }
}

