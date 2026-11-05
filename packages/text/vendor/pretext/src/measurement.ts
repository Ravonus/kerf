import { fontSizeRe, familyRe, parseFontSize } from './measurement-font.js'
export { getHyphenText, parseFontSize } from './measurement-font.js'
import { getContext, getSegmentMetrics, getFollowingSpaceMetrics, getSpaceWidth } from './measurement-metrics.js'
export { getContext, getSegmentMetrics, getFollowingSpaceMetrics, getSpaceWidth } from './measurement-metrics.js'
import { getEngineProfile } from './measurement-engine.js'
export { getEngineProfile, getLayoutEngine } from './measurement-engine.js'
export type { LayoutEngine } from './measurement-engine.js'
import { readEmojiWidth } from './measurement-emoji-dom.js'
import { findGraphemeEnds } from './graphemes.js'
import type { EngineProfile } from './measurement-profile.js'
import { DEFAULT_IGNORABLE, getBlinkDefaultLocale, hasProperty, MARK } from './line-breaks.js'
import { webkitGenericFamilies, webkitGenericFamilyNames, webkitScriptLanguages, webkitScriptSubtags } from './generated/webkit-generic-families.js'

import type { SegmentMetrics, SpaceKerning, SegmentFit, BreakableFitMode, MeasureState, FontMeasurement } from './measurement-types.js'
export type { SegmentMetrics, SpaceKerning, SegmentFit, BreakableFitMode, FontMeasurement } from './measurement-types.js'
export type { EngineProfile } from './measurement-profile.js'

let measureState: MeasureState | null = null

// Prefix fits, which preparation picks by engine, width and letter spacing
// (measureAnalysis in src/prepare.ts), measure every growing prefix of a
// segment. That suits word-sized runs, but a giant segment would prepare in time
// that grows with the square of its length. Past this size, the cheaper
// pair-context model keeps preparation linear.
const MAX_PREFIX_FIT_GRAPHEMES = 96

// The Canvas letterSpacing a context measures letter-spaced text under: not 0, so the
// engine shapes the text as its page does under letter spacing, and too small to add any
// width, so one measurement serves every spacing and preparation adds the spacing itself.
// Blink adds spacing in units of 1/65536 px (ShapeResultSpacing::SetSpacing,
// shape_result_spacing.cc:14-33) and Gecko's Canvas in whole app units, 1/60 px
// (CanvasRenderingContext2D.cpp:4771-4774), and both read 0 here: 16px Roboto `difficult`
// measures 54.2031px in Chrome 154 and 54.2px in Firefox 156, their pages' widths with
// `font-variant-ligatures: none` (2026-09-30).
const LETTER_SPACED_SHAPING = '0.000001px'

// The most segments the fonts' caches hold between them when a preparation starts
// (getPreparationLanguage): past it they are all dropped, as clearCache() drops them, before
// that preparation measures anything. A handle keeps its own widths, so nothing prepared
// changes; text prepared afterwards is measured again. Prose adds segments ever more slowly,
// but ids, numbers and URLs never repeat, so without a bound the caches grow for as long as the
// page lives. The bound is a safety net well above what a page uses, not a tuned size: the
// 11,290 plain texts of the harness's real-usage sample, 883,084 units, fill in one font 71,294
// segments in the Chromium profile, 90,023 in Gecko's and 115,367 in WebKit's, 241-363 B each in
// JavaScriptCore, and a bound under a page's own count has its text measured again and again:
// at 65,536, preparing those texts a second time asks Canvas 81,286 to 196,534 times, where
// under no bound it asks nothing (the harness's stand-in Canvas, 2026-10-12).
const MAX_CACHED_SEGMENTS = 1 << 18

// Graphemes the emoji font may draw a glyph in, which Canvas widths then tell
// (countEmojiGlyphs): those holding an emoji-presentation character or a pictograph,
// or an emoji character followed by U+FE0F, such as a keycap base like `1`. U+FE0F
// after a letter or a space changes nothing.
const emojiGraphemeRe = /\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}\uFE0F/u
const maybeEmojiRe = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u

const genericKeywords = ['serif', 'sans-serif', 'cursive', 'fantasy', 'monospace']
// A quoted family name, or an unquoted generic keyword with what precedes it.
const familyListItemRe = /("[^"]*"|'[^']*')|(^|,)(\s*)(serif|sans-serif|cursive|fantasy|monospace)(?=\s*(?:,|$))/gi
// The families WebKit's page gives the generic keywords under a language, or null
// where they resolve as in Canvas. The page asks Core Text wherever WebKit's script
// for the language isn't Common: localeToScriptCode tries the language, then its last
// subtag as a script, then the language less that subtag (LocaleToScriptMapping.cpp:
// 360-377). A plain Han language becomes the first preferred language starting with
// zh-, else zh-hans (FontDescription.cpp:74-113); a page can't read those languages,
// so Pretext takes zh-hans. Core Text's answers are OS data, generated with macOS's
// and iOS's families (scripts/generate-webkit-generic-families.ts): where they differ,
// the context takes macOS's if it has it. Listing both instead would send characters
// macOS's family lacks to iOS's, where the page falls back by language.
function getWebKitGenericFamilies(language: string, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): string[] | null {
  let tag = language.toLowerCase().replaceAll('_', '-')
  let han: boolean | null = null
  for (let at = tag; han === null;) {
    if (webkitScriptLanguages.includes(` ${at} `)) han = at === 'zh'
    else {
      const cut = at.lastIndexOf('-')
      if (cut < 0 || at.endsWith('-zyyy')) return null
      if (webkitScriptSubtags.includes(` ${at.slice(cut + 1)} `)) han = at.endsWith('-hani')
      at = at.slice(0, cut)
    }
  }
  if (han) tag = 'zh-hans'
  let row = webkitGenericFamilies[tag]
  while (row === undefined) {
    tag = tag.slice(0, Math.max(0, tag.lastIndexOf('-')))
    row = webkitGenericFamilies[tag]
  }
  const families: string[] = []
  for (let i = 0; i < row.length; i++) {
    // Keywords with the same entry share its family, and the context is asked once.
    const first = row.indexOf(row[i]!)
    if (first < i) {
      families.push(families[first]!)
      continue
    }
    const name = webkitGenericFamilyNames[row[i]!]!
    const pair = name.indexOf('|')
    const family = pair < 0 ? name : hasFamily(ctx, name.slice(0, pair)) ? name.slice(0, pair) : name.slice(pair + 1)
    families.push(family === '' ? '' : `"${family}"`)
  }
  return families
}

