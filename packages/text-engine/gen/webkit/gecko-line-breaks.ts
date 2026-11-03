import { __packs, __missing } from './packs.js'
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

import {
  geckoLineBreakStatesPacked,
  geckoLineEotProperty,
  geckoLineLastCodepointProperty,
  geckoLinePropertyCount,
} from './generated/engine-break-data.js'
import { findGraphemeEnds, isBidiControl, type GraphemeTable } from './graphemes.js'
import {
  BREAK as OPPORTUNITY,
  CLUSTER_START,
  DEFAULT_IGNORABLE,
  EMOJI,
  HANGUL,
  MARK,
  PUNCTUATION,
  SOFT_HYPHEN_BREAK,
  getBreakLanguage,
  getClass,
  getWordSegmenter,
  hasProperty,
  unpackClasses,
  unpackTable,
  type ClassTable,
} from './line-breaks.js'

export const CH_SHY = 0x00ad

export const isSurrogatePair = (a: number, b: number) => (a & 0xfc00) === 0xd800 && (b & 0xfc00) === 0xdc00
export const combine = (a: number, b: number) => 0x10000 + ((a - 0xd800) << 10) + (b - 0xdc00)

// East_Asian_Width H (2), F (3) or W (5), and 0 for any other value, which the first East Asian
// segment break test unpacks (isEastAsianSegmentBreak).
export let eastAsianWidths: ClassTable | null = null

// --- Character classes ---

// nsUnicodeProperties.h:202-207, nsUnicodeProperties.cpp:130-138
export function isClusterExtender(cp: number): boolean {
  return (__packs.isClusterExtender ?? __missing('rare', 'isClusterExtender'))(cp)
}

// nsUnicodeProperties.h:211-214, nsUnicodeProperties.cpp:140-147
export function isClusterExtenderExcludingJoiners(cp: number): boolean {
  return (__packs.isClusterExtenderExcludingJoiners ?? __missing('rare', 'isClusterExtenderExcludingJoiners'))(cp)
}

// UnicodeProperties.h:205-218
export function isEastAsianWidthFHWExcludingEmoji(widths: ClassTable, cp: number): boolean {
  return (__packs.isEastAsianWidthFHWExcludingEmoji ?? __missing('rare', 'isEastAsianWidthFHWExcludingEmoji'))(widths, cp)
}

// nsUnicharUtils.cpp:500-504
export function isSegmentBreakSkipChar(widths: ClassTable, cp: number): boolean {
  return (__packs.isSegmentBreakSkipChar ?? __missing('rare', 'isSegmentBreakSkipChar'))(widths, cp)
}

// nsUnicharUtils.cpp:506-527, with UnicodeProperties.h:187-199
export function isEastAsianPunctuation(widths: ClassTable, cp: number): boolean {
  return (__packs.isEastAsianPunctuation ?? __missing('rare', 'isEastAsianPunctuation'))(widths, cp)
}

// gfxFontGroup::IsInvalidChar(char16_t), gfxTextRun.h:975-992. Below U+0100 it answers as
// IsInvalidChar(uint8_t), gfxTextRun.h:971-973.
export function isInvalidChar(ch: number): boolean {
  return (__packs.isInvalidChar ?? __missing('rare', 'isInvalidChar'))(ch)
}

// --- 1. TransformText (nsTextFrameUtils.cpp:84-401) ---

// Whether the text run leaves out a bidi control, which only 16-bit text does (IsDiscardable), is
// noted as it leaves them out, as IsDiscardable notes a soft hyphen (HasShy): testing the text for
// one before the scan costs every text a pass (RESEARCH.md, Keeping Work Bounded). `leftOut` is
// GeckoLineBreaks'.
export type Transformed = { text: string, orig: Int32Array, skipped: Uint8Array, leftOut: Uint8Array | null, dropsBidiControl: boolean }

// IsDiscardable, nsTextFrameUtils.cpp:32-49
export function isDiscardable(ch: number, is8bit: boolean): boolean {
  return (__packs.isDiscardable ?? __missing('rare', 'isDiscardable'))(ch, is8bit)
}
// moved to the "rare" pack: isSpaceOrTab
// IsSpaceOrTabOrSegmentBreak, nsTextFrameUtils.cpp:51-57: a white-space run's white space, which a CR or FF isn't.
export const isSpaceOrTabOrSegmentBreak = (ch: number) => ch === 0x20 || ch === 0x09 || ch === 0x0a

