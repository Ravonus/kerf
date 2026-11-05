import { CONTROL, HARD_BREAK, KIND_BITS, ONE_CLUSTER, PRESERVED_SPACE, SOFT_HYPHEN, SPACE, SPACED, TAB, TEXT, ZERO_WIDTH_BREAK, ZERO_WIDTH_GLUE, type SegmentKindCode, type TextAnalysis } from './analysis.js'
import { getEmojiCorrection, getExtraSpacings, getFollowingSpaceMetrics, getFontMeasurement, getFontSpaceKerning, getSegmentFit, getSegmentMetrics, getSpaceKerning, getSpaceWidth, getTextWidth, noExtraSpacings, noSpaceKerning, textMayContainEmoji, zeros, type BreakableFitMode, type EngineProfile, type SegmentMetrics } from './measurement.js'
import { addInternalLetterSpacing, controlCharacterRe, countRenderedSpacingGraphemes, getFollowingSpaceTail, getJoinedNarrowing, getTailKerning, getTextSegmentWidth, isSpaceKind, leadingCombiningMarkRe, mixedDirectionRe, needsComplexTextPath, numericRunRe } from './prepare-common.js'
import { ANY_SCRIPT, getUnspacedGraphemes, mayHoldCursive, spaceSharesScriptRun, type ScriptRuns } from './prepare-script.js'
import type { ParagraphLists } from './prepare.js'

