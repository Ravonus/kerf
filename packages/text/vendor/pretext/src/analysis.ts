import { isDiscardable, isSpaceOrTabOrSegmentBreak, getGeckoLineBreaks } from './gecko-line-breaks.js'
import { BREAK, ITEM_START, SOFT_HYPHEN_BREAK, getWebKitBreakBetweenItems, getBlinkLineBreaks, getWebKitLineBreaks } from './line-breaks.js'
import type { AnalysisProfile, ParagraphItems, TextAnalysis, WhiteSpaceMode, WordBreakMode } from './analysis-types.js'
import { collapseWhitespaceNormal, getTrailingCollapsibleStart, isCollapsibleSpaceCode, normalizeWhitespacePreWrap, removeSkippableSegmentBreaks } from './analysis-whitespace.js'
import { mapSourceLineBreaks, segmentAtLineBreaks } from './analysis-segments.js'

export { TEXT, SPACE, ZERO_WIDTH_BREAK, SOFT_HYPHEN, PRESERVED_SPACE, TAB, ZERO_WIDTH_GLUE, CONTROL, HARD_BREAK, OBJECT, KIND_BITS, SPACED, UNBROKEN, RETURNABLE, ONE_CLUSTER, SEGMENT_KINDS } from './analysis-types.js'
export type { WhiteSpaceMode, WordBreakMode, SegmentBreakKind, SegmentKindCode, TextAnalysis, AnalysisProfile, ParagraphItems } from './analysis-types.js'
export { isCollapsibleSpaceCode, removeSkippableSegmentBreaks } from './analysis-whitespace.js'

const trimGeckoSource = (source: string, normalized: string, sourceBreaks: Uint8Array, leftOut: Uint8Array | null, preserve: boolean, dropsBidiControl: boolean, profile: AnalysisProfile): [string, string] => {
  // Gecko's white-space run reads through the soft hyphens and bidi controls in it, which its
  // text run drops, and keeps its segment break if it holds one, or else its first white space
  // (TransformWhiteSpaces, nsTextFrameUtils.cpp:151-193); the scan takes the text as one text
  // frame (transformText in src/gecko-line-breaks.ts). The white space the scan's text run left
  // out of such a run leaves the source too, and so does white space before only bidi controls
  // at the end, which the line end trims, and a CR or FF, which ends a run and takes no room
  // (the CR of a CRLF stays, to collapse into the line feed's space); white space on its two
  // sides then touches and is one space, where Firefox keeps two.
  // The other units keep their breaks: none is at white space, and the unit after a CR or FF
  // has its own, as a CR is one of nsLineBreaker's breakable spaces, whose run gives the unit
  // after it a break (IsSegmentSpace, nsLineBreaker.h:260-264; nsLineBreaker.cpp:318-327), and
  // an FF is UAX #14's BK, which the word breaker breaks after. Only a combining mark there has
  // none, since a break inside a cluster holds only after a space (SetPotentialLineBreaks,
  // gfxTextRun.cpp:219-226), so the break Firefox has before the CR is lost (ENGINE_FOLLOWUPS.md).
  // Where the white space right after a soft hyphen leaves, the break after it stays that white
  // space's, which draws no hyphen (SOFT_HYPHEN_BREAK): Gecko hyphenates only at a soft hyphen
  // that ends what its text run left out (GetHyphenationBreaks, nsTextFrame.cpp:4436-4443).
  const trailing = !preserve && (dropsBidiControl || leftOut !== null) ? getTrailingCollapsibleStart(source, 0, profile) : source.length
  if (leftOut !== null || trailing < source.length) {
    // A run that goes on into that trailing white space and keeps its one white space there, as
    // a segment break after a soft hyphen, keeps its first white space instead: the text before
    // the trailing white space holds the run's space, as a rich-inline paragraph's run keeps the
    // white space of the item it starts in (transformText in src/gecko-line-breaks.ts).
    let runSpace = -1
    if (leftOut !== null && trailing < source.length) {
      for (let i = trailing - 1; i >= 0; i--) {
        const code = source.charCodeAt(i)
        if (!isSpaceOrTabOrSegmentBreak(code) && !isDiscardable(code, false)) break
        if (isSpaceOrTabOrSegmentBreak(code) && leftOut[i] !== 1) {
          runSpace = -1
          break
        }
        if (isSpaceOrTabOrSegmentBreak(code)) runSpace = i
      }
    }
    // Only the units from the first one that leaves move.
    const from = leftOut === null ? trailing : 0
    let kept = ''
    let copied = 0
    let count = from
    let last = from - 1
    for (let i = from; i < source.length; i++) {
      if (i < trailing ? leftOut !== null && leftOut[i] === 1 && i !== runSpace : isCollapsibleSpaceCode(source.charCodeAt(i))) {
        kept += source.slice(copied, i)
        copied = i + 1
        continue
      }
      const breakBefore = sourceBreaks[i]!
      sourceBreaks[count++] = last >= 0 && last < i - 1 && (breakBefore & BREAK) !== 0 && source.charCodeAt(last) === 0x00AD ? breakBefore | SOFT_HYPHEN_BREAK : breakBefore
      last = i
    }
    sourceBreaks[count] = sourceBreaks[source.length]!
    source = kept + source.slice(copied)
    normalized = collapseWhitespaceNormal(source)
  }
  return [source, normalized]
}