// Text each of macOS's families in the table draws some of: Latin, Hangul, Han,
// Devanagari, Khmer, Kannada, Lao, Malayalam, Myanmar, Oriya, Sinhala and Tibetan.
const familyProbeText = 'Hamburg 한中 नम សួ ನಮ ສະ നമ မင ନମ ආය བཀ'

// Whether the context has a family: the probe text measures differently with it first.
function hasFamily(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, family: string): boolean {
  for (const fallback of ['monospace', 'serif']) {
    ctx.font = `16px ${fallback}`
    const width = ctx.measureText(familyProbeText).width
    ctx.font = `16px "${family}", ${fallback}`
    if (ctx.measureText(familyProbeText).width !== width) return true
  }
  return false
}

// The Canvas font that measures what the page draws: each unquoted generic keyword
// in the family list, after the size, becomes the page's families for it.
function getCanvasFont(font: string, families: readonly string[]): string {
  const size = fontSizeRe.exec(font)
  if (size === null) return font
  const start = size.index + size[0].length
  return font.slice(0, start) + font.slice(start).replace(familyListItemRe, (item: string, quoted: string | undefined, separator: string, space: string, keyword: string) => {
    const named = quoted === undefined ? families[genericKeywords.indexOf(keyword.toLowerCase())]! : ''
    return named === '' ? item : separator + space + named
  })
}

// The language setLocale() gave, which preparation reads in place of the page's,
// or undefined.
let localeLanguage: string | undefined

export function setLocaleLanguage(locale: string | undefined): void {
  localeLanguage = locale
}

// The language one preparation breaks and measures under, read once: setLocale()'s, or
// else the page's, or null without a document. The Chromium profile lays out a page
// without one under Blink's default locale (laysOutUnderDefaultLocale).
export function getPreparationLanguage(profile: EngineProfile): string | null {
  // A preparation starts with this read, so the fonts' caches are bounded here, between two
  // preparations (MAX_CACHED_SEGMENTS), and not where a font is looked up: a rich-inline
  // paragraph looks one up for each of its items, and caches dropped between two of them would
  // have one paragraph measured partly from the caches and partly anew.
  if (measureState !== null && measureState.segments > MAX_CACHED_SEGMENTS) clearMeasurementCaches()
  let language = localeLanguage ?? null
  if (localeLanguage === undefined && typeof document !== 'undefined') {
    const lang = (document.documentElement as HTMLElement | null | undefined)?.lang
    if (typeof lang === 'string') language = lang
  }
  return language === '' && profile.laysOutUnderDefaultLocale ? getBlinkDefaultLocale() : language
}

// The most app units a Gecko length holds (nscoord_MAX, nsCoord.h:28).
import { readLetterSpacing, zeros } from './measurement-spacing.js'
export { readLetterSpacing, zeros } from './measurement-spacing.js'

// The Canvas letterSpacing a text is measured under to count the glyphs it spaces: far
// wider than any text asked about, so the text's width over it rounds to the count with
// nothing taken off, and a power of two, which float32 widths add whole. A text 2^19 px
// wide under no spacing would count a glyph more.
const GLYPH_COUNT_SPACING = 2 ** 20

// The spacings of a segment whose graphemes each take one, and of any segment where Canvas
// can't be asked.
export const noExtraSpacings: number[] = []

// Per grapheme of a text segment, how many letter spacings it takes more than one, where
// the engine spaces glyphs (EngineProfile's letterSpacesGlyphs). Canvas spaces by the
// engine's rule, so a prefix of the segment measured under a letter spacing holds that
// spacing once for each of its glyphs with an advance, and a grapheme takes what its
// prefix has more than the prefix before it: WebKit fits a cut word by its prefixes too
// (TextUtil::breakWord). A grapheme can take none, as the alef of lam-alef, or fewer,
// where it joins the glyphs before it into one. Past MAX_PREFIX_FIT_GRAPHEMES each
// grapheme is asked alone, which keeps a giant segment linear and misses a glyph two of
// its graphemes share. A text's count is kept for the font (FontMeasurement's
// glyphCounts), so words that start alike ask about a prefix once: one more Canvas call
// for each prefix new to the font, which WebKit shapes each time, since it keeps no width
// measured under a letter spacing (TextMeasurementCache.h:165-167). Under a context that
// takes no letterSpacing every grapheme takes one.
export function getExtraSpacings(seg: string, measurement: FontMeasurement): number[] {
  if (!measurement.state.takesLetterSpacing) return noExtraSpacings
  const ends = new Int32Array(seg.length)
  const count = findGraphemeEnds(getEngineProfile().graphemeTable, seg, 0, seg.length, ends)
  const prefixes = count <= MAX_PREFIX_FIT_GRAPHEMES
  const counts = measurement.glyphCounts
  // The font's context once Canvas is asked, under the counting spacing from then on, so
  // it changes its spacing once, and not at all for a segment whose prefixes are counted.
  let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
  let extras = noExtraSpacings
  try {
    let before = 0
    for (let i = 0, start = 0; i < count; start = ends[i++]!) {
      const text = seg.slice(prefixes ? 0 : start, ends[i])
      let glyphs = counts.get(text)
      if (glyphs === undefined) {
        if (context === null) {
          context = getContext(measurement)
          context.letterSpacing = `${GLYPH_COUNT_SPACING}px`
        }
        glyphs = Math.round(context.measureText(text).width / GLYPH_COUNT_SPACING)
        counts.set(text, glyphs)
      }
      const extra = glyphs - (prefixes ? before : 0) - 1
      before = glyphs
      if (extra === 0 && extras.length === 0) continue
      if (extras.length === 0) extras = zeros(count)
      extras[i] = extra
    }
  } finally {
    if (context !== null) context.letterSpacing = measurement.letterSpacing
  }
  return extras
}

