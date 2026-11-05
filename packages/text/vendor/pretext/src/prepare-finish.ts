import { getHanKerningTrims, textMayHanKern, type HanKerningTrims } from './han-kerning.js'
import { HARD_BREAK, KIND_BITS, SPACE, TEXT, UNBROKEN, type TextAnalysis } from './analysis.js'
import { getFontKanaKerning, getHyphenText, getKanaKerning, getSegmentMetrics, getTextWidth, kanaPairRe, zeros, type EngineProfile, type FontMeasurement } from './measurement.js'
import type { PreparedText } from './layout.js'
import type { PreparedLineBreakData } from './line-break.js'
import type { PreparedSegments } from './line-text.js'

// Measures segments [from, to) of an analysis in a font, alone: all of a text's, or those of one
// item of a rich-inline paragraph (RESEARCH.md, Rich Inline As One Paragraph), where only the
// marks Blink halts and a run of U+3000 read the text around the item (getHanKerningTrims,
// addIdeographicSpaceHangs). Each segment's width, flags byte and advances go on the end of
// three lists: a text's own, or for an item its paragraph's, so an item is measured with no
// copy of its part of the analysis and no lists of its own to copy from. The handle returned
// holds those lists; what else it holds is the measured segments' alone, each list from the
// first of them.
export const finishMeasurement = (
  analysis: TextAnalysis,
  from: number,
  to: number,
  own: string,
  fontMeasurement: FontMeasurement,
  engineProfile: EngineProfile,
  letterSpacing: number,
  emojiCorrection: number,
  widths: number[],
  base: number,
  segmentFlags: Uint8Array,
  simpleKinds: boolean,
  breakableFitAdvances: (number[] | null)[],
  breakableLineStartExtras: (number[] | null)[] | null,
  discretionaryHyphenContexts: number[] | null,
  tabStopAdvance: number,
  minimumTabAdvance: number,
  segments: string[] | null,
): (PreparedText & PreparedLineBreakData) | (PreparedText & PreparedSegments) => {
  // The hyphen a chosen soft hyphen paints, which only a text that holds one asks for, with
  // the gap before it, plus the hyphen's own spacing where the engine letter-spaces it.
  const hyphenText = discretionaryHyphenContexts === null ? '-' : engineProfile.hyphenFromPrimaryFont ? getHyphenText(fontMeasurement) : '\u2010'
  const discretionaryHyphenWidth = getTextWidth(hyphenText, fontMeasurement, emojiCorrection) +
    (letterSpacing === 0 ? 0 : letterSpacing * (engineProfile.letterSpaceDiscretionaryHyphen ? 2 : 1))

  // A segment's width is its width between the text before and after it; one that starts
  // a line takes back the halt Blink gives its first character there.
  let hanKerning: HanKerningTrims = { widthTrims: null, lineStartExtras: null, lineEndTrims: null, overflowLineEndTrims: null }
  if (engineProfile.hanKerning && textMayHanKern(own)) {
    hanKerning = getHanKerningTrims(fontMeasurement, analysis, from, to)
    const trims = hanKerning.widthTrims
    if (trims !== null) for (let i = 0; i < trims.length; i++) widths[base + i] = widths[base + i]! - trims[i]!
  }
  // The loop above has measured every segment in the font, so text in a font that has measured
  // no kana, as in one that has answered that it kerns none, isn't looked through for kana.
  let lineStartExtras = hanKerning.lineStartExtras
  if (engineProfile.kernsAcrossCanvasWords && fontMeasurement.measuredKana && fontMeasurement.kanaKerning !== null && kanaPairRe.test(own)) {
    const kanaKerning = getFontKanaKerning(fontMeasurement)
    if (kanaKerning !== null) lineStartExtras = addKanaKerning(lineStartExtras, widths, base, analysis, from, to, fontMeasurement, kanaKerning)
  }
  let lineEndTrims = hanKerning.lineEndTrims
  if (engineProfile.hangsIdeographicSpace && own.includes('\u3000')) {
    lineEndTrims = addIdeographicSpaceHangs(lineEndTrims, analysis, fontMeasurement, letterSpacing, discretionaryHyphenWidth, from, to)
  }
  const prepared = {
    widths,
    segmentFlags,
    simpleLineWalkFastPath: simpleKinds && !analysis.hasUnbroken,
    simpleLineCountFastPath: simpleKinds,
    breakableFitAdvances,
    letterSpacing,
    discretionaryHyphenWidth,
    discretionaryHyphenContexts,
    breakableLineStartExtras,
    lineStartExtras,
    lineEndTrims,
    overflowLineEndTrims: hanKerning.overflowLineEndTrims,
    tabStopAdvance,
    minimumTabAdvance,
  } satisfies PreparedLineBreakData as unknown as PreparedText & PreparedSegments
  if (segments !== null) prepared.segments = segments
  return prepared
}

