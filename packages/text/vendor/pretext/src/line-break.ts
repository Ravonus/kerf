import { consumesAtLineStart, normalizePreparedLineStart } from './line-break-geometry.js'
export { isDiscretionaryLineEnd, getItemTabAdvance, normalizeMaxWidth, normalizePreparedLineStart } from './line-break-geometry.js'
export type { PreparedLineBreakData, PreparedLineData, ParagraphSegmentData } from './line-break-types.js'

import { stepPreparedSimpleLineGeometry, countPreparedSimpleLines } from './line-break-simple.js'
import { KIND_BITS, UNBROKEN } from './analysis.js'
import { walkPreparedComplexLines } from './line-break-complex.js'
import type { LayoutCursor, LineStats } from './layout.js'
import type { PreparedLineData, InternalLineVisitor } from './line-break-types.js'

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
  return countPreparedSimpleLines(prepared, maxWidth)
}

// layout()'s count of text of the simple walkers' kinds where the scan gives no
// break at some segment boundary, as before NEL: the simple stepper's lines, except
// that the full walker steps a line again where the stepper ended it at such a
// boundary, before the segment or after the space before it, returning the line to
// its last break. Checking for that inside the counter's loop slowed Firefox's and
// Chrome's count of all other text once the check had ever held, and the line APIs
// keep the full walker for this text, since the stepper's widths can differ from
// its in the last bits (RESEARCH.md, Keeping Work Bounded).
function countSteppedLines(prepared: PreparedLineData, maxWidth: number): number {
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