export const kanaPairRe = /[\u3041-\u30FF]{2}/
const KANA_COUNT = 0x30ff - 0x3041 + 1

// The kerning of every segment that takes none.
export const noSpaceKerning: SpaceKerning = { after: 0, before: 0 }

// Whether a character is a kana or an ideograph, which Canvas shapes as a word of its own: it
// cuts a string before one that follows another, and keeps with a letter the marks and CJK
// punctuation after it (NextWordEndIndex, plain_text_node.cc:92-153, over
// kIsCjkIdeographOrSymbolRanges, character_property_data.h:40-80, of which these are the
// letters).
function isCanvasWordLetter(code: number): boolean {
  return (code >= 0x3041 && code <= 0x3096) || (code >= 0x30a1 && code <= 0x30fa) ||
    (code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)
}

// Whether a character takes no kerning with a space, and Canvas isn't asked.
function takesNoSpaceKerning(code: number): boolean {
  // A combining mark or half of a surrogate pair is part of a longer cluster. Canvas shows no
  // kerning beside a letter it shapes as a word of its own.
  return hasProperty(code, MARK) || (code & 0xf800) === 0xd800 || isCanvasWordLetter(code) ||
    // Premise: no font kerns a Hangul syllable with the space (RESEARCH.md, Kerning At Line Edges).
    (code >= 0xac00 && code <= 0xd7a3)
}

// What is kept of the font's kerning with the space glyph, or null for a font that has none:
// one in which U+2028 before, between and after the printable ASCII characters is as wide with
// kerning off. `fontKerning = 'none'` turns the `kern` feature off
// (FontFeatureRange::FromFontDescription, font_features.cc:39-47), and with it HarfBuzz's
// kerning from GPOS, `kern` and `kerx` (hb-ot-shape.cc:127-131, hb-ot-kern-table.hh:67). Asked
// once per font. Premise: a font that kerns no printable ASCII character with the space kerns
// nothing with it (RESEARCH.md, Kerning At Line Edges, has the fonts that do).
export function getFontSpaceKerning(measurement: FontMeasurement): Map<number, number> | null {
  if (measurement.spaceKerning === undefined) {
    const context = getContext(measurement)
    let probe = '\u2028'
    for (let code = 0x21; code <= 0x7e; code++) probe += String.fromCharCode(code) + '\u2028'
    const kerned = context.measureText(probe).width
    context.fontKerning = 'none'
    const unkerned = context.measureText(probe).width
    context.fontKerning = 'auto'
    // Where U+2028 alone doesn't measure as the space, it doesn't stand for it.
    measurement.spaceKerning = kerned !== unkerned && context.measureText('\u2028').width === getSegmentMetrics(' ', measurement).width ? new Map() : null
  }
  return measurement.spaceKerning
}

// A character's kerning with a space glyph after it, or before it: the two in one string, with
// U+2028 for the space, less each alone. Asked of Canvas once per font and side.
function getCharacterSpaceKerning(code: number, spaceFirst: boolean, measurement: FontMeasurement, kernings: Map<number, number>): number {
  const key = code << 1 | (spaceFirst ? 1 : 0)
  let kerning = kernings.get(key)
  if (kerning === undefined) {
    kerning = 0
    if (!takesNoSpaceKerning(code)) {
      const character = String.fromCharCode(code)
      const pairWidth = getContext(measurement).measureText(spaceFirst ? '\u2028' + character : character + '\u2028').width
      kerning = pairWidth - getSegmentMetrics(character, measurement).width - getSegmentMetrics(' ', measurement).width
      // Blink keeps a run's width as a float32 (shape_result.cc:1539-1576), so up to the pair's
      // width / 2^22 is rounding, not kerning (RESEARCH.md, Kerning At Line Edges).
      if (Math.abs(kerning) <= pairWidth / 0x400000) kerning = 0
    }
    kernings.set(key, kerning)
  }
  return kerning
}

// The kerning Blink's layout gives a text segment's edges with a U+0020 beside them
// (EngineProfile.kernsAcrossCanvasWords), read from Canvas with U+2028 for the space: Blink
// draws U+2028 with the space glyph (HarfBuzzGetGlyph, harfbuzz_face.cc:103-113) and its Canvas
// doesn't cut there. Premise: the segment's last and first character stand for the word, past
// default ignorables, which HarfBuzz's lookups pass over, and a first character with a combining
// mark after it takes none (RESEARCH.md, Kerning At Line Edges, has the gaps).
export function getSpaceKerning(seg: string, metrics: SegmentMetrics, measurement: FontMeasurement, kernings: Map<number, number>): SpaceKerning {
  let first = 0
  let last = seg.length - 1
  while (first < last && hasProperty(seg.charCodeAt(first), DEFAULT_IGNORABLE)) first++
  while (last > first && hasProperty(seg.charCodeAt(last), DEFAULT_IGNORABLE)) last--
  const before = first < last && hasProperty(seg.charCodeAt(first + 1), MARK) ? 0 : getCharacterSpaceKerning(seg.charCodeAt(first), true, measurement, kernings)
  const after = getCharacterSpaceKerning(seg.charCodeAt(last), false, measurement, kernings)
  return metrics.spaceKerning = after === 0 && before === 0 ? noSpaceKerning : { after, before }
}