// Blink's layout shapes a run of one script in one call and takes katakana for hiragana, so
// that the two stay in one run (GetScriptForOpenType, script_run_iterator.cc:20-36), so a kana
// kerns with the kana after it in fonts that pair them, as Hiragino Sans and Hiragino Mincho
// ProN do (GPOS pair positioning). Canvas cuts the two apart and preparation measures segments
// apart, so each such pair's kerning (getKanaKerning) is added here, for a font that kerns
// kana (getFontKanaKerning). The adjustment sits on the pair's first glyph, and a line that
// breaks between the two is shaped again without it (ShapingLineBreaker::ShapeLine,
// shaping_line_breaker.cc:511-584): one that tightens the pair goes on the second kana's
// segment, which gives it back where it starts a line. One that widens it stays on the first
// kana's, since Blink looks for a line's end in the run shaped whole
// (shaping_line_breaker.cc:325-333), where the first kana has it. A segment cut between two of
// its kana takes the same in its advances (getSegmentFit). `widths` holds segments [from, to)
// of the analysis from `base`, a rich-inline item's in its paragraph's, and `extras` holds
// them from index 0; a kana that starts an item takes no kerning with the item before it.
function addKanaKerning(extras: number[] | null, widths: number[], base: number, analysis: TextAnalysis, from: number, to: number, measurement: FontMeasurement, kernings: Float64Array): number[] | null {
  const { normalized, starts, flags } = analysis
  for (let i = from; i < to; i++) {
    if ((flags[i]! & KIND_BITS) !== TEXT) continue
    const start = starts[i]!
    const end = i + 1 < flags.length ? starts[i + 1]! : normalized.length
    const at = base + i - from
    for (let k = i > from ? start : start + 1; k < end; k++) {
      const kerning = getKanaKerning(normalized, start, k, measurement, kernings)
      if (kerning === 0) continue
      if (k > start) {
        widths[at] = widths[at]! + kerning
      } else if (kerning > 0) {
        widths[at - 1] = widths[at - 1]! + kerning
      } else {
        widths[at] = widths[at]! + kerning
        extras ??= zeros(to - from)
        extras[i - from] = extras[i - from]! - kerning
      }
    }
  }
  return extras
}

// Blink (Chrome 153) hangs a run of U+3000 that ends a line, as it hangs spaces: ShapingLineBreaker
// counts U+3000 as a breakable space (IsBreakableSpace, shaping_line_breaker.cc:38-41, with
// Character::IsOtherSpaceSeparator, character.h:156-158), so a line whose width runs out on
// the run ends after it and fits without it (shaping_line_breaker.cc:384-452), and the line
// breaker keeps the run as trailing space (HandleTrailingSpaces, line_breaker.cc:2447-2514),
// in normal and pre-wrap white space alike. A text segment that ends in such a run, where a
// line can end after it or a collapsible space follows, which hangs with it, drops the run
// and its letter spacing at a line end. The line then ends where the run starts
// (shaping_line_breaker.cc:490-493), so after a soft hyphen it ends with a hyphen
// (SetBreakOffset, shaping_line_breaker.cc:212-216), which has to fit. Gecko (Firefox 156)
// marks U+3000 as a space glyph, like SPACE (SetupClusterBoundaries, gfxFont.cpp:749-750), and
// BreakAndMeasureText fits a line without its trailing space glyphs (gfxTextRun.cpp:1152-1160,
// 1175), so Firefox hangs the run too. `trims` holds segments [from, to) of the analysis, a
// rich-inline item's in its paragraph's, from index 0. A run that ends an item hangs whatever
// the next item starts with, as the engines hang it wherever a line ends; a text's run before
// a ZWSP, a soft hyphen or a character no line starts with doesn't yet (ENGINE_FOLLOWUPS.md,
// Line edges).
function addIdeographicSpaceHangs(
  trims: number[] | null,
  analysis: TextAnalysis,
  measurement: FontMeasurement,
  letterSpacing: number,
  hyphenWidth: number,
  from: number,
  to: number,
): number[] | null {
  const { normalized, starts, flags } = analysis
  for (let i = from; i < to; i++) {
    const end = i + 1 < flags.length ? starts[i + 1]! : normalized.length
    if ((flags[i]! & KIND_BITS) !== TEXT || normalized.charCodeAt(end - 1) !== 0x3000) continue
    if (i + 1 < to) {
      const next = flags[i + 1]! & KIND_BITS
      if (next !== HARD_BREAK && next !== SPACE && !(next === TEXT && (flags[i + 1]! & UNBROKEN) === 0)) continue
    }
    let start = end - 1
    while (start > starts[i]! && normalized.charCodeAt(start - 1) === 0x3000) start--
    const run = normalized.slice(start, end)
    const afterSoftHyphen = i > 0 && start === starts[i] && normalized.charCodeAt(start - 1) === 0xAD
    const hang = getSegmentMetrics(run, measurement).width + run.length * letterSpacing - (afterSoftHyphen ? hyphenWidth : 0)
    if (hang <= 0) continue
    trims ??= zeros(to - from)
    trims[i - from] = trims[i - from]! + hang
  }
  return trims
}