const clearAtomicBreaks = (source: string, sourceBreaks: Uint8Array, paragraph: ParagraphItems | null, scanStarts: number[] | null): void => {
  // Gecko's line breaker starts again after an atomic frame (BuildTextRunsScanner::ScanFrame,
  // nsTextFrame.cpp:2248-2251, 2264-2268), so the text after one has no break of the scan's at
  // its start, where the scan finds one after the U+FFFC: a soft hyphen that starts that text
  // hyphenates there, and the break after the atomic item comes before it (markItemStarts).
  if (paragraph !== null) {
    for (let k = 0; k < paragraph.atomic.length; k++) {
      if (!paragraph.atomic[k]) continue
      let after = scanStarts![k]! + 1
      while (after < source.length && isDiscardable(source.charCodeAt(after), false)) after++
      sourceBreaks[after] = sourceBreaks[after]! & ~SOFT_HYPHEN_BREAK
    }
  }
}

export function analyzeText(
  text: string,
  profile: AnalysisProfile,
  whiteSpace: WhiteSpaceMode = 'normal',
  wordBreak: WordBreakMode = 'normal',
  // Preparation's language (getPreparationLanguage), which picks Chrome's and WebKit's
  // line tables, WebKit's quotation remap and Gecko's rule for newlines next to East
  // Asian punctuation.
  language: string | null = null,
  // The items of the rich-inline paragraph whose text this is, else null.
  paragraph: ParagraphItems | null = null,
): TextAnalysis {
  const preserve = whiteSpace === 'pre-wrap'
  // Where each of a paragraph's items starts in the source the engine scans.
  const scanStarts: number[] | null = paragraph === null ? null : []
  // The source a text node's engine scans, after the segment break transformation.
  let source = preserve ? text
    : paragraph !== null && paragraph.ownSegmentBreaks ? removeItemsSkippableSegmentBreaks(text, paragraph.starts, profile, language, scanStarts!)
    : removeSkippableSegmentBreaks(text, profile, language)
  if (paragraph !== null && scanStarts!.length === 0) for (let k = 0; k < paragraph.starts.length; k++) scanStarts!.push(paragraph.starts[k]!)
  let normalized = preserve ? normalizeWhitespacePreWrap(text) : collapseWhitespaceNormal(source)
  const keepAll = wordBreak === 'keep-all'
  let breaks: Uint8Array
  let spaceSources: Uint16Array | null = null
  let dropsBidiControl = false
  if (profile.lineBreakScan === 'blink') {
    breaks = getBlinkLineBreaks(normalized, keepAll, language)
  } else {
    // WebKit and Gecko scan the source. Gecko's scan collapses its white space as Firefox does.
    let sourceBreaks: Uint8Array
    if (profile.lineBreakScan === 'webkit') {
      sourceBreaks = paragraph === null ? getWebKitLineBreaks(source, preserve, keepAll, language) : getWebKitParagraphBreaks(source, paragraph, preserve, keepAll, language)
      // A CR is no white space to WebKit (moveToNextNonWhitespacePosition, InlineItemsBuilder.cpp:
      // 55-73) and stays in its text item with no advance and no letter spacing: Core Text's
      // shaping gives its glyph none (CTFontShapeGlyphs, from Font::applyTransforms,
      // FontCoreText.cpp:617-699; the complex path at ComplexTextController.cpp:762-768), and only
      // a character that advances is spaced (WidthIterator.cpp:508-516). Every Canvas measures
      // it as a space, so the source leaves it out, as the Gecko profile's does below, and white
      // space on its two sides is one space, where Safari keeps two. The scan read it, so the
      // unit after it keeps its own break: ICU's, after the CR, where the scan takes it, as before
      // a letter above U+00FF, and none elsewhere, its table having none beside a control
      // (BreakablePositions.h:179-187, 238-251; RESEARCH.md, Engine Facts, Safari (WebKit), CR and
      // FF, has where). That unit also takes the CR's break, the one after white space. The CR of a
      // CRLF stays, to collapse into the line feed's space; in a paragraph that is also a CR that
      // ends an item before a line feed that starts the next, whose space is the line feed's item's
      // (alignToSource). In the installed fonts that take WebKit's fixed-pitch shortcut, Menlo
      // and so the generic monospace among them, text on simplified measuring is as wide as its
      // characters are many, the CR among them (Font::determinePitch, FontCoreText.cpp:753-785;
      // widthForSimpleTextWithFixedPitch, FontCascade.cpp:414-421), which Canvas can't show, so
      // the profile gives those fonts up (RESEARCH.md, Decisions Log, 2026-10-06;
      // ENGINE_FOLLOWUPS.md, White space and controls).
      if (!preserve && source !== normalized && /\r(?!\n)/.test(source)) {
        let count = 0
        for (let i = 0; i < source.length; i++) {
          if (source.charCodeAt(i) !== 0x0D || source.charCodeAt(i + 1) === 0x0A) sourceBreaks[count++] = sourceBreaks[i]!
          else sourceBreaks[i + 1] = sourceBreaks[i + 1]! | sourceBreaks[i]!
        }
        sourceBreaks[count] = sourceBreaks[source.length]!
        source = source.replace(/\r(?!\n)/g, '')
        normalized = collapseWhitespaceNormal(source)
      }
    } else {
      const gecko = getGeckoLineBreaks(source, preserve, keepAll, profile.graphemeTable, scanStarts)
      dropsBidiControl = gecko.dropsBidiControl
      sourceBreaks = gecko.breaks
      clearAtomicBreaks(source, sourceBreaks, paragraph, scanStarts)
      ;[source, normalized] = trimGeckoSource(source, normalized, sourceBreaks, gecko.leftOut, preserve, dropsBidiControl, profile)

    }
    if (profile.lineBreakScan === 'webkit' && !preserve && source !== normalized) spaceSources = new Uint16Array(normalized.length)
    breaks = source === normalized ? sourceBreaks : mapSourceLineBreaks(source, normalized.length, sourceBreaks, whiteSpace, spaceSources)
  }
  if (paragraph !== null) markItemStarts(text, normalized, breaks, paragraph, profile.lineBreakScan)
  return segmentAtLineBreaks(normalized, spaceSources, breaks, whiteSpace, profile.lineBreakScan, profile.hangTabs, dropsBidiControl)
}