// Twelve kana in a row, nine of whose eleven pairs or more kern in each Japanese face measured
// that kerns kana at all (getFontKanaKerning).
const KANA_PROBE = '\u30D7\u30C0\u30B0\u30BF\u30CE\u30E0\u30D6\u30A4\u30E1\u3048\u305A\u307A'

// The font's context for kana: Canvas shapes a string whole, as Blink's layout shapes a run,
// under text-rendering: optimizeLegibility where the lookups of the first font with a space
// cover the space glyph (FontFallbackList::ComputeCanShapeWordByWord, font_fallback_list.cc:264-277),
// as those of the Japanese fonts of macOS do. It is a context of its own: the first measures
// everything else as it did, and a kana alone measures the same on both. It is set to the
// list the font's kana are asked in (getFontKanaKerning), and isn't asked whether it takes the
// list (contextTakesFont): the font's own list is one the first context, made the same way,
// took, and where a shorter one is no font string, as a list cut inside a calc() size, the
// context keeps the list before it and reads what it read under that one, so the search goes
// on to the next list or ends on the font's own.
function getWholeRunContext(measurement: FontMeasurement): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const state = measurement.state
  if (state.wholeRunContext === null) {
    state.wholeRunContext = createContext(state.language)
    state.wholeRunContext.textRendering = 'optimizeLegibility'
  }
  if (state.wholeRunFont !== measurement.kanaFont) state.wholeRunContext.font = state.wholeRunFont = measurement.kanaFont
  return state.wholeRunContext
}

// Whether two measurements of one string are of the same glyphs at the same places: as wide,
// with the same ink edges, to float32 rounding (getKanaKerning has the bound).
function sameInk(a: TextMetrics, b: TextMetrics): boolean {
  const bound = a.width / 0x400000
  return Math.abs(a.width - b.width) <= bound && Math.abs(a.actualBoundingBoxLeft - b.actualBoundingBoxLeft) <= bound &&
    Math.abs(a.actualBoundingBoxRight - b.actualBoundingBoxRight) <= bound
}

// What is kept of the font's kerning between kana, or null for a font that shows none: one in
// which KANA_PROBE, shaped whole, is as wide with kerning off (getFontSpaceKerning has what
// `fontKerning` turns off). Canvas shapes a string whole by the list's first font alone, where
// Blink's layout shapes the kana of a run together whatever font leads the list
// (InlineNode::ShapeText, inline_node.cc:1551-1718), so a list that shows no kerning is asked
// again without its first family, then without its first two, and so on: once the first
// font's lookups cover the space glyph, as the kana's own font's do, Canvas shapes the probe
// whole. A shorter list stands for the font only where the same font draws its kana, which
// two answers tell. It draws the probe with the same glyphs, as wide and with the same ink
// edges with kerning off: the first that doesn't ends the search, since a family left out
// drew the kana. And the kerning Canvas does show under the font's own list, a kana's with a
// U+3002 it keeps in the kana's word (NextWordEndIndex, plain_text_node.cc:129-153), is the
// shorter list's and isn't nothing: Hiragino Sans GB draws Hiragino Sans's kana and kerns
// none. A font that shows no kerning under any list stays as wide as Canvas measures its kana
// apart. Asked once per font, with two measurements for each list tried and three more for
// one that shows kerning. Premises: a font that kerns kana kerns one of the probe's pairs
// (RESEARCH.md, Kerning At Line Edges, has the fonts measured), and one of its hiragana with
// U+3002 (ENGINE_FOLLOWUPS.md, Kerning between kana).
export function getFontKanaKerning(measurement: FontMeasurement): Float64Array | null {
  if (measurement.kanaKerning === undefined) {
    measurement.kanaKerning = null
    const font = measurement.canvasFont
    const size = fontSizeRe.exec(font)
    const start = size === null ? 0 : size.index + size[0].length
    const families = size === null ? null : font.slice(start).match(familyRe)
    const lists = families === null ? 1 : families.length
    let own: TextMetrics | null = null
    for (let i = 0; i < lists; i++) {
      const list = i === 0 ? font : font.slice(0, start) + families!.slice(i).join(',')
      measurement.kanaFont = list
      const context = getWholeRunContext(measurement)
      const kerned = context.measureText(KANA_PROBE).width
      context.fontKerning = 'none'
      const unkerned = context.measureText(KANA_PROBE)
      context.fontKerning = 'auto'
      if (own === null) own = unkerned
      else if (!sameInk(own, unkerned)) break
      if (kerned === unkerned.width) continue
      if (i > 0) {
        // Each hiragana letter before a U+3002: Canvas shapes each pair as one word under any list.
        let pairs = ''
        for (let code = 0x3041; code <= 0x3096; code++) pairs += String.fromCharCode(code, 0x3002)
        const shorter = context.measureText(pairs).width
        measurement.kanaFont = font
        const ownContext = getWholeRunContext(measurement)
        const ownKerned = ownContext.measureText(pairs).width
        ownContext.fontKerning = 'none'
        const ownUnkerned = ownContext.measureText(pairs).width
        ownContext.fontKerning = 'auto'
        if (ownKerned === ownUnkerned || Math.abs(shorter - ownKerned) > ownKerned / 0x400000) break
        measurement.kanaFont = list
      }
      measurement.kanaKerning = new Float64Array(KANA_COUNT * KANA_COUNT).fill(NaN)
      break
    }
    if (measurement.kanaKerning === null) measurement.kanaFont = font
  }
  return measurement.kanaKerning
}