// IsSpaceCombiningSequenceTail(const char16_t*, int32_t), nsTextFrameUtils.cpp:24-30, on code units.
export function isSpaceCombiningSequenceTail(text: string, from: number): boolean {
  return (__packs.isSpaceCombiningSequenceTail ?? __missing('rare', 'isSpaceCombiningSequenceTail'))(text, from)
}

// aLangIsJapaneseOrChinese, nsTextFrameUtils.cpp:273-285, which takes only `-` after the subtag.
export function isJapaneseOrChinese(language: string | null): boolean {
  return (__packs.isJapaneseOrChinese ?? __missing('rare', 'isJapaneseOrChinese'))(language)
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
export function transformText(input: string, is8bit: boolean, preserveWhiteSpace: boolean, frameStarts: number[] | null): Transformed {
  return (__packs.transformText ?? __missing('rare', 'transformText'))(input, is8bit, preserveWhiteSpace, frameStarts)
}

// IsTrimmableSpace, nsTextFrame.cpp:921-942, in normal white space.
export function isTrimmableSpace(source: string, pos: number, is8bit: boolean): boolean {
  return (__packs.isTrimmableSpace ?? __missing('rare', 'isTrimmableSpace'))(source, pos, is8bit)
}

// HasCompressedLeadingWhitespace, nsTextFrame.cpp:2869-2887
export function hasCompressedLeadingWhitespace(source: string, skipped: Uint8Array, is8bit: boolean, preserveWhiteSpace: boolean): boolean {
  return (__packs.hasCompressedLeadingWhitespace ?? __missing('rare', 'hasCompressedLeadingWhitespace'))(source, skipped, is8bit, preserveWhiteSpace)
}

// --- 2. Text-run glyph records (gfxTextRun.cpp, gfxFont.cpp) ---
//
// Only the facts SetPotentialLineBreaks reads are recorded: which positions start a cluster and
// which are spaces. Every position belongs to one shaped word, space or invalid character.

export type Glyphs = { clusterStart: Uint8Array, isSpace: Uint8Array }

// CompressedGlyph::MakeComplex(false, true), gfxFont.cpp:716
export function extendCluster(g: Glyphs, i: number): void {
  return (__packs.extendCluster ?? __missing('rare', 'extendCluster'))(g, i)
}

// gfxShapedText::SetupClusterBoundaries(uint32_t, const char16_t*, uint32_t), gfxFont.cpp:708-769,
// for one shaped word, without the emergency wraps after hyphens. GraphemeClusterBreakIteratorUtf16
// reads the word alone (intl/lwbrk/Segmenter.cpp:174-187). Below U+0300 only CR and LF share a
// cluster, which the generator checks, and words hold neither, so a word of such units has a
// cluster at every unit. `ends` has room for the word's clusters.
export function setupClusterBoundaries(g: Glyphs, text: string, from: number, to: number, graphemeTable: GraphemeTable, ends: Int32Array): void {
  return (__packs.setupClusterBoundaries ?? __missing('rare', 'setupClusterBoundaries'))(g, text, from, to, graphemeTable, ends)
}

// gfxFont::SplitAndInitTextRun, gfxFont.cpp:3707-3900: sets up the shaped words of the text run. A
// word ends at a space or NBSP before no cluster extender (IsBoundarySpace, :3317-3330) or at an
// invalid character (:3778-3790). A space glyph (SetSpaceGlyphIfSimple, gfxTextRun.cpp:1612-1619)
// only sets isSpace, and an invalid character (:3877-3892) keeps a zero record. Below U+0100,
// IsBoundarySpace and SetupClusterBoundaries(uint8_t) (gfxFont.cpp:771-795) answer as the char16_t
// versions, so 8-bit text and 8-bit words take the char16_t path, at any word length (:3569-3577,
// :3817-3821).
export function splitAndInitTextRun(g: Glyphs, text: string, graphemeTable: GraphemeTable, ends: Int32Array): void {
  return (__packs.splitAndInitTextRun ?? __missing('rare', 'splitAndInitTextRun'))(g, text, graphemeTable, ends)
}

// --- 3. ICU4X 2.1.2's line iterator for one word (icu_segmenter src/line.rs) ---

// Firefox's line data, which the first scan unpacks (getGeckoLineBreaks).
export type LineData = { readonly classes: ClassTable, readonly states: Uint8Array }
export let lineData: LineData | null = null

// The Line_Break value, with error value 0 above U+10FFFF.
export function getLineBreakClass(line: LineData, c: number): number {
  return (__packs.getLineBreakClass ?? __missing('rare', 'getLineBreakClass'))(line, c)
}

// Line_Break property values of the data (line.rs:18-128).
// moved to the "rare" pack: AI, AL, BK, CJ, CM, CR, H2, H3, HY, ID, JL, JT, JV, LF, NL, NU, SA, SP, ZW, ZWJ
// BreakState bytes (provider/mod.rs:288-310).
// moved to the "rare" pack: BREAK, NO_MATCH, KEEP, INTERMEDIATE

// LanguageIteratorUtf16 (complex/language.rs:17-45, 78-102) reads single code units: Thai, Lao,
// Burmese, Khmer, or 0 for Unknown, and Chinese and Japanese, for which the LSTM segmenter has no
// model (complex/mod.rs:161-180).
export function getComplexLanguage(u: number): number {
  return (__packs.getComplexLanguage ?? __missing('rare', 'getComplexLanguage'))(u)
}

// complex_language_segment_utf16 (complex/mod.rs:135-156): splits a run of SA code units by
// language, and Intl.Segmenter words supply boundaries inside each Thai, Lao, Burmese and Khmer
// slice. Every slice reports its end; other languages report nothing else (:149-151).
export function segmentComplex(units: number[]): number[] {
  return (__packs.segmentComplex ?? __missing('rare', 'segmentComplex'))(units)
}

// KeepAll pairs (line.rs:901-907).
export function isKeepAllLetter(p: number): boolean {
  return (__packs.isKeepAllLetter ?? __missing('rare', 'isKeepAllLetter'))(p)
}

// Utf16Indices::next (indices.rs:58-83): the code point at text[i], in a pair that ends before `end`,
// or an unpaired surrogate as a code point of its own.
export function readCodePoint(text: string, i: number, end: number): number {
  return (__packs.readCodePoint ?? __missing('rare', 'readCodePoint'))(text, i, end)
}

// LineBreakIterator (line.rs:820-1130) over the word text[start, end), drained: state[start + p] = 1
// at each break p inside the word that Iterator::next returns (:833-1067), which starts at the
// word's first code point after the break at 0 and stops at the word's end. The position is
// Utf16Indices' front_offset and current_pos_data (:821-823): `pos` is the current code point's
// offset in the word, `cp` its code point and `front` the next one's offset, and `pos` reaches
// the word's length past its end.
export function markWordBreaks(line: LineData, text: string, start: number, end: number, keepAll: boolean, state: Uint8Array): void {
  return (__packs.markWordBreaks ?? __missing('rare', 'markWordBreaks'))(line, text, start, end, keepAll, state)
}

// --- 4. nsLineBreaker (dom/base/nsLineBreaker.cpp) ---

// kNonBreakableASCII, nsLineBreaker.cpp:33-48
// moved to the "rare" pack: NON_BREAKABLE_ASCII

// The break states of one text node: nsLineBreaker::AppendText with flags 0 while no word is
// buffered (16-bit :235-400, 8-bit :505-650), after AppendInvisibleWhitespace when leading white
// space was compressed (nsTextFrame.cpp:2978-2981, nsLineBreaker.cpp:695-708), then the last
// word's FlushCurrentWord from Reset (nsLineBreaker.cpp:134-226, 710-720). Each word of more than
// ASCII letters goes to LineBreaker::ComputeBreakPositions (intl/lwbrk/LineBreaker.cpp:112-194),
// which keeps the state before its first unit (AutoRestore, :342, :604; skipSet = 1, :200-206).
export function getBreakStates(line: LineData, text: string, is8bit: boolean, afterLeadingWhitespace: boolean, keepAll: boolean): Uint8Array {
  return (__packs.getBreakStates ?? __missing('rare', 'getBreakStates'))(line, text, is8bit, afterLeadingWhitespace, keepAll)
}

// Where a line may start in a text node's source, after the segment break transformation that
// removeSkippableSegmentBreaks applies: a BREAK at flags[i] for 0 < i < source.length, at a normal
// break (FLAG_BREAK_TYPE_NORMAL) or after a soft hyphen. gfxTextRun::SetPotentialLineBreaks
// (gfxTextRun.cpp:210-236) keeps a break only at a cluster start or after a space. A normal break
// right after a soft hyphen adds SOFT_HYPHEN_BREAK: BreakAndMeasureText takes it as the normal
// break, which neither fits nor draws a hyphen (gfxTextRun.cpp:1053-1063). A CLUSTER_START marks
// where a cluster starts without a break, where only break-word can wrap (gfxTextRun.cpp:1068-1074).
// The breaks, whether the text run left out a bidi control, and 1 at each unit that a layout of
// the source leaves out where collapsing each run of adjacent white space wouldn't, or null where
// there is none: white space the text run collapsed in a run that read past a character it drops,
// and, in normal white space, an FF or a CR that no line feed follows, which the text run keeps
// with no advance (transformText).
export type GeckoLineBreaks = { breaks: Uint8Array, leftOut: Uint8Array | null, dropsBidiControl: boolean }

export function getGeckoLineBreaks(
  source: string,
  preserveWhiteSpace: boolean,
  keepAll: boolean,
  graphemeTable: GraphemeTable,
  // Where each item of a rich-inline paragraph starts in the source, or null for one text (transformText).
  frameStarts: number[] | null = null,
): GeckoLineBreaks {
  const len = source.length
  const flags = new Uint8Array(len + 1)
  if (len === 0) return { breaks: flags, leftOut: null, dropsBidiControl: false }
  let is8bit = true
  for (let i = 0; i < len && is8bit; i++) is8bit = source.charCodeAt(i) < 0x100
  // CharacterDataBuffer::SetTo stores 1b text when every unit is below 256 (CharacterDataBuffer.cpp:235-286).
  const tr = transformText(source, is8bit, preserveWhiteSpace, frameStarts)
  const n = tr.text.length
  if (n === 0) return { breaks: flags, leftOut: null, dropsBidiControl: tr.dropsBidiControl }

  // The text run is built before the break sinks are set up (nsTextFrame.cpp:2860-2864), in one
  // piece: Firefox splits it where the bidi level changes, which the scan leaves out (above).
  const g: Glyphs = { clusterStart: new Uint8Array(n).fill(1), isSpace: new Uint8Array(n) }
  splitAndInitTextRun(g, tr.text, graphemeTable, new Int32Array(n))

  const line = lineData ??= { classes: unpackClasses('gecko/line'), states: unpackTable(geckoLineBreakStatesPacked) }
  const state = getBreakStates(line, tr.text, is8bit, hasCompressedLeadingWhitespace(source, tr.skipped, is8bit, preserveWhiteSpace), keepAll)
  for (let t = 1; t < n; t++) {
    const rawPos = tr.orig[t]!
    const normal = state[t] === 1 && (g.clusterStart[t] === 1 || g.isSpace[t - 1] === 1)
    const afterSoftHyphen = tr.skipped[rawPos - 1] === 1 && source.charCodeAt(rawPos - 1) === CH_SHY
    if (normal || afterSoftHyphen) {
      flags[rawPos] = normal && afterSoftHyphen ? OPPORTUNITY | SOFT_HYPHEN_BREAK : OPPORTUNITY
    } else if (g.clusterStart[t] === 1) {
      flags[rawPos] = CLUSTER_START
    }
  }
  return { breaks: flags, leftOut: tr.leftOut, dropsBidiControl: tr.dropsBidiControl }
}

// specialize.mjs: drop what was unpacked from the base tables once the full tables are installed.
export function __resetEngineData(): void { eastAsianWidths = null; lineData = null }
