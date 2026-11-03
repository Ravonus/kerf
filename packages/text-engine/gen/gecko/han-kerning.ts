import { __packs, __missing } from './packs.js'
// Blink's HanKerning under the default text-spacing-trim: normal (han_kerning.cc/.h,
// han_kerning_char_type.h and shaping_line_breaker.cc at Chrome 153). Blink halts a fullwidth
// opening mark after an opening, middle, closing or narrow opening mark, and a closing mark
// before a closing, middle or narrow closing mark (HanKerning::ShouldKern and ShouldKernLast,
// han_kerning.h:164-174), reading the characters on both sides of each shaped range, except
// at a wrapped line start: text-spacing-trim: normal doesn't trim there
// (text_spacing_trim.h:31-34), and the line start is reshaped with is_line_start, which skips
// the character before it (shaping_line_breaker.cc:91-109, 307-324; harfbuzz_shaper.cc:1019-1030;
// han_kerning.cc:266). At a line end it halts a closing mark that doesn't otherwise fit, where
// a break follows it (shaping_line_breaker.cc:342-363). The scan gives none before a space, tab
// or line feed (text_break_iterator.cc:284-291), but under overflow-wrap: break-word a line that
// no break of the scan's fits is laid out again with a break after every grapheme (HandleOverflow,
// line_breaker.cc:4259-4263, 4617-4625), so there the halt applies before anything.
//
// Canvas applies the pair rules only inside what it shapes as one word: Blink's Canvas cuts a
// string before and after CJK ideographs and symbols and shapes each word alone
// (plain_text_node.cc:93-155, 377-400). So preparation adds the halts the page gives across
// segment boundaries and across those cuts. A segment's width leaves out the halt of its first
// character after the text before it, which a line start takes back, the halts of pairs it
// holds across a cut, such as `(「`, and the halt of its last character before the text after
// it; a line end can halt its last closing mark. Every character type and trim is read from
// Canvas once per font: in `cc` HanKerning halts exactly one of the two, so a character's trim
// is 2 W(c) - W(cc), and the types of dots, colons, semicolons and quotes follow their ink
// bounds under the page's Han script (han_kerning.cc:47-168, 400-535).
import { KIND_BITS, TEXT, UNBROKEN, type TextAnalysis } from './analysis.js'
import { hasProperty, PUNCTUATION } from './line-breaks.js'
import { getContext, getSegmentMetrics, zeros, type FontMeasurement } from './measurement.js'

// moved to the "rare" pack: OTHER
// moved to the "rare" pack: OPEN
// moved to the "rare" pack: CLOSE
// moved to the "rare" pack: MIDDLE
// moved to the "rare" pack: OPEN_NARROW
// moved to the "rare" pack: CLOSE_NARROW
// moved to the "rare" pack: DOT
// moved to the "rare" pack: COLON
// moved to the "rare" pack: SEMICOLON
// moved to the "rare" pack: OPEN_QUOTE
// moved to the "rare" pack: CLOSE_QUOTE

// Sticky, to test a code unit where it sits in the text.
// moved to the "rare" pack: openPunctuationRe
// moved to the "rare" pack: closePunctuationRe

// Character::MaybeHanKerningOpenOrCloseFast (character.h:138-141): every fullwidth opening
// and closing mark and every quote is in these ranges.
// moved to the "rare" pack: maybeHanKerningRe

export function maybeHanKerns(c: number): boolean {
  return (__packs.maybeHanKerns ?? __missing('rare', 'maybeHanKerns'))(c)
}

export function textMayHanKern(text: string): boolean {
  return (__packs.textMayHanKern ?? __missing('rare', 'textMayHanKern'))(text)
}

// HanKerningCharType (character_property_data_generator.cc:143-167, han_kerning_char_type.h:17-44)
// of the code unit at `index`: the listed quotes, dots, colon, semicolon and middles, then Ps and Pe,
// fullwidth when in the CJK Symbols block or East_Asian_Width F.
export function getStaticCharType(text: string, index: number): number {
  return (__packs.getStaticCharType ?? __missing('rare', 'getStaticCharType'))(text, index)
}