// The kerning Blink's layout gives text[at - 1] and text[at] that no measured width holds, or
// 0: that of two characters of the kana blocks that were measured apart. `start` is where the
// segment that holds text[at] starts. Two segments are measured apart, so a segment's first
// character takes its kerning with the one before it. Inside a segment Canvas cuts before a
// kana letter where the word before it holds a letter already. A mark such as U+30FC stays in
// the word before it, and a word that marks or CJK punctuation began takes the first letter
// after them (NextWordEndIndex's has_any_script, plain_text_node.cc:129-153), so Canvas has
// measured those pairs together; a character below the CJK ranges is in a word of other
// scripts, which ends before the letter. Each pair is asked of Canvas once per font and kept
// in the font's table by its two characters, where a pair not asked about yet is NaN.
export function getKanaKerning(text: string, start: number, at: number, measurement: FontMeasurement, kernings: Float64Array): number {
  const second = text.charCodeAt(at)
  if (second < 0x3041 || second > 0x30ff) return 0
  const first = text.charCodeAt(at - 1)
  if (first < 0x3041 || first > 0x30ff) return 0
  if (at > start) {
    if (!isCanvasWordLetter(second)) return 0
    // What Canvas's word held before the marks that end it.
    let k = at - 1
    let code = first
    while (code >= 0x3041 && code <= 0x30ff && !isCanvasWordLetter(code)) {
      if (k === start) return 0
      code = text.charCodeAt(--k)
    }
    if (code >= 0x2e80 && !isCanvasWordLetter(code)) return 0
  }
  const index = (first - 0x3041) * KANA_COUNT + second - 0x3041
  const kerning = kernings[index]!
  return Number.isNaN(kerning) ? kernings[index] = measureKanaKerning(text.slice(at - 1, at + 1), measurement) : kerning
}

// The kerning of two kana in a row: the two in one string on the context that shapes a string
// whole, less each alone.
function measureKanaKerning(pair: string, measurement: FontMeasurement): number {
  const pairWidth = getWholeRunContext(measurement).measureText(pair).width
  const kerning = pairWidth - getSegmentMetrics(pair[0]!, measurement).width - getSegmentMetrics(pair[1]!, measurement).width
  // As for a character and a space, up to the pair's width / 2^22 is rounding.
  return Math.abs(kerning) <= pairWidth / 0x400000 ? 0 : kerning
}

// A text's width in the font, less the emoji correction.
export function getTextWidth(text: string, measurement: FontMeasurement, emojiCorrection: number): number {
  return getCorrectedSegmentWidth(text, getSegmentMetrics(text, measurement), measurement, emojiCorrection)
}

export function textMayContainEmoji(text: string): boolean {
  return maybeEmojiRe.test(text)
}

export function getEmojiCorrection(font: string, measurement: FontMeasurement): number {
  let correction = measurement.emojiCorrection
  if (correction !== null) return correction

  const fontSize = parseFontSize(font)
  // Canvas's width is there already when an earlier text asked and the page had no box to read.
  const askedBefore = measurement.emojiWidth !== 0
  const canvasW = measurement.emojiWidth = getContext(measurement).measureText('\u{1F600}').width
  correction = 0
  if (canvasW > fontSize + 0.5 && typeof document !== 'undefined') {
    const domW = readEmojiWidth(font)
    // A document with no box for the span, as in an iframe that is display: none, has no
    // width to read. The text goes uncorrected, as in a worker, and nothing is kept: the next
    // text that may hold an emoji asks again.
    if (Number.isNaN(domW)) return 0
    if (canvasW - domW > 0.5) {
      correction = canvasW - domW
      // Advances cut from a segment before this reading hold emoji uncorrected.
      if (askedBefore) {
        for (const metrics of measurement.metrics.values()) metrics.fit = null
        for (const metrics of measurement.followingSpaceMetrics.values()) metrics.fit = null
      }
    }
  }
  measurement.emojiCorrection = correction
  return correction
}

// Canvas reports a width as a 32-bit float (CanvasRenderingContext2D.cpp:5277 in Firefox,
// text_metrics.cc:179 in Chrome), so a few equal advances measure that many times one
// only within that float's rounding, 2^-24 of the width each time one is rounded: 2e-6 px
// over three emoji of a bold font in Firefox 156. Sixteen roundings are allowed for, a
// window far finer than the steps a font's advances come in (RESEARCH.md, Content
// Language And Fonts).
const CANVAS_WIDTH_ROUNDING = 2 ** -20

// What a word's width may differ by from its graphemes' widths added up and still be their sum:
// 2^-17 of the width, which covers the float32 roundings of a word of 96 graphemes, each 2^-24
// of the width at most, and is a tenth of the least kerning of a 2,048-unit font in a 100px word
// at 16px (RESEARCH.md, Break Opportunities From Engine Data).
const WORD_SUM_ROUNDING = 2 ** -17

// How many glyphs of the emoji font draw a text: the emoji font gives every glyph one
// advance, the probe's, so text it draws measures a whole number of them, and none
// where it measures anything else.
function getEmojiGlyphs(text: string, measurement: FontMeasurement): number {
  const width = getSegmentMetrics(text, measurement).width
  const glyphs = Math.round(width / measurement.emojiWidth)
  return Math.abs(width - glyphs * measurement.emojiWidth) <= width * CANVAS_WIDTH_ROUNDING ? glyphs : 0
}

// The characters the emoji font shapes together inside a grapheme: emoji and pictographs,
// the characters that join or modify them (ZWJ, skin tones, tags, U+20E3) and the
// variation selectors. Every emoji character has one of the two properties. A grapheme
// of emojiGraphemeRe holds one.
const emojiStretchRe = /[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0E]+/gu

