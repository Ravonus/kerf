import { findGraphemeEnds, type GraphemeTable } from './graphemes.js'
import { lazyRegExp } from './line-breaks.js'
import { KIND_BITS, PRESERVED_SPACE, SOFT_HYPHEN, SPACE, TEXT, ZERO_WIDTH_BREAK, type SegmentKindCode, type TextAnalysis } from './analysis.js'
import { getCorrectedSegmentWidth, getFollowingSpaceMetrics, getSegmentMetrics, getTextWidth, type FontMeasurement, type SegmentMetrics } from './measurement.js'

// Text and spaces take letter spacing after each grapheme; a ZWSP takes none.
export function countRenderedSpacingGraphemes(text: string, kind: SegmentKindCode, graphemeTable: GraphemeTable): number {
  return kind === ZERO_WIDTH_BREAK ? 0 : findGraphemeEnds(graphemeTable, text, 0, text.length, null)
}

export function addInternalLetterSpacing(width: number, graphemeCount: number, letterSpacing: number): number {
  return graphemeCount > 1 ? width + (graphemeCount - 1) * letterSpacing : width
}

// Code points that WebKit's FontCascade::characterRangeCodePath sends to the
// complex text path, stored as start/end pairs. So does a ZWJ after an emoji.
const complexTextPathRanges = [
  0x02E5, 0x02E9, 0x0300, 0x036F, 0x0591, 0x05BD, 0x05BF, 0x05CF, 0x0600, 0x109F,
  0x1100, 0x11FF, 0x135D, 0x135F, 0x1700, 0x18AF, 0x1900, 0x194F, 0x1980, 0x19DF,
  0x1A00, 0x1CFF, 0x1DC0, 0x1DFF, 0x20D0, 0x20FF, 0x26F9, 0x26F9, 0x2CEF, 0x2CF1,
  0x302A, 0x302F, 0x3099, 0x309C, 0xA67C, 0xA67D, 0xA6F0, 0xA6F1, 0xA800, 0xABFF,
  0xD7B0, 0xD7FF, 0xFE00, 0xFE0F, 0xFE20, 0xFE2F, 0x10A00, 0x10A5F, 0x11000, 0x110CF,
  0x11100, 0x111DF, 0x11200, 0x1124F, 0x112B0, 0x1137F, 0x11400, 0x114DF, 0x11580, 0x1165F,
  0x11680, 0x116CF, 0x11700, 0x11CBF, 0x16B00, 0x16B8F, 0x1E900, 0x1E95F, 0x1F1E6, 0x1F1FF,
  0x1F3FB, 0x1F3FF, 0xE0000, 0xE007F, 0xE0100, 0xE01EF,
] as const

const extendedPictographicRe = /\p{Extended_Pictographic}/u
export const leadingCombiningMarkRe = lazyRegExp(String.raw`^\p{M}`, 'u')
// Decimal digits and the joiners of numbers, times and dates.
export const numericRunRe = /^[\p{Nd}:\-/×,.+\u2013\u2014]+$/u
export const controlCharacterRe = /^[\p{Cc}\u2028\u2029]$/u

export function needsComplexTextPath(text: string): boolean {
  let previousIsEmoji = false
  for (let i = 0; i < text.length;) {
    const codePoint = text.codePointAt(i)!
    i += codePoint > 0xFFFF ? 2 : 1
    if (codePoint === 0x200D && previousIsEmoji) return true
    previousIsEmoji = codePoint > 0xFFFF && extendedPictographicRe.test(String.fromCodePoint(codePoint))
    for (let range = 0; range < complexTextPathRanges.length && codePoint >= complexTextPathRanges[range]!; range += 2) {
      if (codePoint <= complexTextPathRanges[range + 1]!) return true
    }
  }
  return false
}

// A character of the right-to-left blocks, whose letters have bidi class R or AL, as RLM
// has, or an explicit bidi control.
export const mixedDirectionRe = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u200F\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}\u202A-\u202E\u2066-\u2069]/u

export function isSpaceKind(kind: number): boolean {
  return kind === SPACE || kind === PRESERVED_SPACE
}

