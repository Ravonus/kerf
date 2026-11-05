// The simple line stepper moved from @chenglou/pretext 1.0.0.
import { KIND_BITS, PRESERVED_SPACE, SOFT_HYPHEN, SPACE, TAB, TEXT, ZERO_WIDTH_BREAK } from './analysis.js'
import type { LayoutCursor } from './layout.js'
import { getEngineProfile } from './measurement.js'
import type { PreparedLineData } from './line-break-types.js'

export const BREAK_AFTER_KINDS = 1 << SPACE | 1 << ZERO_WIDTH_BREAK | 1 << SOFT_HYPHEN | 1 << PRESERVED_SPACE | 1 << TAB

export function breaksAfterKind(kind: number): boolean {
  return (1 << kind & BREAK_AFTER_KINDS) !== 0
}

// Steps one line of a fast-path handle from a normalized line start.
export function stepPreparedSimpleLineGeometry(
  prepared: PreparedLineData,
  cursor: LayoutCursor,
  maxWidth: number,
): number {
  const { widths, segmentFlags, breakableFitAdvances, lineStartExtras, lineEndTrims, overflowLineEndTrims } = prepared
  // A negative width lays out as 0, as in the complex walker.
  const fitLimit = Math.max(0, maxWidth) + getEngineProfile().lineFitEpsilon
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


// The fast-path counter uses one numeric loop.
export function countPreparedSimpleLines(prepared: PreparedLineData, maxWidth: number): number {
  const { widths, segmentFlags, breakableFitAdvances, breakableLineStartExtras, lineStartExtras, lineEndTrims } = prepared
  const fitLimit = Math.max(0, maxWidth) + getEngineProfile().lineFitEpsilon
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
