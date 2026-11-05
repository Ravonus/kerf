import { findGraphemeEnds, type GraphemeTable } from './graphemes.js'
import { combine, isClusterExtender, isInvalidChar, isSurrogatePair } from './gecko-line-breaks-transform.js'

export type Glyphs = { clusterStart: Uint8Array, isSpace: Uint8Array }

// CompressedGlyph::MakeComplex(false, true), gfxFont.cpp:716
function extendCluster(g: Glyphs, i: number): void {
  g.clusterStart[i] = 0
  g.isSpace[i] = 0
}

// gfxShapedText::SetupClusterBoundaries(uint32_t, const char16_t*, uint32_t), gfxFont.cpp:708-769,
// for one shaped word, without the emergency wraps after hyphens. GraphemeClusterBreakIteratorUtf16
// reads the word alone (intl/lwbrk/Segmenter.cpp:174-187). Below U+0300 only CR and LF share a
// cluster, which the generator checks, and words hold neither, so a word of such units has a
// cluster at every unit. `ends` has room for the word's clusters.
function setupClusterBoundaries(g: Glyphs, text: string, from: number, to: number, graphemeTable: GraphemeTable, ends: Int32Array): void {
  let ch0 = text.charCodeAt(from)
  if (to - from > 1 && isSurrogatePair(ch0, text.charCodeAt(from + 1))) ch0 = combine(ch0, text.charCodeAt(from + 1))
  if (isClusterExtender(ch0)) extendCluster(g, from)
  let low = from
  while (low < to && text.charCodeAt(low) < 0x300) low++
  const count = low === to ? 0 : findGraphemeEnds(graphemeTable, text, from, to, ends)
  for (let k = 0, pos = from; pos < to; k++) {
    const ch = text.charCodeAt(pos)
    if (ch === 0x20 || ch === 0x3000) g.isSpace[pos] = 1
    else if (ch === 0x09af && pos > from && text.charCodeAt(pos - 1) === 0x09cd) extendCluster(g, pos) // BENGALI_YA after BENGALI_VIRAMA
    const end = count === 0 ? pos + 1 : ends[k]!
    for (pos++; pos < end; pos++) extendCluster(g, pos)
  }
}

// gfxFont::SplitAndInitTextRun, gfxFont.cpp:3707-3900: sets up the shaped words of the text run. A
// word ends at a space or NBSP before no cluster extender (IsBoundarySpace, :3317-3330) or at an
// invalid character (:3778-3790). A space glyph (SetSpaceGlyphIfSimple, gfxTextRun.cpp:1612-1619)
// only sets isSpace, and an invalid character (:3877-3892) keeps a zero record. Below U+0100,
// IsBoundarySpace and SetupClusterBoundaries(uint8_t) (gfxFont.cpp:771-795) answer as the char16_t
// versions, so 8-bit text and 8-bit words take the char16_t path, at any word length (:3569-3577,
// :3817-3821).
export function splitAndInitTextRun(g: Glyphs, text: string, graphemeTable: GraphemeTable, ends: Int32Array): void {
  const end = text.length
  let wordStart = 0
  for (let i = 0; i < end; i++) {
    const ch = text.charCodeAt(i)
    const boundary = (ch === 0x20 || ch === 0xa0) && !(i + 1 < end && isClusterExtender(text.charCodeAt(i + 1)))
    if (!boundary && !isInvalidChar(ch)) continue
    if (i > wordStart) setupClusterBoundaries(g, text, wordStart, i, graphemeTable, ends)
    if (ch === 0x20) g.isSpace[i] = 1
    wordStart = i + 1
  }
  if (end > wordStart) setupClusterBoundaries(g, text, wordStart, end, graphemeTable, ends)
}

// --- 3. ICU4X 2.1.2's line iterator for one word (icu_segmenter src/line.rs) ---

// Firefox's line data, which the first scan unpacks (getGeckoLineBreaks).
