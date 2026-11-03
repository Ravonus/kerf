// Moved here from line-break.ts by scripts/specialize.mjs (pack "spacing"). Upstream code, unchanged.
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
import { BREAK_AFTER_KINDS, breaksAfterKind, isDiscretionaryLineEnd, consumesAtLineStart, getTabAdvance, getItemTabAdvance, normalizeMaxWidth, normalizePreparedLineStart, walkPreparedLinesRaw, countPreparedLines, countSteppedLines, stepPreparedSimpleLineGeometry, stepPreparedLineGeometryFromStart, walkPreparedComplexLines } from './line-break.js'
import type { PreparedLineBreakData, PreparedLineData, ParagraphSegmentData, InternalLineVisitor } from './line-break.js'
export function getTerminalLetterSpacing(
  prepared: PreparedLineData,
  openingEdges: number[] | null,
  hangingKinds: number,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): number {
  const { letterSpacing, segmentFlags } = prepared
  if (letterSpacing === 0) return 0

  if (endGraphemeIndex > 0) return (segmentFlags[endSegmentIndex]! & SPACED) !== 0 ? letterSpacing : 0

  const segmentCount = prepared.widths.length
  if (isDiscretionaryLineEnd(segmentFlags, segmentCount, endSegmentIndex, endGraphemeIndex)) return 0
  // A run of preserved spaces and tabs that hangs where the line wraps already
  // charged the gap after the glyph before it. Gecko doesn't hang tabs.
  if (endSegmentIndex > startSegmentIndex && endSegmentIndex < segmentCount && (segmentFlags[endSegmentIndex]! & KIND_BITS) !== HARD_BREAK &&
    (1 << (segmentFlags[endSegmentIndex - 1]! & KIND_BITS) & hangingKinds) !== 0) return 0

  for (let i = endSegmentIndex - 1; i >= startSegmentIndex; i--) {
    const flags = segmentFlags[i]!
    const kind = flags & KIND_BITS
    // Segments that take no letter spacing, such as zero-width glue or marks
    // shaped on the grapheme before them, leave that grapheme's gap last. A tab
    // that takes none follows that gap, which its stop counts from. An object
    // leaves none after itself, nor does the edge of a padded opening.
    if (kind === SPACE || (kind !== CONTROL && kind !== TAB && (flags & SPACED) === 0 && kind !== OBJECT && (openingEdges === null || openingEdges[i]! === 0))) continue

    if (i === startSegmentIndex && startGraphemeIndex > 0) return letterSpacing

    return (flags & SPACED) !== 0 ? letterSpacing : 0
  }

  return 0
}