// The measured text and where it starts in the analysis's: what is asked of the whole text
// is asked of it, and places in it count from its start.
// A text's lists are made here, where they are filled, and not by its caller: V8 types a
// list by what the `[]` that made it has seen, and with every caller making them, in a loop
// that pushed, Chrome prepared long texts 5-11% slower and Firefox walked CJK lines 12%
// slower. A paragraph's lists are its caller's, and the measuring loop below stores by index
// for them. With those stores a text's lists made by its caller weren't timed, so whether
// they still have to be made here isn't known (RESEARCH.md, Keeping Work Bounded, JavaScript
// Engines, under A list made where it is filled).
// An engine's scan makes one prepared segment per analysis segment, whose flags the
// walkers, layout()'s count and rich-inline layout read where the scan gives no break.
// Where the first measured segment goes in the lists.
// Whether the text holds a U+0020. Only then can a space follow one of its text segments
// (getFollowingSpaceTail), so a text of none, as most CJK paragraphs are, doesn't look for
// one after each segment.
// The font's space, asked for only by a text that holds a space or a tab. A web font split by
// unicode-range has the part with U+0020 loaded only once a text that holds a character of
// that part was loaded for (document.fonts.load(font, text)), so a text of other characters
// alone, a CJK label or one Cyrillic word, would measure the fallback font's space and the
// font would keep it for every later text.
// The advance between tab stops: eight spaces, each with its letter spacing where the
// engine counts it (EngineProfile's letterSpaceTabStops). Gecko rounds the space and the
// letter spacing to app units, sixtieths of a pixel, each on its own
// (ComputeTabWidthAppUnits, nsTextFrame.cpp:3875-3906).
// The least a tab advances, measured at a text's first tab (EngineProfile's tabMinimumCharacter).
// The font's kerning with the space where words take Blink's kerning with the spaces beside
// them, or null. Blink shapes nothing across a change of direction
// (ShouldBreakShapingBeforeText, inline_node.cc:472-490), and which spaces share a word's
// direction depends on the paragraph's, which preparation can't see, so text with a
// right-to-left letter or an explicit bidi control takes none.
// What the word before a space adds to that space, the next segment.
// Whether the text may hold graphemes that take no letter spacing in this engine.
// Text of the simple walkers' kinds without letter spacing. They lay it out where
// the scan breaks at every segment boundary, and layout() counts it with the
// simple stepper where it doesn't (countPreparedLines).
// WebKit's return from an unfit hyphen fits each side as measured alone (getJoinedNarrowing).
export function createMeasurement(
  analysis: TextAnalysis,
  from: number,
  to: number,
  font: string,
  includeSegments: boolean,
  letterSpacing: number,
  engineProfile: EngineProfile,
  language: string | null,
  overflowBreaks: boolean,
  paragraph: ParagraphLists | null,
) {
  const { normalized, texts, starts, flags } = analysis
  const ownStart = from === 0 ? 0 : starts[from]!
  const own = from === 0 && to === flags.length ? normalized : to === from + 1 ? texts[from]! : normalized.slice(ownStart, to < flags.length ? starts[to]! : normalized.length)
  const widths: number[] = paragraph === null ? [] : paragraph.widths
  const segmentFlags = paragraph === null ? new Uint8Array(to - from) : paragraph.segmentFlags
  const breakableFitAdvances: (number[] | null)[] = paragraph === null ? [] : paragraph.breakableFitAdvances
  const segments = includeSegments ? [] as string[] : null
  const base = widths.length
  const hasLetterSpacing = letterSpacing !== 0
  const fontMeasurement = getFontMeasurement(font, language, hasLetterSpacing)
  const emojiCorrection = textMayContainEmoji(own) ? getEmojiCorrection(font, fontMeasurement) : 0
  const hasSpace = own.includes(' ')
  const spaceWidth = hasSpace || own.includes('\t') ? getSpaceWidth(fontMeasurement) : 0
  const tabStopSpacing = engineProfile.letterSpaceTabStops ? letterSpacing : 0
  const tabStopAdvance = engineProfile.tabsInAppUnits
    ? (Math.round(spaceWidth * 60) + Math.round(tabStopSpacing * 60)) * 8 / 60
    : (spaceWidth + tabStopSpacing) * 8

  let fontSpaceKerning = engineProfile.kernsAcrossCanvasWords && own.includes(' ') ? getFontSpaceKerning(fontMeasurement) : null
  if (fontSpaceKerning !== null && mixedDirectionRe.test(own)) fontSpaceKerning = null
  const scriptRuns: ScriptRuns = { read: 0, scripts: ANY_SCRIPT, openBrackets: [] }

  const cursiveSpacing = hasLetterSpacing && engineProfile.unspacedCursive !== 'none' && mayHoldCursive(own)

  const returnFitsEachSideAlone = engineProfile.unfitHyphenRetreat === 'full-width-or-first'

  return {
    analysis,
    from,
    to,
    own,
    ownStart,
    widths,
    segmentFlags,
    breakableFitAdvances,
    segments,
    base,
    hasLetterSpacing,
    fontMeasurement,
    emojiCorrection,
    hasSpace,
    spaceWidth,
    tabStopAdvance,
    minimumTabAdvance: 0,
    fontSpaceKerning,
    scriptRuns,
    spaceShare: 0,
    cursiveSpacing,
    simpleKinds: !hasLetterSpacing,
    breakableLineStartExtras: null as (number[] | null)[] | null,
    discretionaryHyphenContexts: null as number[] | null,
    previousJoinablePiece: null as string | null,
    previousJoinableMetrics: null as SegmentMetrics | null,
    returnFitsEachSideAlone,
    engineProfile,
    letterSpacing,
    overflowBreaks,
    texts,
    starts,
    flags,
    width: 0,
    spacingGraphemeCount: 0,
    fitAdvances: null as number[] | null,
    unspaced: null as number[] | null,
    extraSpacings: noExtraSpacings,
  }
}

type MeasureState = ReturnType<typeof createMeasurement>

