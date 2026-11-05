// Empty-object and hyphen facts moved from @chenglou/pretext 1.0.0 rich-inline.ts.
import { isCollapsibleSpaceCode, HARD_BREAK, KIND_BITS, OBJECT, PRESERVED_SPACE, SOFT_HYPHEN, SPACE, SPACED, TAB, TEXT, ZERO_WIDTH_BREAK, ZERO_WIDTH_GLUE } from '../analysis.js'
import type { PreparedSegments } from '../line-text.js'
import type { ParagraphSegmentData } from '../line-break.js'
import { zeros } from '../measurement.js'
import type { RichInlineItem, RichInlineBox } from '../rich-inline-types.js'

export function getHyphenRooms(hyphenWidths: number[], itemSegments: number[], segmentItems: Int32Array): number[] {
  const rooms: number[] = []
  for (let i = 0; i < segmentItems.length; i++) {
    const index = segmentItems[i]!
    rooms.push(i === itemSegments[index] ? 0 : hyphenWidths[index]!)
  }
  rooms.push(0)
  return rooms
}

// A soft hyphen, as a segment of any kind: Gecko drops soft hyphens from a text frame's text
// (IsDiscardable, nsTextFrameUtils.cpp:32-49).
function isSoftHyphenSegment(data: PreparedSegments, i: number): boolean {
  const kind = data.segmentFlags[i]! & KIND_BITS
  return kind === SOFT_HYPHEN || ((kind === ZERO_WIDTH_BREAK || kind === ZERO_WIDTH_GLUE) && data.segments[i]!.charCodeAt(0) === 0x00AD)
}