// A WebKit text item runs to its next break opportunity, so it also owns any
// zero-width breaks before the space. The item is measured with one following
// U+0020 minus a space measured alone, which keeps the kerning between the item's
// end and that space. Under letter spacing both measurements hold the space's
// spacing (TextUtil::width over singleSpaceWidth, TextUtil.cpp:54-100, in WebKit
// 7625), so the item keeps that kerning there too. WebKit's item is never narrower
// than 0 (TextUtil.cpp:103), which the per-grapheme gap model does not represent.
// A soft hyphen before the space takes no kerning: on an RTL page WebKit needs
// about a hyphen's width more to fit such an item, and preparation cannot see the
// page direction. WebKit splits a text item where the bidi level changes before it
// measures it (breakAndComputeBidiLevels, InlineItemsBuilder.cpp:637-728), and
// format characters between a word and the space resolve with the space. Premise:
// the space resolves to the word's direction, so they stay in the word's item and
// the word keeps its kerning. Its gap is a space that resolves to the other
// direction, where Safari measures the word alone (ENGINE_FOLLOWUPS.md, Bidi
// levels, direction and script runs). Returns the zero-width breaks between the
// text and the space, or null when the text takes no kerning.
export function getFollowingSpaceTail(analysis: TextAnalysis, analysisIndex: number, to: number): string | null {
  const { normalized, spaceSources, starts, flags } = analysis
  let next = analysisIndex + 1
  while (next < to && (flags[next]! & KIND_BITS) === ZERO_WIDTH_BREAK) next++
  if (next >= to) return null
  const nextKind = flags[next]! & KIND_BITS
  // A collapsed space's first source character: WebKit looks at the source after a text item.
  const spaceStart = starts[next]!
  if ((nextKind !== SPACE && nextKind !== PRESERVED_SPACE) || (spaceSources === null ? normalized.charCodeAt(spaceStart) : spaceSources[spaceStart]!) !== 0x20) return null
  return normalized.slice(starts[analysisIndex + 1], spaceStart)
}

// A zero-width break before the space ends the measured item, so only the
// item's kerning with the space is added to the text's own width.
export function getTailKerning(item: string, measurement: FontMeasurement, spaceWidth: number): number {
  return getFollowingSpaceMetrics(item, measurement).width - getSegmentMetrics(item, measurement).width - spaceWidth
}

// Pieces split by a soft hyphen are measured apart, but Blink and Gecko shape
// the unbroken text together: cursive joins, marks and kerning across the soft
// hyphen. Canvas shows how much narrower the neighbors measure joined than
// apart, which isolated widths can't show when proving that a hyphen overflows.
// A line counts it for the soft hyphens it passes, and in Gecko for the one it
// ends at (returnsFromUnfitHyphen in src/line-break.ts). WebKit's return fits each
// side as measured alone and takes none (unfitHyphenRetreat).
export function getJoinedNarrowing(analysis: TextAnalysis, analysisIndex: number, to: number, before: string | null, beforeMetrics: SegmentMetrics | null, measurement: FontMeasurement, emojiCorrection: number, lineFitEpsilon: number): number {
  if (before === null) return 0
  const { texts, flags } = analysis
  let next = analysisIndex + 1
  while (next < to && (flags[next]! & KIND_BITS) === SOFT_HYPHEN) next++
  if (next >= to || (flags[next]! & KIND_BITS) !== TEXT) return 0
  const after = texts[next]!
  const apart = getCorrectedSegmentWidth(before, beforeMetrics!, measurement, emojiCorrection) + getTextWidth(after, measurement, emojiCorrection)
  const together = getTextWidth(before + after, measurement, emojiCorrection)
  return apart - together > lineFitEpsilon ? apart - together : 0
}

// A text segment's width as measured: alone, or together with the following space less
// that space, plus the item's kerning with a space that follows zero-width breaks. Apart
// from measureAnalysis()'s loop, whose code JavaScriptCore otherwise never optimizes fully
// on CJK text (RESEARCH.md, Keeping Work Bounded).
export function getTextSegmentWidth(text: string, textMetrics: SegmentMetrics, measurement: FontMeasurement, emojiCorrection: number, followingSpaceWidth: number, followingSpaceKerning: number): number {
  return getCorrectedSegmentWidth(text, textMetrics, measurement, emojiCorrection) - followingSpaceWidth + followingSpaceKerning
}