function textKerning(ctx: MeasureState, mi: number, at: number, text: string, textMetrics: SegmentMetrics, followingSpaceKerning: number): number {
  const { fontSpaceKerning, from, to, flags, fontMeasurement, scriptRuns, own, starts, ownStart, widths } = ctx
  const spaceBefore = mi > from && isSpaceKind(flags[mi - 1]! & KIND_BITS)
  const spaceAfter = mi + 1 < to && isSpaceKind(flags[mi + 1]! & KIND_BITS)
  if (spaceBefore || spaceAfter) {
    const kerning = textMetrics.spaceKerning ?? getSpaceKerning(text, textMetrics, fontMeasurement, fontSpaceKerning!)
    if (spaceAfter) {
      // Premise: a kerning that tightens the word and the space after it goes on the
      // space, which hangs, so a line that ends there has the word without it, as in
      // Blink under a text-align other than start and for text whose element has a
      // decoration or a background (NeedsAccurateEndPosition, line_breaker.cc:255-268).
      // One that widens stays on the word, whose end Blink finds in the run shaped
      // whole. In other text a line's last word is wider here than there by the
      // kerning, never narrower (RESEARCH.md, Kerning At Line Edges).
      followingSpaceKerning = Math.max(kerning.after, 0)
      ctx.spaceShare = Math.min(kerning.after, 0)
    }
    // The space takes its kerning with this word, and takes it along where it hangs: a
    // line that breaks between the two is shaped again without it
    // (shaping_line_breaker.cc:307-324). Preserved spaces that start the text or follow
    // a forced break are a Blink item of their own (inline_items_builder.cc:988-1034),
    // which kerns with nothing.
    if (spaceBefore && kerning.before !== 0 &&
      !((flags[mi - 1]! & KIND_BITS) === PRESERVED_SPACE && (mi === from + 1 || (flags[mi - 2]! & KIND_BITS) === HARD_BREAK)) &&
      spaceSharesScriptRun(scriptRuns, own, starts[mi]! - ownStart, starts[mi]! - ownStart + text.length)) {
      widths[at - 1] = widths[at - 1]! + kerning.before
    }
  }
  return followingSpaceKerning
}

function textSpacing(ctx: MeasureState, mi: number, kind: SegmentKindCode, text: string, textMetrics: SegmentMetrics): void {
  const { fontMeasurement, engineProfile, cursiveSpacing, own, starts, ownStart, scriptRuns, letterSpacing } = ctx
  // The walkers put a gap after every grapheme of a spaced segment, so a grapheme
  // the engine gives none takes one back from its advance, here and in the advances
  // a break inside the segment falls by, and one whose glyphs WebKit gives more or
  // fewer takes the difference (EngineProfile's letterSpacesGlyphs), in text of its
  // complex path.
  ctx.unspaced = null
  ctx.extraSpacings = noExtraSpacings
  ctx.spacingGraphemeCount = countRenderedSpacingGraphemes(text, kind, engineProfile.graphemeTable)
  if (cursiveSpacing) {
    ctx.unspaced = getUnspacedGraphemes(own, starts[mi]! - ownStart, starts[mi]! - ownStart + text.length, engineProfile.graphemeTable, engineProfile.unspacedCursive === 'run' ? scriptRuns : null)
    if (ctx.unspaced !== null) ctx.width -= ctx.unspaced.length * letterSpacing
  }
  if (engineProfile.letterSpacesGlyphs) {
    ctx.extraSpacings = textMetrics.extraSpacings ??= needsComplexTextPath(text) ? getExtraSpacings(text, fontMeasurement) : noExtraSpacings
    for (let k = 0; k < ctx.extraSpacings.length; k++) ctx.width += ctx.extraSpacings[k]! * letterSpacing
  }
}

function measureControl(ctx: MeasureState, mi: number, text: string): void {
  const { from, to, texts, flags, fontMeasurement, emojiCorrection, hasLetterSpacing } = ctx
  ctx.width = getTextWidth(text, fontMeasurement, emojiCorrection)
  // NEL shares a WebKit text item with the text before it and with
  // combining marks after it, and the complex text path spaces it. Complex
  // text shares the item only when its direction matches the page's, which
  // preparation cannot see, so NEL next to complex text keeps its spacing.
  const nextText = mi + 1 < to ? texts[mi + 1]! : ''
  if (hasLetterSpacing && (
    (mi > from && (flags[mi - 1]! & KIND_BITS) === TEXT && needsComplexTextPath(texts[mi - 1]!)) ||
    (leadingCombiningMarkRe().test(nextText) && needsComplexTextPath(nextText))
  )) ctx.spacingGraphemeCount = 1
}