// A paragraph's text after each item's own segment break transformation, where the engine
// transforms segment breaks in each text frame's text apart (ParagraphItems), and in
// `resultStarts` where each item starts in it.
function removeItemsSkippableSegmentBreaks(text: string, starts: number[], profile: AnalysisProfile, language: string | null, resultStarts: number[]): string {
  if (profile.lineBreakScan === 'webkit' || !text.includes('\n')) return text
  let result = ''
  // Where the text that isn't in `result` yet starts. Only an item that holds a line feed can
  // change, so only those are cut out and transformed, and the text between two that changed is
  // copied in one piece.
  let copied = 0
  let newline = text.indexOf('\n')
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k]!
    const end = k + 1 < starts.length ? starts[k + 1]! : text.length
    resultStarts.push(result.length + start - copied)
    if (newline < 0 || newline >= end) continue
    const item = text.slice(start, end)
    const transformed = removeSkippableSegmentBreaks(item, profile, language)
    if (transformed.length !== item.length) {
      result += text.slice(copied, start) + transformed
      copied = end
    }
    newline = text.indexOf('\n', end)
  }
  return copied === 0 ? text : result + text.slice(copied)
}

// The offset in `source` that each unit of `normalized` comes from. Normalization only removes
// white space and, in the Gecko profile, a CR or FF, and in the WebKit profile a lone CR, turns a
// run of white space into one space, which comes from the run's first unit, and turns CR, CRLF
// and FF into LF, so a greedy walk aligns the two. Under the WebKit and Gecko scans no space
// comes from a CR, nor under Gecko's from an FF, one right before the white space included:
// neither is white space to that engine (moveToNextNonWhitespacePosition,
// InlineItemsBuilder.cpp:55-73; IsSpaceOrTabOrSegmentBreak, nsTextFrameUtils.cpp:51-57), so the
// run starts after it, and the box that holds the run's first character has its space, in that
// box's font and letter spacing. WebKit makes a white-space item of its text box, as wide as
// that box's space (InlineItemsBuilder.cpp:947, 963-987), and takes out only white space that
// follows other white space, an earlier box's too (Line::appendText, InlineLine.cpp:357-365);
// Gecko transforms a frame at a time from the white-space state the frame before it left, which
// a CR or FF clears (nsTextFrameUtils.cpp:286-309, 382-386). So the space after a CR that ends
// an item is the next item's, as is the line feed of a CRLF split there, and a fragment that
// ends with a space after a CR ends after that space in its item's text, and one that starts
// with such a space starts at it. To Blink a CR is white space (Character::IsCollapsibleSpace,
// platform/text/character.h:150-153), its run's first unit, and an FF is still a space in the
// Blink and WebKit profiles.
export function alignToSource(source: string, normalized: string, scan: AnalysisProfile['lineBreakScan']): Int32Array {
  const offsets = new Int32Array(normalized.length)
  // The units no space comes from under `scan`, or -1.
  const cr = scan === 'blink' ? -1 : 0x0D
  const ff = scan === 'gecko' ? 0x0C : -1
  let i = 0
  for (let j = 0; j < normalized.length; j++) {
    const unit = normalized.charCodeAt(j)
    while (i < source.length) {
      const code = source.charCodeAt(i)
      if (code === unit || (isCollapsibleSpaceCode(code) && (unit === 0x20 ? code !== cr && code !== ff : unit === 0x0A))) break
      i++
    }
    offsets[j] = i++
    // CRLF became one LF.
    if (unit === 0x0A && source.charCodeAt(i - 1) === 0x0D && source.charCodeAt(i) === 0x0A) i++
  }
  return offsets
}

