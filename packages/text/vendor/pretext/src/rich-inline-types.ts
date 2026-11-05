// Rich-inline types moved from @chenglou/pretext 1.0.0 rich-inline.ts.
import type { LayoutCursor, WordBreakMode } from './layout.js'
import type { WhiteSpaceMode } from './analysis.js'
import type { PreparedSegments } from './line-text.js'

declare const preparedRichInlineBrand: unique symbol

export type RichInlineItem = {
  text: string // Raw author text, including any leading/trailing collapsible spaces
  font: string // Canvas font shorthand used to prepare and measure this item
  letterSpacing?: number // Extra horizontal spacing between graphemes, in CSS px
  break?: 'normal' | 'never' // `never` keeps the item atomic, like a pill or mention chip
  extraWidth?: number // Caller-owned horizontal chrome, e.g. padding + border width
  width?: never // A RichInlineBox's
}

// An object inside a line that the app sizes and paints, such as an image, a custom emoji, a formula
// or a badge: an atomic inline with no text, as an <img> or an empty inline-block is, which a line
// can break before and after. An item without text is one.
export type RichInlineBox = {
  width: number // The room it takes on the line, in CSS px, at least 0 and final: its element's margin box
  text?: never
}

// How the paragraph the items make wraps, one setting for all of them, as CSS on the
// element that holds the spans sets it.
export type RichInlineOptions = {
  whiteSpace?: WhiteSpaceMode // `pre-wrap`: CSS `white-space: pre-wrap`, as prepare() takes it
  wordBreak?: WordBreakMode // `keep-all`: CSS `word-break: keep-all`, as prepare() takes it
}

export type PreparedRichInline = {
  readonly [preparedRichInlineBrand]: true
}

// A place in the paragraph: an item, and a segment and grapheme of that item's part of the
// paragraph's text, whose segments no app sees. What a line or a fragment range gives is for
// passing back. A materialized fragment's type has no cursors (RESEARCH.md, Decisions Log,
// 2026-10-10): its place in its item's text is its sourceStart and sourceEnd, and the line to
// pass back is the range it was materialized from.
export type RichInlineCursor = {
  itemIndex: number // Index into the items prepareRichInline() took
  segmentIndex: number
  graphemeIndex: number
}

export type RichInlineFragment = {
  itemIndex: number // Index into the items prepareRichInline() took
  text: string // Text slice for this fragment
  gapBefore: number // Collapsed inter-item gap paid before this fragment on this line
  gapItemIndex: number // Item whose collapsed whitespace made gapBefore, or -1 when no gap precedes this fragment on this line
  occupiedWidth: number // Text width plus the item's extraWidth contribution
  sourceStart: number // Where the fragment starts in its item's `text`, in UTF-16 units
  sourceEnd: number // Where it ends there
}

export type RichInlineFragmentRange = {
  itemIndex: number // Index into the items prepareRichInline() took
  gapBefore: number // Collapsed inter-item gap paid before this fragment on this line
  gapItemIndex: number // Item whose collapsed whitespace made gapBefore, or -1 when no gap precedes this fragment on this line
  occupiedWidth: number // Text width plus the item's extraWidth contribution
  start: LayoutCursor // Start cursor within the item's part of the paragraph
  end: LayoutCursor // End cursor within the item's part of the paragraph
}

// A materialized fragment as materializeRichInlineLineRange() builds it: with its range's
// cursors, which are off its type only (RESEARCH.md, Decisions Log, 2026-10-10).
export type InternalRichInlineFragment = RichInlineFragment & RichInlineFragmentRange

export type RichInlineLine = {
  fragments: RichInlineFragment[]
  width: number
  end: RichInlineCursor
}

export type RichInlineLineRange = {
  fragments: RichInlineFragmentRange[]
  width: number
  end: RichInlineCursor
}

export type RichInlineStats = {
  lineCount: number
  maxLineWidth: number
}

export type InternalPreparedRichInline = PreparedRichInline & {
  // The paragraph's handle, which the text walkers lay out. A paragraph of one text item that isn't
  // atomic and has no extraWidth is that text's own handle, as prepareWithSegments() makes it. Its
  // letterSpacing is the one its text items share, atomic ones aside; where they differ it is 0,
  // and each segment's width and advances hold its item's letter spacing after every grapheme.
  data: PreparedSegments
  // The only item with segments, where it has no extraWidth, so that every line is one fragment
  // of it, as wide as the line; else -1.
  onlyItem: number
  // The paragraph's line where nothing wraps it, which is its only one at any width it fits:
  // its width, null where it has no line or several, as with a hard break, and its start and end
  // segments (findWholeLine).
  wholeWidth: number | null
  wholeStart: number
  wholeEnd: number
  // Per item, its first segment in the paragraph, then the segment count: an item's segments are
  // those up to the next item's first.
  itemSegments: number[]
  // Per segment of a paragraph that isn't one text's handle, its item, and 1 where it is a
  // collapsed space at its item's start or end, which is the gap before the next fragment on its
  // line, else 0: a line's fragments are cut by them, with no search (createLine). Null for a
  // paragraph that is one text's handle.
  segmentItems: Int32Array | null
  gapSegments: Uint8Array | null
  // Whether each segment of such a paragraph is as wide on a line as its width, but the one a line
  // starts with or ends inside (createLine): no letter spacing the handle adds after a segment's
  // graphemes, no mark halted at its item's end, and no tab, whose advance depends on where the
  // line reaches it.
  plainWidths: boolean
  // Per segment, where its text starts and ends in its item's text, and, for a segment whose text
  // isn't one stretch of its item's, as where white space inside it was removed, where each of
  // its units is there, else null (null too where no segment has any). A paragraph that is one
  // text's handle finds them when a line is first materialized, from `text`, its item's; a
  // frozen one keeps them beside the handle, and these stay null (textSources).
  sourceStarts: number[] | null
  sourceEnds: number[] | null
  sourceUnits: (number[] | null)[] | null
  text: string
}