function adjustAdvances(ctx: MeasureState, followingSpaceKerning: number, extraSpacings: number[], unspaced: number[] | null, letterSpacing: number): void {
  // The cached advances are shared by every occurrence of this text; only
  // the final grapheme touches the following space.
  if (followingSpaceKerning !== 0) {
    ctx.fitAdvances = ctx.fitAdvances!.slice()
    ctx.fitAdvances![ctx.fitAdvances!.length - 1] = ctx.fitAdvances![ctx.fitAdvances!.length - 1]! + followingSpaceKerning
  }
  if (extraSpacings.length !== 0) {
    ctx.fitAdvances = ctx.fitAdvances!.slice()
    for (let k = 0; k < extraSpacings.length; k++) ctx.fitAdvances![k] = ctx.fitAdvances![k]! + extraSpacings[k]! * letterSpacing
  }
  if (unspaced !== null) {
    ctx.fitAdvances = ctx.fitAdvances!.slice()
    for (let k = 0; k < unspaced.length; k++) ctx.fitAdvances![unspaced[k]!] = ctx.fitAdvances![unspaced[k]!]! - letterSpacing
  }
}

function storeHyphenContext(ctx: MeasureState, mi: number, kind: SegmentKindCode, text: string): void {
  const { analysis, from, to, engineProfile, fontMeasurement, emojiCorrection, returnFitsEachSideAlone } = ctx
  // Contexts for every segment of soft hyphens, whatever its kind here, one that is glue
  // too, where the scan gives no break after it: a handle with contexts is one whose lines
  // return from an unfit hyphen, measured below.
  if (kind !== TEXT && text.charCodeAt(0) === 0xAD) {
    ctx.discretionaryHyphenContexts ??= zeros(mi - from)
    ctx.discretionaryHyphenContexts[mi - from] = returnFitsEachSideAlone ? 0 : getJoinedNarrowing(analysis, mi, to, ctx.previousJoinablePiece, ctx.previousJoinableMetrics, fontMeasurement, emojiCorrection, engineProfile.lineFitEpsilon)
  } else if (ctx.discretionaryHyphenContexts !== null) {
    ctx.discretionaryHyphenContexts[mi - from] = 0
  }
}

function textFitMode(text: string, textMetrics: SegmentMetrics, letterSpacing: number, engineProfile: EngineProfile): BreakableFitMode {
  return letterSpacing !== 0 ? 'segment-prefixes'
    : numericRunRe.test(text) ? 'pair-context'
    : textMetrics.width < engineProfile.prefixFitMinWidth ? 'sum-graphemes'
    : engineProfile.cutWordFit
}

