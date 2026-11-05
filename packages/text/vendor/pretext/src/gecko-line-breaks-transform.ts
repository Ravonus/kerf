// Break opportunities as Firefox finds them: a port of how Gecko transforms a text node's
// white space, sets up its text run and breaks its words with nsLineBreaker over ICU4X's
// line iterator, with Firefox's baked line data and the Unicode properties Gecko reads,
// which scripts/generate-engine-break-data.ts writes to src/generated/engine-break-data.ts.
//
// Sources, cited as file:line:
// - Gecko in mozilla-firefox at Firefox 156.0 (3bf8f4682).
// - icu_segmenter 2.1.2 src/line.rs, byte-identical to Firefox's third_party/rust copy.
//
// Deliberate differences:
// - Grapheme clusters come from the profile's ICU character rules (src/graphemes.ts), Chrome's,
//   which give the clusters of icu_segmenter's GraphemeClusterSegmenter over Firefox's data, and
//   Unicode properties from RegExp \p{...} and generated tables.
// - Text runs don't split where the script changes (gfxScriptItemizer.cpp), nor where the bidi
//   level does: bidi resolution makes a text frame of each level run (nsBidiPresUtils.cpp:
//   1037-1053), and a text run doesn't go on across two (ContinueTextRunAcrossFrames,
//   nsTextFrame.cpp:2023-2030). Such a split only adds a cluster start, restarts clusters within
//   its word and ends a word after a space before a cluster extender, so a level split is missed
//   only inside a cluster, or after a space inside one: for example at a vowel killer of a
//   left-to-right script after an Arabic letter, or at a ZWJ that ends the paragraph after a
//   Hebrew letter, which rule L1 puts at the paragraph's level. Both ports were removed on
//   purpose (RESEARCH.md, Decisions Log, 2026-09-24 and 2026-10-01; ENGINE_FOLLOWUPS.md, Bidi
//   levels, direction and script runs).
// - Inside runs of Thai, Lao, Khmer and Myanmar letters, Intl.Segmenter word boundaries stand
//   in for ICU4X's LSTM models (line.rs:445-451, complex/mod.rs:135-156). Firefox's own
//   Intl.Segmenter answers as those models there once breaks inside grapheme clusters are
//   dropped, which setPotentialLineBreaks does.
// - The paragraph is left-to-right, since Pretext takes no direction, and word-break is
//   normal or keep-all under Strict line breaking, which line-break: auto selects
//   (intl/lwbrk/LineBreaker.cpp:26-31).

import { isBidiControl } from './graphemes.js'
import { DEFAULT_IGNORABLE, EMOJI, HANGUL, MARK, PUNCTUATION, getBreakLanguage, getClass, hasProperty, unpackClasses, type ClassTable } from './line-breaks.js'

export const CH_SHY = 0x00ad

export const isSurrogatePair = (a: number, b: number) => (a & 0xfc00) === 0xd800 && (b & 0xfc00) === 0xdc00
export const combine = (a: number, b: number) => 0x10000 + ((a - 0xd800) << 10) + (b - 0xdc00)

// East_Asian_Width H (2), F (3) or W (5), and 0 for any other value, which the first East Asian
// segment break test unpacks (isEastAsianSegmentBreak).
let eastAsianWidths: ClassTable | null = null

// --- Character classes ---

// nsUnicodeProperties.h:202-207, nsUnicodeProperties.cpp:130-138
export function isClusterExtender(cp: number): boolean {
  return cp >= 0x0300 && (hasProperty(cp, MARK) || cp === 0x200c || cp === 0x200d || (cp >= 0xff9e && cp <= 0xff9f) ||
    (cp >= 0x1f3fb && cp <= 0x1f3ff) || (cp >= 0xe0020 && cp <= 0xe007f))
}