export type HanKerningFontData = {
  typeForDot: number
  typeForColon: number
  typeForSemicolon: number
  quoteFullwidth: boolean
  trims: Map<number, number>
}

// CharTypeFromBounds (han_kerning.cc:48-73), horizontal, of c as HanKerning::FontData
// shapes it: under the locale's Han script (han_kerning.cc:462), where `locl` can move
// punctuation. Under zh-Hans, PingFang TC draws `。` in the left half of its em, and alone
// centered. Canvas shapes a CJK symbol next to 中 as Han, so its right edge comes from `中c`
// and its left edge from `c中`, where 中's ink covers neither. Curly quotes and U+FF1B are
// words of their own in Canvas (NextWordEndIndex) and are measured alone.
export function getTypeFromBounds(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, c: number, hanWidth: number): { advance: number; type: number } {
  return (__packs.getTypeFromBounds ?? __missing('rare', 'getTypeFromBounds'))(ctx, c, hanWidth)
}

export function getTrim(data: HanKerningFontData, c: number, measurement: FontMeasurement): number {
  return (__packs.getTrim ?? __missing('rare', 'getTrim'))(data, c, measurement)
}

// HanKerning::FontData (han_kerning.cc:400-535); null where the font that draws 「 has no halt.
export function getFontData(measurement: FontMeasurement): HanKerningFontData | null {
  return (__packs.getFontData ?? __missing('rare', 'getFontData'))(measurement)
}

// HanKerning::GetCharType (han_kerning.cc:142-168).
export function getCharType(data: HanKerningFontData, text: string, index: number): number {
  return (__packs.getCharType ?? __missing('rare', 'getCharType'))(data, text, index)
}

// HanKerning::ShouldKern and ShouldKernLast (han_kerning.h:164-174): the halted character of
// the pair (earlier, later), 1 for the later, -1 for the earlier, 0 for neither.
export function haltedSide(earlier: number, later: number): number {
  return (__packs.haltedSide ?? __missing('rare', 'haltedSide'))(earlier, later)
}

// Character::IsCjkIdeographOrSymbol (character_property_data.h:17-110) for the characters
// HanKerning types. Canvas starts a word where exactly one of two such characters is a CJK
// symbol (NextWordEndIndex, plain_text_node.cc:93-155): curly quotes, U+00B7, U+2027, U+FF1B
// and the narrow brackets aren't.
export function isCanvasCjkSymbol(c: number): boolean {
  return (__packs.isCanvasCjkSymbol ?? __missing('rare', 'isCanvasCjkSymbol'))(c)
}

export type HanKerningTrims = {
  // Per segment, the halts the page gives its characters that its Canvas width keeps: of its
  // first character after the text before it, of its last before the text after it, and of
  // pairs inside it that Canvas shapes as two words. Null without any.
  widthTrims: number[] | null
  // Per segment, the halt of its first character after the character before it, which a line
  // start adds back. Null without any.
  lineStartExtras: number[] | null
  // Per segment, the halt of its last character where the line ends after it. Null without any.
  lineEndTrims: number[] | null
  // Per segment, that halt where the scan gives no break after it, which only a line that
  // Blink retries between graphemes takes. Null without any.
  overflowLineEndTrims: number[] | null
}

// The trims of an analysis' text segments, read from the characters before and after each. For a
// rich-inline item, those of its segments, [from, to) of its paragraph's analysis, in lists that
// start at `from`: Blink reads the character before a shaped run and the one after it from the
// paragraph's text, whatever items they are in, and types both by the font of the run it shapes
// (HanKerning::AppendFontFeatures, han_kerning.cc:242-243, 266-273, 288-294, 314-319), so a pair
// of marks an item start splits halts as in one text, each mark by its own item's font.
export function getHanKerningTrims(measurement: FontMeasurement, analysis: TextAnalysis, from: number, to: number): HanKerningTrims {
  return (__packs.getHanKerningTrims ?? __missing('rare', 'getHanKerningTrims'))(measurement, analysis, from, to)
}