// The glyphs of the emoji font in a text: what the correction is subtracted for, once
// each. Font fallback decides which font draws an emoji character, and Canvas shows what
// it decided, at one cached Canvas call per distinct stretch of a font. For a character
// with no selector, the named font's own glyph comes before the emoji font's
// (CheckCandidate, gfxTextRun.cpp:3350-3359; FontFallbackIterator::Next,
// font_fallback_iterator.cc:166-178), and U+FE0E asks for a text font
// (gfxTextRun.cpp:3270-3273; SymbolsIterator::Consume, symbols_iterator.cc:67-71). So a
// stretch with a glyph of another font measures as the page draws it: Menlo's own
// U+26A1, Inter's U+2B1C, Hiragino Sans's U+26AA, or U+231A before U+FE0E. A pictograph
// whose presentation is text by default takes the correction with no U+FE0F where only
// the emoji font has it, as U+1F336 in Arial. Two or more glyphs are a sequence the
// emoji font has no glyph for, drawn as its parts.
//
// Each stretch of emoji characters is asked whole, and apart from the rest of its
// grapheme, since each font shapes its own characters together: Firefox matches a font
// character by character (gfxFontGroup::FindFontForChar, gfxTextRun.cpp:3178-3194), and
// Chrome ends a run where emoji give way to text before it shapes
// (RunSegmenter::Consume, run_segmenter.cc:44-73, over SymbolsIterator::Consume,
// symbols_iterator.cc:34-79). So an emoji, a sequence or a flag before a combining mark
// of another script is still one glyph. A stretch that two fonts draw takes no
// correction, as a text font's pictograph joined by a ZWJ to an emoji in Firefox, and a
// stretch asked apart can be another font's than inside its grapheme, as a skin tone
// after a letter in Chrome.
//
// Those and the other gaps are in ENGINE_FOLLOWUPS.md, Emoji correction: another font's
// glyph exactly as wide as an emoji takes the correction, as does Firefox's box for a
// missing glyph at 13px, and an emoji font whose advances vary would take none.
function countEmojiGlyphs(text: string, measurement: FontMeasurement): number {
  const ends = new Int32Array(text.length)
  const graphemeCount = findGraphemeEnds(getEngineProfile().graphemeTable, text, 0, text.length, ends)
  let count = 0
  for (let i = 0, start = 0; i < graphemeCount; start = ends[i++]!) {
    const grapheme = text.slice(start, ends[i])
    if (!emojiGraphemeRe.test(grapheme)) continue
    const stretches = grapheme.match(emojiStretchRe)!
    for (let s = 0; s < stretches.length; s++) count += getEmojiGlyphs(stretches[s]!, measurement)
  }
  return count
}

export function getCorrectedSegmentWidth(seg: string, metrics: SegmentMetrics, measurement: FontMeasurement, emojiCorrection: number): number {
  if (emojiCorrection === 0) return metrics.width
  if (metrics.emojiCount < 0) metrics.emojiCount = countEmojiGlyphs(seg, measurement)
  return metrics.width - metrics.emojiCount * emojiCorrection
}

export function getSegmentFit(
  seg: string,
  metrics: SegmentMetrics,
  measurement: FontMeasurement,
  emojiCorrection: number,
  mode: BreakableFitMode,
  // When metrics measured seg together with one following U+0020, the width of
  // that space alone. The last grapheme then keeps its kerning with the space.
  followingSpaceWidth: number | null = null,
): SegmentFit {
  if (metrics.fit !== null && metrics.fit.mode === mode) return metrics.fit
  const profile = getEngineProfile()
  const ends = new Int32Array(seg.length)
  const count = findGraphemeEnds(profile.graphemeTable, seg, 0, seg.length, ends)
  if (count <= 1) return metrics.fit = { mode, advances: null, lineStartExtras: null }
  let advances: number[]
  let lineStartExtras: number[] | null = null
  // Whether each advance is of a grapheme measured after the one before it alone.
  let pairs = false
  if (mode === 'reshaped-lines') {
    // Blink shapes a line of a cut word again where the cut falls between letters shaped
    // together (EngineProfile's cutWordFit). Premise: a line holds the letters whose width,
    // shaped alone, fits, so the letters after the line's first take the advances they have
    // in the word, and the first its width alone. Premise, taken for speed: a word as wide as
    // its graphemes measured alone has nothing shaped across them, and they are its advances,
    // with nothing more measured. Else each grapheme is measured after the one before it,
    // which every word of the font shares, and where those don't add up to the word either,
    // as in a ligature of three letters or the joined forms of Arabic, the word's prefixes
    // are, up to MAX_PREFIX_FIT_GRAPHEMES (RESEARCH.md, Break Opportunities From Engine Data).
    const width = getCorrectedSegmentWidth(seg, metrics, measurement, emojiCorrection) - (followingSpaceWidth ?? 0)
    const alone = measureFitAdvances(seg, ends, count, 'sum-graphemes', metrics, measurement, emojiCorrection, followingSpaceWidth)
    advances = alone
    if (!addUpTo(alone, width)) {
      advances = measureFitAdvances(seg, ends, count, 'pair-context', metrics, measurement, emojiCorrection, followingSpaceWidth)
      pairs = count > MAX_PREFIX_FIT_GRAPHEMES || addUpTo(advances, width)
      if (!pairs) advances = measureFitAdvances(seg, ends, count, 'segment-prefixes', metrics, measurement, emojiCorrection, followingSpaceWidth)
      lineStartExtras = [0]
      for (let i = 1; i < count; i++) lineStartExtras.push(alone[i]! - advances[i]!)
    }
  } else {
    // Past MAX_PREFIX_FIT_GRAPHEMES, prefixes give way to pairs.
    const prefixes = mode === 'segment-prefixes' && count <= MAX_PREFIX_FIT_GRAPHEMES
    pairs = mode !== 'sum-graphemes' && !prefixes
    advances = measureFitAdvances(seg, ends, count, pairs ? 'pair-context' : mode, metrics, measurement, emojiCorrection, followingSpaceWidth)
    if (prefixes && profile.cutWordKeepsLigatures) countLigaturesOnFirstLetter(seg, ends, advances, measurement, emojiCorrection)
  }
  // Two kana that Canvas shapes apart inside the segment, as in a keep-all group, kern in
  // Blink's layout as two segments do, and a line cut between them is shaped again without
  // the kerning (addKanaKerning in prepare.ts has the rule): one that tightens the pair goes
  // on the second kana's advance, which gives it back where a line starts with it, and one
  // that widens it on the first's. Canvas cuts only before a kana letter, which starts a
  // grapheme. An advance measured after the grapheme before it alone is of a string that
  // starts at that grapheme, and Canvas's words are read from there: a mark that starts
  // it is in one word with the letter after it, whose advance has their kerning already.
  if (profile.kernsAcrossCanvasWords && measurement.kanaKerning !== null && kanaPairRe.test(seg)) {
    const kernings = getFontKanaKerning(measurement)
    if (kernings !== null) {
      for (let g = 1; g < count; g++) {
        const kerning = getKanaKerning(seg, pairs && g > 1 ? ends[g - 2]! : 0, ends[g - 1]!, measurement, kernings)
        if (kerning > 0) {
          advances[g - 1] = advances[g - 1]! + kerning
        } else if (kerning < 0) {
          advances[g] = advances[g]! + kerning
          lineStartExtras ??= zeros(count)
          lineStartExtras[g] = lineStartExtras[g]! - kerning
        }
      }
    }
  }
  return metrics.fit = { mode, advances, lineStartExtras }
}

