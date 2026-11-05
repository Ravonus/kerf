import type { GraphemeTable } from './graphemes.js'

export type WhiteSpaceMode = 'normal' | 'pre-wrap'
export type WordBreakMode = 'normal' | 'keep-all'

// No `glue` kind: no-break characters are text and the scans decide their breaks
// (RESEARCH.md, Decisions Log, 2026-09-24).
export type SegmentBreakKind =
  | 'text'
  | 'space'
  | 'preserved-space'
  | 'tab'
  | 'zero-width-break'
  | 'soft-hyphen'
  // A ZWSP or soft hyphen the engine's scan doesn't break after: zero width, no
  // letter spacing, no break on either side.
  | 'zero-width-glue'
  | 'hard-break'
  | 'control'

// A segment's flags byte: its kind's code in the low four bits, then what else the
// walkers read of it.
export const TEXT = 0
export const SPACE = 1
export const ZERO_WIDTH_BREAK = 2
export const SOFT_HYPHEN = 3
export const PRESERVED_SPACE = 4
export const TAB = 5
export const ZERO_WIDTH_GLUE = 6
export const CONTROL = 7
// Ends its chunk: a line's walk stops there, and the next line starts after it.
export const HARD_BREAK = 8
// In a rich-inline paragraph's handle (src/rich-inline.ts), an atomic item or a box: one object with
// a break on both sides and none inside, which a line fits and paints as it does text. The start
// edge of a padded item that opens with white space, a hard break or a zero-width space is one too,
// with no break before it where the text has none there. No analysis makes one.
export const OBJECT = 9
export const KIND_BITS = 0x0F
// The segment takes letter spacing after its graphemes. Set by measurement.
export const SPACED = 0x10
// The engine's scan gives no break before the segment, so no line ends there.
export const UNBROKEN = 0x20
// The scan gives a break before the segment, in text that also has unbroken
// boundaries, where a line that overflows at one returns to the latest such break.
export const RETURNABLE = 0x40
// The engine's clusters don't split the segment, so no emergency break splits it
// either. Measurement clears it.
export const ONE_CLUSTER = 0x80
export type SegmentKindCode = typeof TEXT | typeof SPACE | typeof ZERO_WIDTH_BREAK | typeof SOFT_HYPHEN |
  typeof PRESERVED_SPACE | typeof TAB | typeof ZERO_WIDTH_GLUE | typeof CONTROL | typeof HARD_BREAK
// Each kind's name by its code, as prepareWithSegments() gives them.
export const SEGMENT_KINDS: readonly SegmentBreakKind[] = [
  'text', 'space', 'zero-width-break', 'soft-hyphen', 'preserved-space', 'tab', 'zero-width-glue', 'control', 'hard-break',
]

// `spaceSources` holds, in the WebKit profile where normal white space collapsed, the source
// unit each normalized unit starts from, such as the TAB or LF a space came from. Null otherwise.
// `texts` holds each segment's text, `starts` where it starts in `normalized`, and `flags` its
// flags byte: its kind, UNBROKEN where the engine's scan gives no break before text, zero-width
// glue or a control, other than at a line start, and where tabs don't hang before a tab or
// the spaces after one, RETURNABLE at the other segments of text with such a boundary, which
// `hasUnbroken` tells, and ONE_CLUSTER where the scan has clusters of its own.
export type TextAnalysis = {
  normalized: string
  spaceSources: Uint16Array | null
  texts: string[]
  starts: number[]
  flags: number[]
  hasUnbroken: boolean
}

export type AnalysisProfile = {
  lineBreakScan: 'blink' | 'webkit' | 'gecko'
  graphemeTable: GraphemeTable
  hangTabs: boolean
}

// The items of a rich-inline paragraph in its text (src/rich-inline.ts): where each starts there,
// whether it is atomic, one U+FFFC in the text, as Blink and Gecko put an atomic inline in a
// paragraph's text (inline_node.cc:408-422, nsBidiPresUtils.cpp:1385-1396), and whether the engine
// transforms segment breaks in each item's text apart (EngineProfile,
// transformsSegmentBreaksAcrossItems). Every item starts a segment, and an atomic item is a segment
// with a break on both sides. The analysis leaves in `sourceOffsets` the offset in the text that
// each unit of its normalized text comes from. `items` holds the items themselves, whose own texts
// WebKit's scan reads (getWebKitParagraphBreaks).
export type ParagraphItems = {
  items: readonly { text?: string }[]
  starts: number[]
  atomic: boolean[]
  ownSegmentBreaks: boolean
  sourceOffsets: Int32Array | null
}
