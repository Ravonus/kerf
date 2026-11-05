// Font measurement types moved from @chenglou/pretext 1.0.0.
import type { HanKerningFontData } from './han-kerning.js'

// What preparation knows of a segment in a font. Each is created with all its fields,
// so their reads see one shape.
export type SegmentMetrics = {
  width: number
  emojiCount: number // Glyphs the emoji font draws (countEmojiGlyphs), or -1 until counted
  fit: SegmentFit | null // Where it breaks under overflow, for the last fit mode asked
  spaceKerning: SpaceKerning | null // Its kerning beside a space, once asked (getSpaceKerning)
  // Per grapheme, the letter spacings it takes more than one, once letter-spaced text asked
  // where the engine spaces glyphs (getExtraSpacings): empty where every grapheme takes one.
  extraSpacings: number[] | null
}

// A text segment's kerning with a U+0020 beside it, in the Chromium profile (getSpaceKerning).
export type SpaceKerning = {
  after: number // With a space after it
  before: number // With a space before it
}

// Where a segment breaks under overflow-wrap: break-word in one fit mode (getSegmentFit),
// replaced whole when another mode is asked for.
export type SegmentFit = {
  mode: BreakableFitMode
  advances: number[] | null // Per grapheme, or null for one grapheme
  // With advances, per grapheme, what a line that starts with it adds to its advance, where
  // the engine shapes such a line again (the 'reshaped-lines' mode). Null where nothing.
  lineStartExtras: number[] | null
}

export type BreakableFitMode = 'sum-graphemes' | 'segment-prefixes' | 'pair-context' | 'reshaped-lines'

// The measurement context and what preparation measured through it. Canvas resolves
// fonts under the context's language, the page's unless the context has a `lang` to
// give it preparation's. Chrome keeps a resolved font while its font string is
// unchanged, so the context, and every width measured through it, belong to the
// language it was created under: all of it is replaced when that language changes.
export type MeasureState = {
  language: string | null
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D // Once made, read through getContext() alone
  font: string // The font getContext() set the context to since a font was last looked up, or ''
  letterSpacing: string // The letterSpacing getContext() last set the context to
  // A second context, under text-rendering: optimizeLegibility, where Canvas shapes a string
  // whole, and the Canvas font it is set to: made for the first font asked about its kana
  // (getFontKanaKerning).
  wholeRunContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  wholeRunFont: string
  genericFamilies: string[] | null // The families the language gives the generic keywords, or null
  takesLetterSpacing: boolean // As Chrome's and Firefox's contexts do, as a string of CSS px
  // Whether the context shapes text under LETTER_SPACED_SHAPING as the page shapes text
  // under letter spacing, without its optional ligatures: it takes a letterSpacing and
  // the engine's Canvas turns them off under one (canvasLetterSpacingDropsLigatures).
  shapesLetterSpaced: boolean
  fonts: Map<string, FontMeasurement>
  // What letter-spaced text measures in each font where shapesLetterSpaced: the same text
  // shaped without its optional ligatures.
  letterSpacedFonts: Map<string, FontMeasurement>
  segments: number // The segments the fonts' caches hold between them (MAX_CACHED_SEGMENTS)
}
// What preparation keeps per font. It all goes together, when the caches clear or the
// language changes.
export type FontMeasurement = {
  state: MeasureState // Its context, which getContext() sets to the font and its shaping
  // The font Canvas is given: the declared font, with the generic keywords the context's
  // language names replaced by their families.
  canvasFont: string
  letterSpacing: string // The Canvas letterSpacing its text is shaped under: LETTER_SPACED_SHAPING or none
  metrics: Map<string, SegmentMetrics>
  // Metrics of a text item measured together with one following U+0020, keyed by
  // the item alone. The width includes that space.
  followingSpaceMetrics: Map<string, SegmentMetrics>
  // In the Chromium profile, null for a font that kerns nothing with the space glyph, asked for
  // the first text with a space (getFontSpaceKerning). Otherwise each character's kerning with a
  // space glyph after it, keyed by its code unit << 1, and with one before it, by that | 1, once
  // a segment has the character at that edge (getSpaceKerning).
  spaceKerning: Map<number, number> | null | undefined
  measuredKana: boolean // Whether a segment measured in the font holds a kana (addMetrics)
  // In the Chromium profile, the kerning of each two kana in a row, once a text has the pair
  // (getKanaKerning), or null where the font kerns none, asked for the first text with two
  // kana in a row (getFontKanaKerning).
  kanaKerning: Float64Array | null | undefined
  kanaFont: string // The Canvas font its kana are asked in: canvasFont, or it without its first families (getFontKanaKerning)
  emojiCorrection: number | null // Probed for the first text that may hold emoji
  emojiWidth: number // Canvas's width of one glyph of the emoji font, measured with the correction
  hyphenText: string | null // Asked for the first text with a soft hyphen (getHyphenText)
  spaceWidth: number | null // The space's width, which every text asks for, kept from the first (getSpaceWidth)
  hanKerning: HanKerningFontData | null | undefined // Read for the first text that may kern
  ligaturePairs: Map<string, boolean> // Whether two neighbouring graphemes are a ligature, once asked (isLigature)
  glyphCounts: Map<string, number> // The glyphs Canvas letter-spaces in a text, once asked (getExtraSpacings)
}
