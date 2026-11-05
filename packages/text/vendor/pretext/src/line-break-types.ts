// Line data types moved from @chenglou/pretext 1.0.0 line-break.ts.

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