// What a line reads of the text around each object of width 0 where the engine places one though
// it sticks out of the line, as Gecko does an empty frame (ParagraphSegmentData;
// walkPreparedComplexLines has when it sticks out). Each item is a text frame.
// - The white space that ends the text before the object, read past the soft hyphens Gecko
//   drops. Gecko's line breaker leaves a break at the end of a text run that ends in a space or a
//   tab, whatever its advance (nsLineBreaker::Reset, nsLineBreaker.cpp:710-719; IsSegmentSpace,
//   nsLineBreaker.h:260-264), and the run's last frame breaks the line there where it ends past the
//   line's end without its own trailing spaces (nsTextFrame.cpp:11443-11456), which a tab isn't
//   among (gfxTextRun.cpp:1152-1160). So a collapsed space counts as that frame's own where it is
//   in the item right before the object; one in an item before that, as before an item of soft
//   hyphens alone, an empty frame, is inside the line's width. Preserved spaces that end their
//   item hang, which the line's width leaves out already. Preserved spaces before the soft hyphens
//   that end their item hang in Firefox and not here, so they aren't read as white space
//   (ENGINE_FOLLOWUPS.md).
// - Whether a line with a break before the object goes back to it. The break comes after white
//   space, after an atomic item (nsLineLayout.cpp:1057-1069) and after a soft hyphen that ends the
//   frame before the object, whatever the hyphen's width (HasSoftHyphenBefore,
//   nsTextFrame.cpp:11432-11439); other text leaves no break at its end, so the line's first break
//   is the one after the object, which stays. The break after a frame that sticks out doesn't count
//   as one that fits (nsLineLayout.cpp:1260), and the line remembers its last break that fits
//   (NotifyOptionalBreakPosition, :1506-1513), so a text frame or a span with a width that comes
//   next sticks out too and sends the line back to before the object (:1323-1334;
//   nsBlockFrame.cpp:5361-5379). The object stays where the line ends without going back: at the
//   paragraph's end, before an atomic item with a width, which moves down whole (:1337-1341), and
//   before unpadded text whose first piece has no width. A text frame that doesn't fit ends at its
//   first break, whether or not that fits (gfxTextRun::BreakAndMeasureText, gfxTextRun.cpp:1091-1099,
//   1177-1185), so its first piece is all of it on this line: a ZWSP, a hard break, preserved
//   spaces, which hang, or the collapsed space that starts the text's own node, trimmed where the
//   frame breaks after it (nsTextFrame.cpp:11202-11213). Padding is its span's width whatever the
//   text starts with. White space in a node of its own has no break inside, so its frame is whole
//   and keeps its width, as is a node of white space and soft hyphens. An item of soft hyphens
//   alone takes no room and is passed over, as is each object of width 0, which stays for the same
//   reason as the first: one answer serves a run of them, found from the paragraph's end back.
//   White space that ends the paragraph in a node of its own gets no frame
//   (nsCSSFrameConstructor.cpp:5278-5286), and after other text of its item, as after soft
//   hyphens, it is that frame's width.
export function setEmptyObjectFacts(
  segmentData: ParagraphSegmentData,
  data: PreparedSegments,
  items: Array<RichInlineItem | RichInlineBox>,
  itemSegments: number[],
  segmentItems: Int32Array,
  source: string,
  starts: number[],
): void {
  const { segmentFlags, widths, letterSpacing } = data
  const count = segmentFlags.length
  const spaces = zeros(count)
  const returns = new Uint8Array(count)
  // The item whose white space ends the paragraph's text after other text of its own, or -1.
  let runStart = source.length
  while (runStart > 0 && isCollapsibleSpaceCode(source.charCodeAt(runStart - 1))) runStart--
  let endSpaceItem = -1
  if (runStart < source.length) {
    let index = starts.length - 1
    while (index > 0 && starts[index]! > runStart) index--
    if (itemSegments[index]! < itemSegments[index + 1]!) endSpaceItem = index
  }
  // Whether what follows an object keeps it on its line, for an object right before the item at
  // hand, from the paragraph's end back.
  let keeps = true
  for (let index = items.length - 1; index >= 0; index--) {
    const first = itemSegments[index]!
    const end = itemSegments[index + 1]!
    if (first === end) continue
    const kind = segmentFlags[first]! & KIND_BITS
    const item = items[index]!
    if (item.text === undefined || item.break === 'never') {
      if (widths[first] !== 0) {
        keeps = true
        continue
      }
      let before = first - 1
      while (before >= 0 && isSoftHyphenSegment(data, before)) before--
      const beforeKind = before < 0 ? TEXT : segmentFlags[before]! & KIND_BITS
      let space = -1
      if (beforeKind === SPACE) space = segmentItems[before] === segmentItems[first - 1] ? widths[before]! + ((segmentFlags[before]! & SPACED) !== 0 ? letterSpacing : 0) : 0
      else if (beforeKind === TAB || (beforeKind === PRESERVED_SPACE && segmentItems[before] !== segmentItems[before + 1])) space = 0
      spaces[first] = space
      const lastKind = first === 0 ? TEXT : segmentFlags[first - 1]! & KIND_BITS
      if (!keeps && (space >= 0 || lastKind === OBJECT || lastKind === SOFT_HYPHEN)) returns[first] = 1
      continue
    }
    if (endSpaceItem === index) keeps = false
    let softHyphens = true
    let holdsSpace = false
    let establishesLine = false
    for (let i = first; i < end; i++) {
      if (isSoftHyphenSegment(data, i)) continue
      softHyphens = false
      if ((segmentFlags[i]! & KIND_BITS) === SPACE) holdsSpace = true
      else establishesLine = true
    }
    if (softHyphens) continue
    if ((item.extraWidth ?? 0) > 0 || (holdsSpace && !establishesLine)) keeps = false
    else if (kind === SPACE) keeps = true
    else keeps = (kind === ZERO_WIDTH_BREAK && !isSoftHyphenSegment(data, first)) || kind === HARD_BREAK || kind === PRESERVED_SPACE
  }
  segmentData.emptyObjectSpaces = spaces
  segmentData.emptyObjectReturns = returns
}