export function measureSegments(ctx: MeasureState): void {
  const { analysis, from, to, texts, flags, engineProfile, fontMeasurement, emojiCorrection, hasLetterSpacing, widths, segmentFlags, breakableFitAdvances, segments, letterSpacing, hasSpace, spaceWidth, fontSpaceKerning, overflowBreaks } = ctx
  for (let mi = from, at = ctx.base; mi < to; mi++, at++) {
    const text = texts[mi]!
    const segment = flags[mi]!
    const kind = (segment & KIND_BITS) as SegmentKindCode
    ctx.width = 0
    ctx.spacingGraphemeCount = 0
    ctx.fitAdvances = null
    switch (kind) {
      case TEXT: {
        // A control the engine hides takes no advance, only letter spacing.
        if (engineProfile.hidesControlCharacters && controlCharacterRe.test(text)) {
          ctx.spacingGraphemeCount = 1
          break
        }
        // With an empty following-space tail, the text is measured together with the space,
        // so its kerned width costs no extra Canvas call, and other occurrences of the same
        // text measure it alone; with a zero-width tail, the item's kerning is added.
        const followingSpaceTail = engineProfile.measureTextWithFollowingSpace && hasSpace ? getFollowingSpaceTail(analysis, mi, to) : null
        const measuredWithSpace = followingSpaceTail === ''
        const textMetrics = measuredWithSpace ? getFollowingSpaceMetrics(text, fontMeasurement) : getSegmentMetrics(text, fontMeasurement)
        ctx.previousJoinablePiece = text
        ctx.previousJoinableMetrics = textMetrics
        let followingSpaceKerning = followingSpaceTail === null || measuredWithSpace ? 0 : getTailKerning(text + followingSpaceTail, fontMeasurement, spaceWidth)

        if (fontSpaceKerning !== null && textMetrics.spaceKerning !== noSpaceKerning) {
          followingSpaceKerning = textKerning(ctx, mi, at, text, textMetrics, followingSpaceKerning)
        }
        ctx.width = getTextSegmentWidth(text, textMetrics, fontMeasurement, emojiCorrection, measuredWithSpace ? spaceWidth : 0, followingSpaceKerning)
        let unspaced: number[] | null = null
        let extraSpacings = noExtraSpacings
        if (hasLetterSpacing) {
          textSpacing(ctx, mi, kind, text, textMetrics)
          unspaced = ctx.unspaced as number[] | null
          extraSpacings = ctx.extraSpacings
        }
        // Under break-word, Blink retries an overflowing line with a break allowed between
        // any two graphemes (line_breaker.cc), WebKit searches the word's grapheme prefixes
        // (TextUtil::breakWord) and Gecko may wrap before any cluster (gfxTextRun.cpp:1069-1072),
        // so every text segment takes emergency grapheme breaks, unless it is one Gecko cluster
        // or an atomic item's.
        if (!overflowBreaks || (segment & ONE_CLUSTER) !== 0 || text.length === 1) break
        const fitMode = textFitMode(text, textMetrics, letterSpacing, engineProfile)
        const fit = getSegmentFit(text, textMetrics, fontMeasurement, emojiCorrection, fitMode, measuredWithSpace ? spaceWidth : null)
        ctx.fitAdvances = fit.advances
        if (ctx.fitAdvances === null) break
        // A difference from the advance, so it holds whatever the advances take below.
        if (fit.lineStartExtras !== null) (ctx.breakableLineStartExtras ??= new Array<number[] | null>(to - from).fill(null))[mi - from] = fit.lineStartExtras
        adjustAdvances(ctx, followingSpaceKerning, extraSpacings, unspaced, letterSpacing)
        break
      }
      case SPACE:
      case PRESERVED_SPACE:
      case ZERO_WIDTH_BREAK:
        ctx.width = getTextWidth(text, fontMeasurement, emojiCorrection) + ctx.spaceShare
        ctx.spaceShare = 0
        if (hasLetterSpacing) ctx.spacingGraphemeCount = countRenderedSpacingGraphemes(text, kind, engineProfile.graphemeTable)
        break
      case TAB:
        if (engineProfile.letterSpaceTabs) ctx.spacingGraphemeCount = 1
        if (ctx.minimumTabAdvance === 0) ctx.minimumTabAdvance = getTextWidth(engineProfile.tabMinimumCharacter, fontMeasurement, emojiCorrection) / 2
        break
      case CONTROL:
        measureControl(ctx, mi, text)
        break
      case SOFT_HYPHEN:
      case ZERO_WIDTH_GLUE:
      case HARD_BREAK:
        break
    }
    if (kind !== TEXT && kind !== SPACE && kind !== ZERO_WIDTH_BREAK) ctx.simpleKinds = false
    if (kind !== TEXT && kind !== SOFT_HYPHEN) ctx.previousJoinablePiece = null
    segmentFlags[at] = (segment & ~ONE_CLUSTER) | (hasLetterSpacing && ctx.spacingGraphemeCount > 0 ? SPACED : 0)
    widths[at] = addInternalLetterSpacing(ctx.width, ctx.spacingGraphemeCount, letterSpacing)
    breakableFitAdvances[at] = ctx.fitAdvances
    if (segments !== null) segments[mi - from] = text
    storeHyphenContext(ctx, mi, kind, text)
  }
}