// Moves the advance of each later letter of a ligature onto the ligature's first letter, in a
// segment's prefix advances, as Gecko counts it where it cuts a word (EngineProfile's
// cutWordKeepsLigatures). A prefix that ends inside a ligature has the first letter's glyph
// alone, so the next letter's advance after that prefix isn't its advance alone, in app units,
// 1/60 px, which Gecko's Canvas reports whole, and there Canvas is asked whether the two are a
// ligature (isLigature). Where a line is narrower than the ligature it starts with, Gecko cuts
// inside it and gives each of its letters an equal share (ComputeLigatureData,
// gfxTextRun.cpp:238-322); here the first letter keeps the whole advance (ENGINE_FOLLOWUPS.md,
// Emergency breaks inside a word).
function countLigaturesOnFirstLetter(seg: string, ends: Int32Array, advances: number[], measurement: FontMeasurement, emojiCorrection: number): void {
  // Text measured under letter spacing has no optional ligature, and a context that can't
  // turn them off can't be asked.
  if (!measurement.state.shapesLetterSpaced || measurement.letterSpacing !== '0px') return
  // The grapheme the ligature that holds the grapheme before this one starts with, or that grapheme.
  let first = 0
  for (let i = 1; i < advances.length; i++) {
    const start = ends[i - 1]!
    const alone = getTextWidth(seg.slice(start, ends[i]), measurement, emojiCorrection)
    if (Math.round((advances[i]! - alone) * 60) !== 0 && isLigature(seg.slice(i === 1 ? 0 : ends[i - 2]!, ends[i]), measurement)) {
      advances[first] = advances[first]! + advances[i]!
      advances[i] = 0
    } else {
      first = i
    }
  }
}

// Whether two neighbouring graphemes are one of the font's optional ligatures: the pair measures
// otherwise without them, as the context shapes text under a letter spacing
// (LETTER_SPACED_SHAPING). Asked of Canvas once per pair and font. A kerned pair, letters that
// join, a mark on its base and a ligature the font requires measure the same, and aren't one.
function isLigature(pair: string, measurement: FontMeasurement): boolean {
  let ligature = measurement.ligaturePairs.get(pair)
  if (ligature === undefined) {
    const context = getContext(measurement)
    const width = getSegmentMetrics(pair, measurement).width
    context.letterSpacing = LETTER_SPACED_SHAPING
    ligature = context.measureText(pair).width !== width
    context.letterSpacing = '0px'
    measurement.ligaturePairs.set(pair, ligature)
  }
  return ligature
}

// Whether a segment's advances add up to its width, within the rounding of Canvas's widths.
function addUpTo(advances: readonly number[], width: number): boolean {
  let sum = 0
  for (let i = 0; i < advances.length; i++) sum += advances[i]!
  return Math.abs(sum - width) <= width * WORD_SUM_ROUNDING
}

