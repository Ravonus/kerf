// Preparation's measurement phase: each segment of a text analysis measured in a font, with
// the facts the line walkers read at a line's edges.

import type { TextAnalysis } from './analysis.js'
import type { EngineProfile } from './measurement.js'
import type { PreparedText } from './layout.js'
import type { PreparedLineBreakData } from './line-break.js'
import type { PreparedSegments } from './line-text.js'
import { createMeasurement, measureSegments } from './prepare-measure.js'
import { finishMeasurement } from './prepare-finish.js'
export { OTHER_SCRIPT, CYRILLIC_SCRIPT, GREEK_SCRIPT, LATIN_SCRIPT, CURSIVE_SCRIPT, ANY_SCRIPT, MARK_SCRIPTS_SHIFT, TAKES_MARK_SCRIPTS, CURSIVE_LETTER, OPENING_BRACKET, CLOSING_BRACKET, OPENING_BRACKET_SHIFT } from './prepare-script.js'

// The lists of a rich-inline paragraph's handle that each item's measurement adds its segments
// to; `segmentFlags` has room for them from `widths.length` on.
export type ParagraphLists = {
  widths: number[]
  segmentFlags: Uint8Array
  breakableFitAdvances: (number[] | null)[]
}

export function measureAnalysis(
  analysis: TextAnalysis,
  from: number,
  to: number,
  font: string,
  includeSegments: boolean,
  letterSpacing: number,
  engineProfile: EngineProfile,
  language: string | null,
  // Whether text segments take emergency breaks between graphemes: an atomic rich item,
  // which is only laid out whole, takes none.
  overflowBreaks: boolean,
  // The paragraph's lists for a rich-inline item, null for a text.
  paragraph: ParagraphLists | null,
): (PreparedText & PreparedLineBreakData) | (PreparedText & PreparedSegments) {
  const ctx = createMeasurement(analysis, from, to, font, includeSegments, letterSpacing, engineProfile, language, overflowBreaks, paragraph)
  measureSegments(ctx)
  return finishMeasurement(
    ctx.analysis,
    ctx.from,
    ctx.to,
    ctx.own,
    ctx.fontMeasurement,
    ctx.engineProfile,
    ctx.letterSpacing,
    ctx.emojiCorrection,
    ctx.widths,
    ctx.base,
    ctx.segmentFlags,
    ctx.simpleKinds,
    ctx.breakableFitAdvances,
    ctx.breakableLineStartExtras,
    ctx.discretionaryHyphenContexts,
    ctx.tabStopAdvance,
    ctx.minimumTabAdvance,
    ctx.segments,
  )
}