// nsUnicodeProperties.h:211-214, nsUnicodeProperties.cpp:140-147
function isClusterExtenderExcludingJoiners(cp: number): boolean {
  return cp >= 0x0300 && (hasProperty(cp, MARK) || (cp >= 0xff9e && cp <= 0xff9f) || (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    (cp >= 0xe0020 && cp <= 0xe007f))
}

// UnicodeProperties.h:205-218
function isEastAsianWidthFHWExcludingEmoji(widths: ClassTable, cp: number): boolean {
  const width = getClass(widths, cp)
  return width === 2 || width === 3 || (width === 5 && !hasProperty(cp, EMOJI))
}

// nsUnicharUtils.cpp:500-504
function isSegmentBreakSkipChar(widths: ClassTable, cp: number): boolean {
  return isEastAsianWidthFHWExcludingEmoji(widths, cp) && !hasProperty(cp, HANGUL) && cp !== 0x20a9
}

// nsUnicharUtils.cpp:506-527, with UnicodeProperties.h:187-199
function isEastAsianPunctuation(widths: ClassTable, cp: number): boolean {
  return getClass(widths, cp) !== 0 && ((hasProperty(cp, PUNCTUATION) && cp !== 0x20a9) || cp === 0xff5e || cp === 0x3000)
}

// gfxFontGroup::IsInvalidChar(char16_t), gfxTextRun.h:975-992. Below U+0100 it answers as
// IsInvalidChar(uint8_t), gfxTextRun.h:971-973.
export function isInvalidChar(ch: number): boolean {
  if (ch >= 0x20 && ch < 0x7f) return false
  if (ch <= 0x9f) return true
  return ((ch & 0xff00) === 0x2000 && (ch === 0x200b || ch === 0x2028 || ch === 0x2029 || ch === 0x2060)) ||
    ch === 0xfeff || isBidiControl(ch)
}

// --- 1. TransformText (nsTextFrameUtils.cpp:84-401) ---

// Whether the text run leaves out a bidi control, which only 16-bit text does (IsDiscardable), is
// noted as it leaves them out, as IsDiscardable notes a soft hyphen (HasShy): testing the text for
// one before the scan costs every text a pass (RESEARCH.md, Keeping Work Bounded). `leftOut` is
// GeckoLineBreaks'.
type Transformed = { text: string, orig: Int32Array, skipped: Uint8Array, leftOut: Uint8Array | null, dropsBidiControl: boolean }

// IsDiscardable, nsTextFrameUtils.cpp:32-49
export function isDiscardable(ch: number, is8bit: boolean): boolean {
  return ch === CH_SHY || (!is8bit && isBidiControl(ch))
}
const isSpaceOrTab = (ch: number) => ch === 0x20 || ch === 0x09
// IsSpaceOrTabOrSegmentBreak, nsTextFrameUtils.cpp:51-57: a white-space run's white space, which a CR or FF isn't.
export const isSpaceOrTabOrSegmentBreak = (ch: number) => ch === 0x20 || ch === 0x09 || ch === 0x0a

// IsSpaceCombiningSequenceTail(const char16_t*, int32_t), nsTextFrameUtils.cpp:24-30, on code units.
export function isSpaceCombiningSequenceTail(text: string, from: number): boolean {
  for (let i = from; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (isClusterExtenderExcludingJoiners(ch)) return true
    if (!isBidiControl(ch)) return false
  }
  return false
}

// aLangIsJapaneseOrChinese, nsTextFrameUtils.cpp:273-285, which takes only `-` after the subtag.
export function isJapaneseOrChinese(language: string | null): boolean {
  const breakLanguage = getBreakLanguage(language)
  return (breakLanguage === 'ja' || breakLanguage === 'zh') && language!.charCodeAt(2) !== 0x5f
}

// Gecko's East Asian test for the white-space run [start, end) (TransformWhiteSpaces,
// nsTextFrameUtils.cpp:120-150): the code points before and after it, past default-ignorable
// ones, both segment-break skip characters, or on a `ja` or `zh` page either one East Asian
// punctuation. Only an interior run qualifies.
export function isEastAsianSegmentBreak(text: string, start: number, end: number, japaneseOrChinese: boolean): boolean {
  if (start === 0 || end >= text.length) return false
  const widths = eastAsianWidths ??= unpackClasses('gecko/east_asian_width')
  let before: number
  let pos = start
  do {
    const low = text.charCodeAt(pos - 1)
    const high = pos > 1 ? text.charCodeAt(pos - 2) : 0
    if (isSurrogatePair(high, low)) { before = combine(high, low); pos -= 2 } else { before = low; pos-- }
  } while (hasProperty(before, DEFAULT_IGNORABLE) && pos > 0)
  let after: number
  pos = end
  do {
    after = text.codePointAt(pos)!
    pos += after > 0xffff ? 2 : 1
  } while (hasProperty(after, DEFAULT_IGNORABLE) && pos < text.length)
  return (isSegmentBreakSkipChar(widths, before) && isSegmentBreakSkipChar(widths, after)) ||
    (japaneseOrChinese && (isEastAsianPunctuation(widths, before) || isEastAsianPunctuation(widths, after)))
}

// The scan transforms a text node's text as one text frame's. Firefox transforms a frame at a
// time, each from the white-space state the frame before it left (mNextRunContextInfo,
// nsTextFrame.cpp:2515-2518), and bidi resolution splits a text node into a frame for each level
// run (nsBidiPresUtils.cpp:1037-1053). A frame that starts at a character the text run drops ends
// the white-space run there (nsTextFrameUtils.cpp:370-379), and a line's start trims the white
// space a frame starts with while the line holds nothing (nsTextFrame.cpp:10904-10944). A
// dropped character starts a frame only where it is a bidi control that starts a level run, and
// whether one does turns on the paragraph's direction, which Pretext doesn't take: after a
// space, U+200F between Latin words starts one in a left-to-right paragraph and none in a
// right-to-left one, and U+200E between Hebrew words the other way around. So a white-space run
// reads through every character the text run drops. That is Firefox's run wherever the control
// keeps the level of the white space before it, as a mark of the paragraph's own direction does
// outside an embedding or isolate; ENGINE_FOLLOWUPS.md, White space and controls, has the rest.
// A rich-inline paragraph's items are text frames too: `frameStarts` has where each starts in the
// input, in order, or is null for one text. A white-space run goes on from one frame into white
// space that starts the next (INCOMING_WHITESPACE, :286, :382-386), whose own scan ends with its
// frame, and a dropped character that starts a frame ends it, as it follows no white space in
// that frame. In 16px Arial at 56px Firefox fits `see this` of items `see`, ` \u00AD`,
// ` this word` on a 55.15px line, and not of `see `, `\u00AD `, `this word`, whose text in one node
// it fits.
    // A CR or FF is no white space to TransformText (:51-57), so it ends a white-space run and
    // stays in the text run, which gives it no glyph and no advance: it skips a control
    // character it doesn't draw as a hexbox, which is never CR and, in release and beta builds,
    // no other one either (gfxFont::SplitAndInitTextRun, gfxFont.cpp:3620-3627 and :3874-3892;
    // layout.css.control-characters.visible, StaticPrefList.yaml:10926-10929). Every Canvas
    // measures it as a space (Firefox's: CanvasRenderingContext2D.cpp:4634-4637), so a layout
    // of the source leaves it out. Kept as a control of no advance, as the profile keeps the
    // other controls Firefox hides (hidesControlCharacters), it is text at a line's edges,
    // where Firefox trims it, and takes text with CRLF off the simple line walk (RESEARCH.md,
    // Dead Ends). A CR right before a line feed needs no mark: the run that starts there keeps
    // that line feed, and the CR, a breakable space to the scan too, collapses into it.
const collapseText = (input: string, is8bit: boolean, frameStarts: number[] | null, orig: Int32Array, skipped: Uint8Array): [number, Uint8Array | null, boolean] => {
  const len = input.length
  let n = 0
  let leftOut: Uint8Array | null = null
  let dropsBidiControl = false
  // COMPRESS_WHITESPACE_NEWLINE, :272-387
  let inWhitespace = false
  let i = 0
  // Where the frame a white-space run starts in ends, the next frame start past the run's start:
  // the input's end for one text. Only a run reads it, so it is found where one starts.
  let frame = 0
  let frameEnd = frameStarts === null ? len : 0
  while (i < len) {
    const ch = input.charCodeAt(i)
    if (!isSpaceOrTabOrSegmentBreak(ch) && !isDiscardable(ch, is8bit)) {

      if (ch === 0x0c || (ch === 0x0d && input.charCodeAt(i + 1) !== 0x0a)) (leftOut ??= new Uint8Array(len))[i] = 1
      orig[n++] = i
      inWhitespace = false
      i++
      continue
    }
    if (isSpaceOrTabOrSegmentBreak(ch)) {
      if (i >= frameEnd) {
        while (frame < frameStarts!.length && frameStarts![frame]! <= i) frame++
        frameEnd = frame < frameStarts!.length ? frameStarts![frame]! : len
      }
      let keepLastSpace = false
      let hasSegmentBreak = ch === 0x0a
      let trailingDiscardables = 0
      // How many characters the run holds that the text run drops.
      let dropped = 0
      // A run that goes on from the frame before, after the characters that frame's run dropped at
      // its end, leaves out white space that doesn't touch the unit the run kept.
      const goesOnPastDropped = inWhitespace && i > 0 && isDiscardable(input.charCodeAt(i - 1), is8bit)
      let j = i + 1
      for (; j < frameEnd; j++) {
        const c = input.charCodeAt(j)
        if (c === 0x0a) hasSegmentBreak = true
        else if (isDiscardable(c, is8bit)) dropped++
        else if (!isSpaceOrTab(c)) break
      }
      while (isDiscardable(input.charCodeAt(j - 1), is8bit)) { j--; trailingDiscardables++ } // :334-336
      if (!is8bit && input.charCodeAt(j - 1) === 0x20 && j < frameEnd && isSpaceCombiningSequenceTail(input, j)) { keepLastSpace = true; j-- } // :339-345
      // TransformWhiteSpaces over [i, j), :84-209. The runs it deletes whole, next to a ZWSP or
      // between East Asian characters (:120-150), are gone already (removeSkippableSegmentBreaks in
      // src/analysis.ts), so a run keeps one space. A space or tab in a run with a segment break
      // goes (:152-162), and the run's first segment break stays as a space (:181-193).
      for (let k = i; k < j; k++) {
        const c = input.charCodeAt(k)
        if (isDiscardable(c, is8bit)) {
          skipped[k] = 1
          dropsBidiControl ||= c !== CH_SHY
        } else if (inWhitespace || (hasSegmentBreak && isSpaceOrTab(c))) {
          skipped[k] = 1
          // Where the run reads through a dropped character, white space it leaves out may not
          // touch the unit it keeps, so collapsing adjacent white space wouldn't drop it.
          if (dropped > trailingDiscardables || goesOnPastDropped) (leftOut ??= new Uint8Array(len))[k] = 1
        } else {
          orig[n++] = k
          inWhitespace = true
        }
      }
      if (keepLastSpace) orig[n++] = j++
      for (let k = 0; k < trailingDiscardables; k++) {
        dropsBidiControl ||= input.charCodeAt(j) !== CH_SHY
        skipped[j++] = 1
      }
      i = j
      continue
    }
    skipped[i] = 1 // :370-379
    dropsBidiControl ||= ch !== CH_SHY
    inWhitespace = false
    i++
  }
  return [n, leftOut, dropsBidiControl]
}

export function transformText(input: string, is8bit: boolean, preserveWhiteSpace: boolean, frameStarts: number[] | null): Transformed {
  const len = input.length
  // The source index of each kept unit.
  const orig = new Int32Array(len)
  const skipped = new Uint8Array(len)
  let leftOut: Uint8Array | null = null
  let n = 0
  let dropsBidiControl = false
  if (preserveWhiteSpace) {
    // COMPRESS_NONE, nsTextFrameUtils.cpp:222-271
    for (let i = 0; i < len; i++) {
      const ch = input.charCodeAt(i)
      if (!isDiscardable(ch, is8bit)) {
        orig[n++] = i
      } else {
        skipped[i] = 1
        dropsBidiControl ||= ch !== CH_SHY
      }
    }
  } else {
    ;[n, leftOut, dropsBidiControl] = collapseText(input, is8bit, frameStarts, orig, skipped)
  }
  // The kept units, as slices of the input where they run unchanged: in collapsed white space, a kept
  // tab or segment break becomes a space.
  let text = ''
  let sliceStart = 0
  let sliceEnd = 0
  for (let k = 0; k < n; k++) {
    const i = orig[k]!
    const ch = input.charCodeAt(i)
    if (!preserveWhiteSpace && (ch === 0x09 || ch === 0x0a)) {
      text += input.slice(sliceStart, sliceEnd) + ' '
      sliceStart = sliceEnd = i + 1
    } else if (i !== sliceEnd) {
      text += input.slice(sliceStart, sliceEnd)
      sliceStart = i
      sliceEnd = i + 1
    } else {
      sliceEnd++
    }
  }
  text += input.slice(sliceStart, sliceEnd)
  return { text, orig: orig.subarray(0, n), skipped, leftOut, dropsBidiControl }
}

// IsTrimmableSpace, nsTextFrame.cpp:921-942, in normal white space.
function isTrimmableSpace(source: string, pos: number, is8bit: boolean): boolean {
  switch (source.charCodeAt(pos)) {
    case 0x20: case 0x1680: return is8bit || !isSpaceCombiningSequenceTail(source, pos + 1)
    case 0x0a: case 0x09: case 0x0d: case 0x0c: return true
    default: return false
  }
}

// HasCompressedLeadingWhitespace, nsTextFrame.cpp:2869-2887
export function hasCompressedLeadingWhitespace(source: string, skipped: Uint8Array, is8bit: boolean, preserveWhiteSpace: boolean): boolean {
  if (preserveWhiteSpace || skipped[0] === 0) return false
  for (let k = 0; k < source.length && skipped[k] === 1; k++) if (isTrimmableSpace(source, k, is8bit)) return true
  return false
}

// --- 2. Text-run glyph records (gfxTextRun.cpp, gfxFont.cpp) ---
//
// Only the facts SetPotentialLineBreaks reads are recorded: which positions start a cluster and
// which are spaces. Every position belongs to one shaped word, space or invalid character.