// A segment's advances per grapheme: the differences of its prefixes' widths, or each
// grapheme's width alone or, as a pair, after the one before it.
function measureFitAdvances(
  seg: string,
  ends: Int32Array,
  count: number,
  from: 'sum-graphemes' | 'segment-prefixes' | 'pair-context',
  metrics: SegmentMetrics,
  measurement: FontMeasurement,
  emojiCorrection: number,
  followingSpaceWidth: number | null,
): number[] {
  const prefixes = from === 'segment-prefixes'
  const pairs = from === 'pair-context'
  const advances: number[] = []
  let previousStart = 0
  let previousWidth = 0
  for (let i = 0, start = 0; i < count; start = ends[i++]!) {
    const end = ends[i]!
    if (prefixes) {
      // The whole segment is the last prefix; with a following space it was
      // measured together with that space.
      const width = followingSpaceWidth !== null && i === count - 1
        ? getCorrectedSegmentWidth(seg, metrics, measurement, emojiCorrection) - followingSpaceWidth
        : getTextWidth(seg.slice(0, end), measurement, emojiCorrection)
      advances.push(width - previousWidth)
      previousWidth = width
      continue
    }
    const width = getTextWidth(seg.slice(start, end), measurement, emojiCorrection)
    advances.push(pairs && i > 0 ? getTextWidth(seg.slice(previousStart, end), measurement, emojiCorrection) - previousWidth : width)
    previousStart = start
    previousWidth = width
  }
  // Advances that do not end in the whole segment's width take the kerning as a
  // difference, which needs the segment measured alone too.
  if (followingSpaceWidth !== null && !prefixes) {
    advances[count - 1] = advances[count - 1]! + metrics.width - getSegmentMetrics(seg, measurement).width - followingSpaceWidth
  }
  return advances
}

// What preparation measures a font's text through. Text under letter spacing has a
// measurement of its own where the context shapes it as the page does: its widths,
// prefixes and line-edge facts all come from that shaping. The context isn't touched
// here: text that is all in the font's caches measures nothing (getContext).
export function getFontMeasurement(font: string, language: string | null, letterSpaced: boolean): FontMeasurement {
  // Measuring starts here, for a text and for each item of a rich-inline paragraph, with the
  // language the preparation resolved. After that language changes, start again with a new
  // context and empty caches; clearing the caches alone would re-measure with fonts resolved
  // under the old language.
  if (measureState === null || measureState.language !== language) measureState = createMeasureState(language)
  const state = measureState
  const shaped = letterSpaced && state.shapesLetterSpaced
  const fonts = shaped ? state.letterSpacedFonts : state.fonts
  // The first measurement after a lookup sets the font again, the same string too: Firefox's
  // context takes a face added to document.fonts only when its font is assigned, and the
  // question below leaves the context on a font of its own, whether it throws or not.
  state.font = ''
  let measurement = fonts.get(font)
  if (measurement === undefined) {
    const canvasFont = state.genericFamilies === null ? font : getCanvasFont(font, state.genericFamilies)
    if (!contextTakesFont(state.context, canvasFont)) throw new RangeError(`font must be a font string Canvas takes, a size in px then a family, such as 16px Inter, not "${font}"`)
    measurement = { state, canvasFont, letterSpacing: shaped ? LETTER_SPACED_SHAPING : '0px', metrics: new Map(), followingSpaceMetrics: new Map(), spaceKerning: undefined, measuredKana: false, kanaKerning: undefined, kanaFont: canvasFont, emojiCorrection: null, emojiWidth: 0, hyphenText: null, spaceWidth: null, hanKerning: undefined, ligaturePairs: new Map(), glyphCounts: new Map() }
    fonts.set(font, measurement)
  }
  return measurement
}

// Whether a Canvas context takes a font string. A context ignores a string that isn't a CSS font
// shorthand and keeps the font it had (the HTML standard's font setter): a family before its
// size, a string with no family, `var(--font)`, or an empty string, which
// getComputedStyle(element).font is where the element sets a longhand the shorthand can't hold.
// Firefox's OffscreenCanvas also ignores a size relative to a font, such as 1.2em or 120%, which
// it has no element to resolve against (SetFontInternalDisconnected,
// CanvasRenderingContext2D.cpp:4478-4490), and Firefox's and Safari's a system font such as
// `caption` (Firefox 157.0.1, Safari 27.0, 2026-10-11). Every width would then be measured in
// whatever font the context held last, so Pretext refuses such a string rather than guess at it,
// as it refuses a letter spacing that isn't finite (readLetterSpacing). The context is set to a
// font of the question's, then to the caller's, and still reads the first only where the
// caller's was ignored; a caller's font that reads back as the first is asked again after
// another. A context that doesn't read the question's font back as written refuses nothing.
// Only the context's `font` is written and read, no element and no style, and nothing is
// measured. Asked once for each font measurement, never for a text.
function contextTakesFont(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, font: string): boolean {
  context.font = '1px serif'
  context.font = font
  if (context.font !== '1px serif') return true
  context.font = '2px serif'
  context.font = font
  return context.font !== '2px serif'
}

// A context's `lang` follows the page's, and preparation's can be setLocale()'s or Blink's
// default locale instead.
function createContext(language: string | null): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  // jsdom and happy-dom have a document whose canvas gives no 2D context: getContext() returns null there.
  let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
  if (typeof OffscreenCanvas !== 'undefined') context = new OffscreenCanvas(1, 1).getContext('2d')
  else if (typeof document !== 'undefined') context = document.createElement('canvas').getContext('2d')
  if (context === null) throw new Error('Text measurement requires OffscreenCanvas or a DOM canvas context.')
  if (language !== null && 'lang' in context) context.lang = language
  return context
}

function createMeasureState(language: string | null): MeasureState {
  const context = createContext(language)
  const profile = getEngineProfile()
  const takesLetterSpacing = typeof context.letterSpacing === 'string'
  return {
    language,
    context,
    font: '',
    letterSpacing: '0px',
    wholeRunContext: null,
    wholeRunFont: '',
    genericFamilies: language !== null && profile.namesGenericFamiliesByLanguage ? getWebKitGenericFamilies(language, context) : null,
    takesLetterSpacing,
    shapesLetterSpaced: takesLetterSpacing && profile.canvasLetterSpacingDropsLigatures,
    fonts: new Map(),
    letterSpacedFonts: new Map(),
    segments: 0,
  }
}

export function clearMeasurementCaches(): void {
  if (measureState === null) return
  measureState.fonts.clear()
  measureState.letterSpacedFonts.clear()
  measureState.segments = 0
}