// Marks where each item of a paragraph starts in its normalized text (ITEM_START), at the first
// unit that comes from the item or from one after it, and a break on both sides of an atomic item,
// under keep-all too: Blink breaks after an atomic inline and before one (CanBreakAfterAtomicInline
// and CanBreakAfter, line_breaker.cc:1168-1263 in core/layout/inline), WebKit finds a soft wrap
// opportunity on either side of one (InlineFormattingUtils.cpp:445-449), and Gecko records a break
// after one and breaks before one that doesn't fit (nsLineLayout.cpp:1057-1068, 1339-1340).
function markItemStarts(text: string, normalized: string, breaks: Uint8Array, paragraph: ParagraphItems, scan: AnalysisProfile['lineBreakScan']): void {
  const offsets = paragraph.sourceOffsets = alignToSource(text, normalized, scan)
  const { starts, atomic } = paragraph
  for (let k = 0, j = 0; k < starts.length; k++) {
    while (j < normalized.length && offsets[j]! < starts[k]!) j++
    if (j === normalized.length) break
    breaks[j] = breaks[j]! | ITEM_START
    if (atomic[k] && offsets[j] === starts[k]) {
      breaks[j] = breaks[j]! | BREAK
      breaks[j + 1] = breaks[j + 1]! | BREAK | ITEM_START
    }
  }
}

// Where a line may start in a paragraph's source, in WebKit: it finds breaks inside each inline
// box from that box's own text, and at a boundary between boxes from the scan over the next box's
// text with the last two characters before it as prior context (TextUtil.cpp:374-396), so a
// paragraph's breaks are each item's own scan, joined by that check (getWebKitBreakBetweenItems).
// Collapsible white space on either side of a boundary breaks there, as inside a text, but a CR,
// which is no white space to WebKit: beside one the check decides. It takes the pair of a CR and
// a character up to U+00FF from its table, which has no break for it, so at a boundary only a
// character above U+00FF right after the CR brings ICU's break, where inside a text a letter above
// U+00FF before the CR can too, before an ASCII letter. The analysis then takes a lone CR out with
// the breaks found around it (analyzeText). The source is the items' texts joined as they are, an
// atomic item as one U+FFFC, which is never scanned (removeItemsSkippableSegmentBreaks leaves
// WebKit's text alone), so a scan takes an item's own text and nothing is cut out of the source
// before the scans.
function getWebKitParagraphBreaks(source: string, paragraph: ParagraphItems, preserve: boolean, keepAll: boolean, language: string | null): Uint8Array {
  const { items, starts, atomic } = paragraph
  const breaks = new Uint8Array(source.length + 1)
  let previous = -1
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k]!
    const end = k + 1 < starts.length ? starts[k + 1]! : source.length
    if (start === end) continue
    // An item of one unit, as a space between two styled words or an atomic item's U+FFFC, has
    // no break inside, and its scan marks its end only after a line or paragraph separator
    // (getWebKitLineBreaks), so only those are scanned.
    const first = source.charCodeAt(start)
    if (end - start > 1 || first === 0x2028 || first === 0x2029) {
      const itemBreaks = getWebKitLineBreaks(items[k]!.text!, preserve, keepAll, language)
      for (let i = 1; i <= end - start; i++) breaks[start + i] = itemBreaks[i]!
    }
    if (previous >= 0 && !atomic[k] && !atomic[previous]) {
      const last = source.charCodeAt(start - 1)
      const collapses = !preserve && ((first !== 0x0D && isCollapsibleSpaceCode(first)) || (last !== 0x0D && isCollapsibleSpaceCode(last)))
      if (collapses || getWebKitBreakBetweenItems(items[previous]!.text!, items[k]!.text!, keepAll, language)) breaks[start] = breaks[start]! | BREAK
    }
    previous = k
  }
  return breaks
}
